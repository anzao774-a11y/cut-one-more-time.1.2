
import * as THREE from "three";

import { cuttingUI } from "./cutting-ui.js";
import { inventory3DPreview } from "./inventory-3d-preview.js";
import { meshGeometryUtils } from "../systems/mesh-geometry-utils.js";


// ======================================================
// 共用工具
// ======================================================

function cloneMesh(mesh) {
    return {
        vertices: mesh.vertices.map(vertex => [...vertex]),
        faces: mesh.faces.map(face => [...face])
    };
}


function hashString(value) {
    let hash = 2166136261;

    for (const char of String(value)) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
}


function seededRandom(seed) {
    let value = seed >>> 0;

    return function () {
        value += 0x6D2B79F5;

        let t = value;

        t = Math.imul(
            t ^ (t >>> 15),
            t | 1
        );

        t ^= t + Math.imul(
            t ^ (t >>> 7),
            t | 61
        );

        return (
            (t ^ (t >>> 14)) >>> 0
        ) / 4294967296;
    };
}


function normalize(vector) {
    const length = Math.hypot(...vector);

    if (!Number.isFinite(length) || length < 1e-10) {
        throw new Error("切割法線無效。");
    }

    return vector.map(value => value / length);
}


function getPlaneDistance(vertex, plane) {
    return (
        (vertex[0] - plane.point[0]) * plane.normal[0] +
        (vertex[1] - plane.point[1]) * plane.normal[1] +
        (vertex[2] - plane.point[2]) * plane.normal[2]
    );
}


function getSidePlane(result, side) {
    const source = result?.cutPlane;

    if (
        !source ||
        !Array.isArray(source.point) ||
        !Array.isArray(source.normal)
    ) {
        throw new Error("缺少有效切割平面。");
    }

    const normal = normalize(source.normal);

    const thickness = Math.max(
        0,
        Number(result.bladeThickness) || 0
    );

    const half = thickness / 2;

    const direction = side === "positive" ? 1 : -1;

    const point = source.point.map(
        (value, axis) =>
            value + normal[axis] * half * direction
    );

    return {
        point,
        normal,
        keepPositive: side === "positive",

        outwardNormal: side === "positive"
            ? normal.map(value => -value)
            : [...normal]
    };
}


// ======================================================
// 擷取切面三角形
// ======================================================

function extractCapTriangles(mesh, plane) {
    if (
        !mesh ||
        !Array.isArray(mesh.vertices) ||
        !Array.isArray(mesh.faces)
    ) {
        return [];
    }

    const bounds = meshGeometryUtils.getBounds(mesh);

    const diagonal = Math.hypot(...bounds.size);

    const tolerance = Math.max(
        1e-7,
        diagonal * 0.00002
    );

    const triangles = [];

    for (const face of mesh.faces) {
        const vertices = face.map(
            index => mesh.vertices[index]
        );

        if (
            vertices.length !== 3 ||
            vertices.some(vertex =>
                !vertex ||
                !vertex.every(Number.isFinite)
            )
        ) {
            continue;
        }

        const distances = vertices.map(
            vertex => getPlaneDistance(vertex, plane)
        );

        if (
            distances.every(distance =>
                Math.abs(distance) <= tolerance
            )
        ) {
            triangles.push(
                vertices.map(vertex => [...vertex])
            );
        }
    }

    return triangles;
}


// ======================================================
// 將舊切面裁切至新模型
// ======================================================

function intersectSegment(a, b, da, db) {
    const denominator = da - db;

    if (Math.abs(denominator) < 1e-12) {
        return [...a];
    }

    const t = da / denominator;

    return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t
    ];
}


function clipTriangle(triangle, plane, keepPositive) {
    const epsilon = 1e-8;

    const input = triangle.map(vertex => ({
        vertex: [...vertex],
        distance: getPlaneDistance(vertex, plane)
    }));

    const polygon = [];

    for (let i = 0; i < input.length; i++) {
        const current = input[i];

        const next = input[
            (i + 1) % input.length
        ];

        const currentInside = keepPositive
            ? current.distance >= -epsilon
            : current.distance <= epsilon;

        const nextInside = keepPositive
            ? next.distance >= -epsilon
            : next.distance <= epsilon;

        if (currentInside && nextInside) {
            polygon.push([...next.vertex]);

        } else if (currentInside && !nextInside) {
            polygon.push(
                intersectSegment(
                    current.vertex,
                    next.vertex,
                    current.distance,
                    next.distance
                )
            );

        } else if (!currentInside && nextInside) {
            polygon.push(
                intersectSegment(
                    current.vertex,
                    next.vertex,
                    current.distance,
                    next.distance
                )
            );

            polygon.push([...next.vertex]);
        }
    }

    if (polygon.length < 3) {
        return [];
    }

    const triangles = [];

    for (let i = 1; i < polygon.length - 1; i++) {
        triangles.push([
            [...polygon[0]],
            [...polygon[i]],
            [...polygon[i + 1]]
        ]);
    }

    return triangles;
}


function clipHistory(history, sidePlane) {
    if (!Array.isArray(history)) {
        return [];
    }

    const result = [];

    for (const entry of history) {
        if (!Array.isArray(entry.triangles)) {
            continue;
        }

        const triangles = [];

        for (const triangle of entry.triangles) {
            triangles.push(
                ...clipTriangle(
                    triangle,
                    sidePlane,
                    sidePlane.keepPositive
                )
            );
        }

        if (triangles.length === 0) {
            continue;
        }

        result.push({
            ...entry,
            triangles
        });
    }

    return result;
}


function createCutHistoryEntry(
    triangles,
    outwardNormal,
    id,
    kind,
    jadeType = null
) {
    if (!triangles.length) {
        return null;
    }

    return {
        id,
        kind,
        jadeType,
        outwardNormal: [...outwardNormal],

        triangles: triangles.map(triangle =>
            triangle.map(vertex => [...vertex])
        )
    };
}


// ======================================================
// 玉料體積與位置
// ======================================================

function boxesOverlap(a, b, gap = 0.015) {
    for (let axis = 0; axis < 3; axis++) {
        if (
            a.max[axis] + gap <= b.min[axis] ||
            b.max[axis] + gap <= a.min[axis]
        ) {
            return false;
        }
    }

    return true;
}


function getBox(mesh) {
    return meshGeometryUtils.getBounds(mesh);
}


function translateToCenter(mesh, center) {
    const bounds = getBox(mesh);

    const offset = center.map(
        (value, axis) => value - bounds.center[axis]
    );

    return meshGeometryUtils.translate(
        mesh,
        offset
    );
}


function isInsideHostBounds(mesh, hostBounds, margin = 0.005) {
    const bounds = getBox(mesh);

    return bounds.min.every((value, axis) =>
        value >= hostBounds.min[axis] + margin &&
        bounds.max[axis] <= hostBounds.max[axis] - margin
    );
}


function createPlacementCandidates(hostBounds, preferred, random) {
    const levels = [
        0.12,
        0.22,
        0.32,
        0.42,
        0.5,
        0.58,
        0.68,
        0.78,
        0.88
    ];

    const candidates = [];

    for (const x of levels) {
        for (const y of levels) {
            for (const z of levels) {
                candidates.push([
                    hostBounds.min[0] + hostBounds.size[0] * x,
                    hostBounds.min[1] + hostBounds.size[1] * y,
                    hostBounds.min[2] + hostBounds.size[2] * z
                ]);
            }
        }
    }

    const ranked = candidates.map(position => ({
        position,

        distance:
            position.reduce((sum, value, axis) => {
                const normalized =
                    (value - hostBounds.min[axis]) /
                    Math.max(hostBounds.size[axis], 1e-9);

                return sum +
                    Math.pow(normalized - preferred[axis], 2);
            }, 0) +
            random() * 0.0001
    }));

    ranked.sort((a, b) =>
        a.distance - b.distance
    );

    return ranked.map(item => item.position);
}


function createExactVolumePlacement(
    sourceStone,
    mass,
    index,
    hostBounds,
    occupied
) {
    const sourceGeometry = mass?.geometry;

    if (
        !sourceGeometry ||
        !Array.isArray(sourceGeometry.vertices) ||
        !Array.isArray(sourceGeometry.faces)
    ) {
        throw new Error(
            `玉料「${mass?.name ?? index + 1}」缺少有效幾何。`
        );
    }

    const hostVolume = meshGeometryUtils.getVolume(
        sourceStone.geometry
    );

    const sourceVolume = meshGeometryUtils.getVolume(
        sourceGeometry
    );

    const requestedPercent = Number(
        mass.volumePercent
    );

    if (
        !Number.isFinite(requestedPercent) ||
        requestedPercent <= 0 ||
        requestedPercent > 100
    ) {
        throw new Error(
            `玉料「${mass.name ?? index + 1}」的體積占比設定無效。`
        );
    }

    const targetVolume =
        hostVolume * requestedPercent / 100;

    if (
        !Number.isFinite(targetVolume) ||
        targetVolume <= 1e-10 ||
        sourceVolume <= 1e-10
    ) {
        throw new Error(
            `玉料「${mass.name ?? index + 1}」無法計算目標體積。`
        );
    }

    // 體積倍率必須使用立方根。
    const scaleFactor = Math.cbrt(
        targetVolume / sourceVolume
    );

    const seed = hashString(
        `${sourceStone.id}|${mass.id ?? index}|exact-volume-v2`
    );

    const random = seededRandom(seed);

    const rotation = {
        x: (random() - 0.5) * 0.85,
        y: (random() - 0.5) * Math.PI * 2,
        z: (random() - 0.5) * 0.65
    };

    let geometry = meshGeometryUtils.center(
        sourceGeometry
    );

    geometry = meshGeometryUtils.scale(
        geometry,
        scaleFactor
    );

    geometry = meshGeometryUtils.rotate(
        geometry,
        rotation
    );

    const masses = sourceStone.jadeData?.masses ?? [];

    const preferred = [
        (index + 1) / (masses.length + 1),
        0.5,
        0.5
    ];

    const candidates = createPlacementCandidates(
        hostBounds,
        preferred,
        random
    );

    let placed = null;
    let selectedBounds = null;

    for (const center of candidates) {
        const candidate = translateToCenter(
            geometry,
            center
        );

        if (!isInsideHostBounds(candidate, hostBounds)) {
            continue;
        }

        const candidateBounds = getBox(candidate);

        if (
            occupied.some(existing =>
                boxesOverlap(candidateBounds, existing)
            )
        ) {
            continue;
        }

        placed = candidate;
        selectedBounds = candidateBounds;

        break;
    }

    if (!placed) {
        throw new Error(
            `玉料「${mass.name ?? index + 1}」的設定體積無法在原石範圍內找到不重疊的位置。`
        );
    }

    const actualVolume = meshGeometryUtils.getVolume(
        placed
    );

    const actualPercent =
        actualVolume / hostVolume * 100;

    const difference = Math.abs(
        actualPercent - requestedPercent
    );

    if (
        difference >
        Math.max(0.001, requestedPercent * 0.0001)
    ) {
        throw new Error(
            `玉料「${mass.name ?? index + 1}」體積校正未達標。設定 ${requestedPercent.toFixed(3)}%，實際 ${actualPercent.toFixed(3)}%。`
        );
    }

    occupied.push(selectedBounds);

    return {
        geometry: placed,

        placement: {
            position: [...selectedBounds.center],
            rotation,
            scale: scaleFactor,
            targetVolume,
            actualVolume,
            actualVolumePercent: actualPercent,
            exactVolumePlacement: true
        }
    };
}


// ======================================================
// 預先安排所有玉料，先放置大塊
// ======================================================

cuttingUI.createStableJadePlacement = function (
    sourceStone,
    mass,
    index,
    hostBounds
) {
    // 已切割產物的玉料已經在原石座標系中。
    // 再次切割時必須沿用原座標，不可重新縮放。
    if (
        mass?.placementApplied &&
        mass.geometry
    ) {
        return {
            geometry: cloneMesh(mass.geometry),
            placement: mass.placement ?? null
        };
    }

    if (
        this._jadePlacementCache?.stoneId !== sourceStone.id
    ) {
        const sourceMasses =
            sourceStone.jadeData?.masses ?? [];

        const occupied = [];
        const placements = new Map();

        const ordered = sourceMasses
            .map((item, originalIndex) => ({
                item,
                originalIndex
            }))
            .sort((a, b) =>
                (Number(b.item.volumePercent) || 0) -
                (Number(a.item.volumePercent) || 0)
            );

        for (const entry of ordered) {
            const placed = createExactVolumePlacement(
                sourceStone,
                entry.item,
                entry.originalIndex,
                hostBounds,
                occupied
            );

            placements.set(
                entry.item.id,
                placed
            );
        }

        this._jadePlacementCache = {
            stoneId: sourceStone.id,
            placements
        };
    }

    const cached = this._jadePlacementCache.placements.get(
        mass.id
    );

    if (!cached) {
        throw new Error(
            `找不到玉料「${mass.name ?? index + 1}」的定位資料。`
        );
    }

    return {
        geometry: cloneMesh(cached.geometry),
        placement: structuredClone(cached.placement)
    };
};


// ======================================================
// 包裝原始切割方法
// ======================================================

const originalCreateInventoryRecord =
    cuttingUI.createInventoryRecord;

const originalSplitJadeData =
    cuttingUI.splitJadeData;


// ======================================================
// 保存石質剖面歷史
// ======================================================

cuttingUI.createInventoryRecord = function (
    mesh,
    side,
    result,
    sourceStone,
    jadeData
) {
    const record = originalCreateInventoryRecord.call(
        this,
        mesh,
        side,
        result,
        sourceStone,
        jadeData
    );

    const sidePlane = getSidePlane(
        result,
        side
    );

    const inheritedHistory = clipHistory(
        sourceStone.cutHistory ?? [],
        sidePlane
    );

    const currentTriangles = extractCapTriangles(
        mesh,
        sidePlane
    );

    const newEntry = createCutHistoryEntry(
        currentTriangles,
        sidePlane.outwardNormal,
        `cut-${result.createdAt ?? Date.now()}-${side}`,
        "stone"
    );

    record.cutHistory = [...inheritedHistory];

    if (newEntry) {
        record.cutHistory.push(newEntry);
    }

    record.cutHistoryVersion = 2;

    return record;
};


// ======================================================
// 保存玉肉剖面歷史與實際占比
// ======================================================

cuttingUI.splitJadeData = function (
    sourceStone,
    result
) {
    const split = originalSplitJadeData.call(
        this,
        sourceStone,
        result
    );

    const sourceMasses =
        sourceStone.jadeData?.masses ?? [];

    const sourceMassMap = new Map();

    for (const mass of sourceMasses) {
        sourceMassMap.set(mass.id, mass);

        if (mass.sourceMassId) {
            sourceMassMap.set(
                mass.sourceMassId,
                mass
            );
        }
    }

    const updateSide = side => {
        const sideData = split?.[side];

        if (
            !sideData ||
            !Array.isArray(sideData.masses)
        ) {
            return;
        }

        const sidePlane = getSidePlane(
            result,
            side
        );

        const hostVolume = side === "positive"
            ? result.positiveVolume
            : result.negativeVolume;

        let totalPercent = 0;

        for (const mass of sideData.masses) {
            const sourceMass =
                sourceMassMap.get(mass.sourceMassId) ??
                sourceMassMap.get(mass.id);

            const inheritedHistory = clipHistory(
                sourceMass?.cutHistory ??
                mass.cutHistory ??
                [],
                sidePlane
            );

            const currentTriangles = extractCapTriangles(
                mass.geometry,
                sidePlane
            );

            const newEntry = createCutHistoryEntry(
                currentTriangles,
                sidePlane.outwardNormal,
                `jade-cut-${result.createdAt ?? Date.now()}-${mass.id}-${side}`,
                "jade",
                mass.jadeType ?? null
            );

            mass.cutHistory = inheritedHistory;

            if (newEntry) {
                mass.cutHistory.push(newEntry);
            }

            const actualVolume = meshGeometryUtils.getVolume(
                mass.geometry
            );

            const actualPercent =
                actualVolume / hostVolume * 100;

            mass.volumePercent = actualPercent;
            mass.actualVolumePercent = actualPercent;

            totalPercent += actualPercent;
        }

        sideData.totalJadeVolume = totalPercent;
        sideData.retainedVolume = totalPercent;
        sideData.actualJadeVolumePercent = totalPercent;
    };

    updateSide("positive");
    updateSide("negative");

    return split;
};


// ======================================================
// 真實石材紋理
// ======================================================

function createStoneCanvas(seed, size = 512) {
    const canvas = document.createElement("canvas");

    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    const random = seededRandom(seed);

    const image = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const index = (y * size + x) * 4;

            const broad =
                Math.sin(
                    x * 0.018 +
                    Math.sin(y * 0.013) * 2.1
                ) * 8 +
                Math.sin(
                    y * 0.024 +
                    Math.cos(x * 0.009) * 1.8
                ) * 7;

            const medium =
                Math.sin(x * 0.11 + y * 0.07) * 4 +
                Math.cos(x * 0.065 - y * 0.12) * 3;

            const grain = (random() - 0.5) * 24;

            const value = Math.max(
                35,
                Math.min(
                    205,
                    132 + broad + medium + grain
                )
            );

            image.data[index] = value * 0.98;
            image.data[index + 1] = value;
            image.data[index + 2] = value * 0.91;
            image.data[index + 3] = 255;
        }
    }

    ctx.putImageData(image, 0, 0);

    // 大面積礦物雲霧。
    for (let i = 0; i < 85; i++) {
        const x = random() * size;
        const y = random() * size;
        const radius = 15 + random() * 105;

        const gradient = ctx.createRadialGradient(
            x,
            y,
            0,
            x,
            y,
            radius
        );

        gradient.addColorStop(
            0,
            random() > 0.5
                ? "rgba(218,218,198,0.27)"
                : "rgba(42,49,42,0.25)"
        );

        gradient.addColorStop(
            1,
            "rgba(90,95,83,0)"
        );

        ctx.fillStyle = gradient;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    // 深淺礦物顆粒。
    for (let i = 0; i < 4200; i++) {
        const x = random() * size;
        const y = random() * size;

        const radius = 0.3 + random() * 2.2;

        ctx.fillStyle = random() > 0.5
            ? "rgba(238,235,215,0.28)"
            : "rgba(29,35,30,0.36)";

        ctx.beginPath();

        ctx.ellipse(
            x,
            y,
            radius * (0.5 + random() * 1.8),
            radius * (0.5 + random() * 1.2),
            random() * Math.PI,
            0,
            Math.PI * 2
        );

        ctx.fill();
    }

    // 不規則礦脈與細裂隙。
    for (let i = 0; i < 30; i++) {
        let x = random() * size;
        let y = random() * size;

        ctx.beginPath();
        ctx.moveTo(x, y);

        for (let j = 0; j < 7; j++) {
            const nextX = x + (random() - 0.5) * 110;
            const nextY = y + (random() - 0.5) * 100;

            ctx.quadraticCurveTo(
                (x + nextX) / 2 + (random() - 0.5) * 40,
                (y + nextY) / 2 + (random() - 0.5) * 35,
                nextX,
                nextY
            );

            x = nextX;
            y = nextY;
        }

        ctx.strokeStyle = random() > 0.5
            ? "rgba(43,48,40,0.32)"
            : "rgba(229,224,202,0.26)";

        ctx.lineWidth = 0.5 + random() * 3.2;
        ctx.stroke();
    }

    return canvas;
}


// ======================================================
// 玉石剖面紋理
// ======================================================

function createJadeCanvas(baseColor, seed, size = 512) {
    const canvas = document.createElement("canvas");

    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    const random = seededRandom(seed);

    const base = new THREE.Color(baseColor);

    ctx.fillStyle = `#${base.getHexString()}`;
    ctx.fillRect(0, 0, size, size);

    // 大片連續色域。
    for (let i = 0; i < 42; i++) {
        const x = random() * size;
        const y = random() * size;
        const radius = 30 + random() * 125;

        const gradient = ctx.createRadialGradient(
            x,
            y,
            0,
            x,
            y,
            radius
        );

        gradient.addColorStop(
            0,
            random() > 0.5
                ? "rgba(225,240,210,0.36)"
                : "rgba(12,55,30,0.30)"
        );

        gradient.addColorStop(
            1,
            "rgba(60,100,65,0)"
        );

        ctx.fillStyle = gradient;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    // 交織纖維。
    for (let i = 0; i < 1500; i++) {
        const x = random() * size;
        const y = random() * size;

        const length = 4 + random() * 48;
        const angle = random() * Math.PI * 2;

        ctx.beginPath();

        ctx.moveTo(x, y);

        ctx.quadraticCurveTo(
            x + Math.cos(angle + 0.3) * length * 0.5,
            y + Math.sin(angle + 0.3) * length * 0.5,
            x + Math.cos(angle) * length,
            y + Math.sin(angle) * length
        );

        ctx.strokeStyle = random() > 0.5
            ? "rgba(235,247,221,0.24)"
            : "rgba(12,48,27,0.20)";

        ctx.lineWidth = 0.35 + random() * 1.8;
        ctx.stroke();
    }

    // 不規則、連續的礦物色帶。
    for (let i = 0; i < 10; i++) {
        let x = -30;
        let y = random() * size;

        ctx.beginPath();
        ctx.moveTo(x, y);

        while (x < size + 40) {
            const nextX = x + 28 + random() * 48;

            const nextY =
                y +
                (random() - 0.5) * 42 +
                Math.sin(x * 0.018 + i) * 14;

            ctx.bezierCurveTo(
                x + 12,
                y + (random() - 0.5) * 25,
                nextX - 12,
                nextY + (random() - 0.5) * 25,
                nextX,
                nextY
            );

            x = nextX;
            y = nextY;
        }

        ctx.strokeStyle = random() > 0.5
            ? "rgba(230,245,214,0.22)"
            : "rgba(12,55,32,0.18)";

        ctx.lineWidth = 4 + random() * 18;
        ctx.lineCap = "round";
        ctx.stroke();
    }

    return canvas;
}


// ======================================================
// Three.js 紋理與幾何
// ======================================================

function createTexture(canvas, repeat = false) {
    const texture = new THREE.CanvasTexture(canvas);

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;

    if (repeat) {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(3, 3);
    } else {
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
    }

    texture.needsUpdate = true;

    return texture;
}


function createTexturedStoneGeometry(meshData) {
    const positions = [];
    const uvs = [];

    for (const face of meshData.faces) {
        const a = meshData.vertices[face[0]];
        const b = meshData.vertices[face[1]];
        const c = meshData.vertices[face[2]];

        const ab = new THREE.Vector3(
            b[0] - a[0],
            b[1] - a[1],
            b[2] - a[2]
        );

        const ac = new THREE.Vector3(
            c[0] - a[0],
            c[1] - a[1],
            c[2] - a[2]
        );

        const normal = new THREE.Vector3()
            .crossVectors(ab, ac)
            .normalize();

        const abs = [
            Math.abs(normal.x),
            Math.abs(normal.y),
            Math.abs(normal.z)
        ];

        let axes;

        if (abs[0] >= abs[1] && abs[0] >= abs[2]) {
            axes = [1, 2];
        } else if (abs[1] >= abs[0] && abs[1] >= abs[2]) {
            axes = [0, 2];
        } else {
            axes = [0, 1];
        }

        for (const index of face) {
            const vertex = meshData.vertices[index];

            positions.push(...vertex);

            uvs.push(
                vertex[axes[0]] * 2.5,
                vertex[axes[1]] * 2.5
            );
        }
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3)
    );

    geometry.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(uvs, 2)
    );

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    return geometry;
}


function createSurfaceGeometry(
    triangles,
    outwardNormal,
    offset = 0.0015
) {
    if (!triangles.length) {
        return null;
    }

    const normal = new THREE.Vector3(
        ...outwardNormal
    ).normalize();

    const reference = Math.abs(normal.y) < 0.9
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(1, 0, 0);

    const u = new THREE.Vector3()
        .crossVectors(reference, normal)
        .normalize();

    const v = new THREE.Vector3()
        .crossVectors(normal, u)
        .normalize();

    const projected = [];

    for (const triangle of triangles) {
        for (const vertex of triangle) {
            const point = new THREE.Vector3(...vertex);

            projected.push({
                vertex,
                u: point.dot(u),
                v: point.dot(v)
            });
        }
    }

    const minU = Math.min(...projected.map(point => point.u));
    const maxU = Math.max(...projected.map(point => point.u));
    const minV = Math.min(...projected.map(point => point.v));
    const maxV = Math.max(...projected.map(point => point.v));

    const width = Math.max(maxU - minU, 1e-8);
    const height = Math.max(maxV - minV, 1e-8);

    const positions = [];
    const uvs = [];

    for (const point of projected) {
        const vertex = new THREE.Vector3(
            ...point.vertex
        ).addScaledVector(normal, offset);

        positions.push(
            vertex.x,
            vertex.y,
            vertex.z
        );

        uvs.push(
            (point.u - minU) / width,
            (point.v - minV) / height
        );
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3)
    );

    geometry.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(uvs, 2)
    );

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    return geometry;
}


// ======================================================
// 玉石顏色
// ======================================================

const JADE_COLORS = {
    agate: 0xb96b58,
    jasper: 0x9c5948,
    quartz: 0xe8e3d8,
    commercial_nephrite: 0x8caa85,
    amethyst: 0x9275b8,
    citrine: 0xd9ae43,
    garnet: 0x922d42,
    lapis_lazuli: 0x315caa,
    turquoise: 0x45aaa0,
    aquamarine: 0x83c9c5,
    peridot: 0x91ae4b,
    spinel: 0xa94d75,
    tourmaline: 0x547d65,
    jadeite: 0x75a982,
    moonstone: 0xc8d5dc,
    emerald: 0x16845a,
    ruby: 0xc42e42,
    sapphire: 0x3156a4,
    precious_opal: 0xb9c6d0,
    imperial_green_jadeite: 0x087c45,
    alexandrite: 0x526b9e,
    black_opal: 0x343c50,
    pigeon_blood_ruby: 0x8e142d,
    jade_37: 0xd5bd75
};


// ======================================================
// 舊存檔剖面相容
// ======================================================

function getLegacyStoneSurface(stone) {
    const source = stone.cutData?.cutPlane;

    if (
        !source ||
        !Array.isArray(source.point) ||
        !Array.isArray(source.normal)
    ) {
        return null;
    }

    const normal = normalize(source.normal);

    const half = Math.max(
        0,
        Number(stone.cutData.bladeThickness) || 0
    ) / 2;

    const positive = stone.cutSide === "positive";
    const direction = positive ? 1 : -1;

    const plane = {
        point: source.point.map(
            (value, axis) =>
                value + normal[axis] * half * direction
        ),
        normal
    };

    const outwardNormal = positive
        ? normal.map(value => -value)
        : [...normal];

    const triangles = extractCapTriangles(
        stone.geometry,
        plane
    );

    if (!triangles.length) {
        return null;
    }

    return {
        id: `legacy-${stone.id}`,
        kind: "stone",
        outwardNormal,
        triangles
    };
}


// ======================================================
// 建立一個已保存的剖面
// ======================================================

function createHistorySurface(
    preview,
    entry,
    kind,
    fallbackSeed
) {
    if (
        !entry ||
        !Array.isArray(entry.triangles) ||
        entry.triangles.length === 0
    ) {
        return null;
    }

    const outwardNormal =
        entry.outwardNormal ?? [0, 1, 0];

    const geometry = createSurfaceGeometry(
        entry.triangles,
        outwardNormal,
        kind === "jade" ? 0.0025 : 0.0015
    );

    if (!geometry) {
        return null;
    }

    const seed = hashString(
        `${entry.id ?? fallbackSeed}|${entry.jadeType ?? kind}`
    );

    let texture;
    let material;

    if (kind === "jade") {
        const jadeType = entry.jadeType ?? "jadeite";

        const color = JADE_COLORS[jadeType] ?? 0x72a98a;

        texture = createTexture(
            createJadeCanvas(color, seed)
        );

        material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: texture,
            bumpMap: texture,
            bumpScale: 0.004,
            roughness: 0.48,
            metalness: 0.015,
            side: THREE.DoubleSide,
            transparent: false,
            depthWrite: true,
            polygonOffset: true,
            polygonOffsetFactor: -2
        });

    } else {
        texture = createTexture(
            createStoneCanvas(seed)
        );

        material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: texture,
            bumpMap: texture,
            bumpScale: 0.018,
            roughness: 0.96,
            metalness: 0,
            side: THREE.DoubleSide,
            transparent: false,
            depthWrite: true,
            polygonOffset: true,
            polygonOffsetFactor: -1
        });
    }

    const mesh = new THREE.Mesh(
        geometry,
        material
    );

    mesh.name = kind === "jade"
        ? "保存的玉肉剖面"
        : "保存的石質剖面";

    mesh.renderOrder = 3;
    mesh.castShadow = false;
    mesh.receiveShadow = true;

    preview.cutSurfaceMeshes.push(mesh);
    preview.cutSurfaceMaterials.push(material);
    preview.cutSurfaceTextures.push(texture);

    if (kind === "jade") {
        preview.cutJadeSurfaceMeshes.push(mesh);
    } else {
        preview.cutStoneSurfaceMeshes.push(mesh);
    }

    preview.previewGroup.add(mesh);

    return mesh;
}


// ======================================================
// 重建背包切割產物
// ======================================================

function setupPersistentCutPreview(stone) {
    this.previewGroup = new THREE.Group();

    this.previewGroup.name = "多次切割剖面與玉肉";

    this.cutSurfaceMeshes = [];
    this.cutStoneSurfaceMeshes = [];
    this.cutJadeSurfaceMeshes = [];
    this.cutSurfaceMaterials = [];
    this.cutSurfaceTextures = [];

    const hasStoneGeometry =
        Array.isArray(stone.geometry?.vertices) &&
        Array.isArray(stone.geometry?.faces) &&
        stone.geometry.vertices.length >= 4 &&
        stone.geometry.faces.length >= 4;

    const masses = Array.isArray(stone.jadeData?.masses)
        ? stone.jadeData.masses
        : [];

    // 原石外殼。
    if (hasStoneGeometry) {
        this.validateGeometry(stone.geometry);

        const geometry = createTexturedStoneGeometry(
            stone.geometry
        );

        const texture = createTexture(
            createStoneCanvas(
                hashString(
                    `${stone.sourceStoneId ?? stone.id}|outer-stone`
                )
            ),
            true
        );

        this.stoneMaterial =
            new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map: texture,
                bumpMap: texture,
                bumpScale: 0.025,
                roughness: 0.91,
                metalness: 0.015,
                flatShading: false,
                transparent: false,
                opacity: 1,
                depthWrite: true,
                side: THREE.DoubleSide
            });

        this.stoneMesh = new THREE.Mesh(
            geometry,
            this.stoneMaterial
        );

        this.stoneMesh.name = "不透明原石外殼";

        this.stoneMesh.castShadow = true;
        this.stoneMesh.receiveShadow = true;

        this.scene.add(this.stoneMesh);

        this.cutSurfaceTextures.push(texture);
    }

    // 玉料本體。
    for (const mass of masses) {
        try {
            this.validateGeometry(mass.geometry);

            const jadeMesh = this.createJadeMesh(mass);

            if (!jadeMesh) continue;

            this.previewGroup.add(jadeMesh);
            this.jadeMeshes.push(jadeMesh);

        } catch (error) {
            console.warn(
                "略過無效玉料：",
                mass?.id,
                error
            );
        }
    }

    // 石質切面歷史。
    let stoneHistory = Array.isArray(stone.cutHistory)
        ? stone.cutHistory.filter(entry =>
            entry.kind === "stone" &&
            Array.isArray(entry.triangles)
        )
        : [];

    if (stoneHistory.length === 0) {
        const legacy = getLegacyStoneSurface(stone);

        if (legacy) {
            stoneHistory = [legacy];
        }
    }

    for (const entry of stoneHistory) {
        createHistorySurface(
            this,
            entry,
            "stone",
            stone.id
        );
    }

    // 玉肉切面歷史。
    for (const mass of masses) {
        let history = Array.isArray(mass.cutHistory)
            ? mass.cutHistory.filter(entry =>
                entry.kind === "jade" &&
                Array.isArray(entry.triangles)
            )
            : [];

        if (
            history.length === 0 &&
            stone.cutData?.cutPlane
        ) {
            const legacy = getLegacyStoneSurface(stone);

            if (legacy) {
                const source = stone.cutData.cutPlane;
                const normal = normalize(source.normal);

                const half = Math.max(
                    0,
                    Number(stone.cutData.bladeThickness) || 0
                ) / 2;

                const positive = stone.cutSide === "positive";
                const direction = positive ? 1 : -1;

                const plane = {
                    point: source.point.map(
                        (value, axis) =>
                            value + normal[axis] * half * direction
                    ),
                    normal
                };

                const triangles = extractCapTriangles(
                    mass.geometry,
                    plane
                );

                if (triangles.length) {
                    history = [{
                        id: `legacy-jade-${mass.id}`,
                        kind: "jade",
                        jadeType: mass.jadeType,
                        outwardNormal: legacy.outwardNormal,
                        triangles
                    }];
                }
            }
        }

        for (const entry of history) {
            createHistorySurface(
                this,
                entry,
                "jade",
                mass.id
            );
        }
    }

    if (
        !this.stoneMesh &&
        this.previewGroup.children.length === 0
    ) {
        throw new Error("切割產物沒有可顯示的模型資料。");
    }

    this.scene.add(this.previewGroup);

    // 整體置中，保留外殼、玉料及所有舊切面的相對位置。
    const bounds = new THREE.Box3();

    bounds.makeEmpty();

    if (this.stoneMesh) {
        bounds.union(
            new THREE.Box3().setFromObject(this.stoneMesh)
        );
    }

    bounds.union(
        new THREE.Box3().setFromObject(this.previewGroup)
    );

    if (bounds.isEmpty()) {
        throw new Error("無法計算切割產物範圍。");
    }

    const center = new THREE.Vector3();

    bounds.getCenter(center);

    this.previewGroup.position.sub(center);

    if (this.stoneMesh) {
        this.stoneMesh.position.sub(center);
    }

    const finalBounds = new THREE.Box3();

    finalBounds.makeEmpty();

    if (this.stoneMesh) {
        finalBounds.union(
            new THREE.Box3().setFromObject(this.stoneMesh)
        );
    }

    finalBounds.union(
        new THREE.Box3().setFromObject(this.previewGroup)
    );

    this.fitCamera(finalBounds);

    console.log(
        "[多次切割剖面] 背包模型重建完成：",
        {
            stoneSurfaces: this.cutStoneSurfaceMeshes.length,
            jadeSurfaces: this.cutJadeSurfaceMeshes.length,
            jadeMasses: this.jadeMeshes.length
        }
    );
}


// ======================================================
// 覆寫背包預覽
// ======================================================

const originalSetupPreview =
    inventory3DPreview.setupPreview;

inventory3DPreview.setupPreview = function (stone) {
    if (stone?.status === "cut") {
        setupPersistentCutPreview.call(this, stone);
        return;
    }

    originalSetupPreview.call(this, stone);
};


// ======================================================
// 顯示控制
// ======================================================

const originalSetInclusionsVisible =
    inventory3DPreview.setInclusionsVisible;

inventory3DPreview.setInclusionsVisible = function (visible) {
    const result = originalSetInclusionsVisible.call(
        this,
        visible
    );

    for (const mesh of this.cutJadeSurfaceMeshes ?? []) {
        mesh.visible = Boolean(visible);
    }

    return result;
};


const originalSetStoneVisible =
    inventory3DPreview.setStoneVisible;

inventory3DPreview.setStoneVisible = function (visible) {
    const result = originalSetStoneVisible.call(
        this,
        visible
    );

    for (const mesh of this.cutStoneSurfaceMeshes ?? []) {
        mesh.visible = Boolean(visible);
    }

    return result;
};


// ======================================================
// 清理資源
// ======================================================

const originalDestroy =
    inventory3DPreview.destroy;

inventory3DPreview.destroy = function () {
    for (const mesh of this.cutSurfaceMeshes ?? []) {
        mesh.geometry?.dispose();
        mesh.removeFromParent();
    }

    for (const material of this.cutSurfaceMaterials ?? []) {
        material.dispose();
    }

    for (const texture of this.cutSurfaceTextures ?? []) {
        texture.dispose();
    }

    this.cutSurfaceMeshes = [];
    this.cutStoneSurfaceMeshes = [];
    this.cutJadeSurfaceMeshes = [];
    this.cutSurfaceMaterials = [];
    this.cutSurfaceTextures = [];

    // 舊模組也會清理同名資源，避免重複釋放。
    this.cutStoneSurface = null;
    this.cutJadeSurfaces = [];
    this.cutSurfaceTextures = [];

    return originalDestroy.call(this);
};


console.log(
    "[切割持久化] 實際體積定位與多次切割剖面歷史已載入。"
);

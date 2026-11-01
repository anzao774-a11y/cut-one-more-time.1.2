
// js/ui/cutting-result-visuals.js

import * as THREE from "three";

import { cuttingUI } from "./cutting-ui.js";

import {
    meshPlacementUtils
} from "../systems/mesh-placement-utils.js";


// ==========================================
// 視覺設定
// ==========================================

const VISUAL_CONFIG = {
    sideSpacing: 1.35,

    stoneSurfaceOffset: 0.0012,
    jadeSurfaceOffset: 0.0024,

    planeTolerance: 0.00001,

    stoneRoughness: 0.96,
    jadeRoughness: 0.48,

    textureSize: 512,

    jadeLengthScale: 1.65,
    jadeWidthScale: 0.62,
    jadeDepthScale: 0.82
};


// ==========================================
// 種子亂數
// ==========================================

function hashString(value) {
    let hash = 2166136261;

    const text = String(value);

    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
}


function createSeededRandom(seed) {
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


function randomBetween(random, min, max) {
    return min + random() * (max - min);
}


function clamp(value, min, max) {
    return Math.max(
        min,
        Math.min(max, value)
    );
}


// ==========================================
// 向量工具
// ==========================================

function normalizeVector(vector) {
    const length = Math.hypot(
        vector[0],
        vector[1],
        vector[2]
    );

    if (!Number.isFinite(length) || length <= 1e-10) {
        throw new Error("切割平面法線無效。");
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


// ==========================================
// 建立切面座標基準
// ==========================================

function createPlaneBasis(normal) {
    const n = new THREE.Vector3(
        normal[0],
        normal[1],
        normal[2]
    ).normalize();

    const reference = Math.abs(n.y) < 0.9
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(1, 0, 0);

    const u = new THREE.Vector3()
        .crossVectors(reference, n)
        .normalize();

    const v = new THREE.Vector3()
        .crossVectors(n, u)
        .normalize();

    return { u, v };
}


function projectPoint(point, basis) {
    const vector = new THREE.Vector3(
        point[0],
        point[1],
        point[2]
    );

    return {
        u: vector.dot(basis.u),
        v: vector.dot(basis.v)
    };
}


// ==========================================
// 擷取切割平面上的三角面
// ==========================================

function extractPlaneTriangles(mesh, plane) {
    const geometry = mesh;

    if (
        !geometry ||
        !Array.isArray(geometry.vertices) ||
        !Array.isArray(geometry.faces)
    ) {
        return [];
    }

    const triangles = [];

    for (const face of geometry.faces) {
        if (
            !Array.isArray(face) ||
            face.length !== 3 ||
            !face.every(index =>
                Number.isInteger(index) &&
                index >= 0 &&
                index < geometry.vertices.length
            )
        ) {
            continue;
        }

        const vertices = face.map(
            index => geometry.vertices[index]
        );

        if (
            vertices.some(vertex =>
                !Array.isArray(vertex) ||
                vertex.length !== 3 ||
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
                Math.abs(distance) <=
                VISUAL_CONFIG.planeTolerance
            )
        ) {
            triangles.push(vertices);
        }
    }

    return triangles;
}


// ==========================================
// 計算兩側共用的切面 UV 範圍
// ==========================================

function calculateProjectedBounds(triangleSets, basis) {
    let minU = Infinity;
    let maxU = -Infinity;

    let minV = Infinity;
    let maxV = -Infinity;

    for (const triangles of triangleSets) {
        for (const triangle of triangles) {
            for (const vertex of triangle) {
                const point = projectPoint(
                    vertex,
                    basis
                );

                minU = Math.min(minU, point.u);
                maxU = Math.max(maxU, point.u);

                minV = Math.min(minV, point.v);
                maxV = Math.max(maxV, point.v);
            }
        }
    }

    if (
        !Number.isFinite(minU) ||
        !Number.isFinite(maxU) ||
        !Number.isFinite(minV) ||
        !Number.isFinite(maxV)
    ) {
        return {
            minU: -1,
            maxU: 1,
            minV: -1,
            maxV: 1
        };
    }

    const padding = 0.015;

    return {
        minU: minU - padding,
        maxU: maxU + padding,
        minV: minV - padding,
        maxV: maxV + padding
    };
}


function calculateUV(point, basis, bounds) {
    const projected = projectPoint(
        point,
        basis
    );

    const width = Math.max(
        1e-8,
        bounds.maxU - bounds.minU
    );

    const height = Math.max(
        1e-8,
        bounds.maxV - bounds.minV
    );

    return [
        (projected.u - bounds.minU) / width,
        (projected.v - bounds.minV) / height
    ];
}


// ==========================================
// 建立石質剖面紋理
// ==========================================

function createStoneMatrixCanvas(seed) {
    const size = VISUAL_CONFIG.textureSize;

    const canvas = document.createElement("canvas");

    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");

    const random = createSeededRandom(seed);

    // 基底：灰白、灰綠、褐灰色的石質色調。

    ctx.fillStyle = "#999b88";
    ctx.fillRect(0, 0, size, size);


    // --------------------------------------
    // 大面積礦物雲霧
    // --------------------------------------

    const cloudyColors = [
        "rgba(202, 199, 174, 0.58)",
        "rgba(177, 181, 157, 0.48)",
        "rgba(112, 125, 103, 0.34)",
        "rgba(78, 91, 73, 0.26)",
        "rgba(125, 112, 91, 0.23)",
        "rgba(217, 211, 185, 0.35)"
    ];

    for (let i = 0; i < 95; i++) {
        const x = random() * size;
        const y = random() * size;

        const radius = randomBetween(
            random,
            12,
            105
        );

        const gradient = ctx.createRadialGradient(
            x,
            y,
            0,
            x,
            y,
            radius
        );

        const color = cloudyColors[
            Math.floor(random() * cloudyColors.length)
        ];

        gradient.addColorStop(0, color);
        gradient.addColorStop(1, "rgba(120,125,105,0)");

        ctx.fillStyle = gradient;

        ctx.beginPath();

        ctx.arc(
            x,
            y,
            radius,
            0,
            Math.PI * 2
        );

        ctx.fill();
    }


    // --------------------------------------
    // 不規則綠色玉質色帶
    // --------------------------------------

    const greenColors = [
        "rgba(37, 91, 58, 0.42)",
        "rgba(65, 119, 77, 0.38)",
        "rgba(89, 139, 91, 0.35)",
        "rgba(27, 74, 47, 0.31)",
        "rgba(122, 153, 106, 0.34)"
    ];

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let i = 0; i < 8; i++) {
        let x = random() * size;
        let y = random() * size;

        ctx.beginPath();
        ctx.moveTo(x, y);

        const segments = Math.floor(
            randomBetween(random, 2, 6)
        );

        for (let j = 0; j < segments; j++) {
            const nextX = x + randomBetween(
                random,
                -100,
                100
            );

            const nextY = y + randomBetween(
                random,
                -70,
                70
            );

            const controlX = (
                x + nextX
            ) / 2 + randomBetween(
                random,
                -45,
                45
            );

            const controlY = (
                y + nextY
            ) / 2 + randomBetween(
                random,
                -45,
                45
            );

            ctx.quadraticCurveTo(
                controlX,
                controlY,
                nextX,
                nextY
            );

            x = nextX;
            y = nextY;
        }

        ctx.strokeStyle = greenColors[
            Math.floor(random() * greenColors.length)
        ];

        ctx.lineWidth = randomBetween(
            random,
            8,
            35
        );

        ctx.shadowColor = "rgba(35, 78, 48, 0.35)";
        ctx.shadowBlur = randomBetween(
            random,
            8,
            20
        );

        ctx.stroke();
    }

    ctx.shadowBlur = 0;


    // --------------------------------------
    // 深色礦物斑點
    // --------------------------------------

    const darkColors = [
        "rgba(35, 43, 35, 0.55)",
        "rgba(53, 57, 43, 0.46)",
        "rgba(82, 72, 56, 0.38)",
        "rgba(45, 62, 47, 0.45)"
    ];

    for (let i = 0; i < 420; i++) {
        const x = random() * size;
        const y = random() * size;

        const radius = randomBetween(
            random,
            0.5,
            3.4
        );

        ctx.fillStyle = darkColors[
            Math.floor(random() * darkColors.length)
        ];

        ctx.beginPath();

        ctx.ellipse(
            x,
            y,
            radius * randomBetween(random, 0.7, 1.8),
            radius,
            random() * Math.PI,
            0,
            Math.PI * 2
        );

        ctx.fill();
    }


    // --------------------------------------
    // 淺色礦物顆粒
    // --------------------------------------

    for (let i = 0; i < 1500; i++) {
        const x = random() * size;
        const y = random() * size;

        const radius = randomBetween(
            random,
            0.3,
            1.5
        );

        ctx.fillStyle = random() > 0.5
            ? "rgba(229, 226, 204, 0.32)"
            : "rgba(71, 78, 64, 0.2)";

        ctx.beginPath();

        ctx.arc(
            x,
            y,
            radius,
            0,
            Math.PI * 2
        );

        ctx.fill();
    }


    // --------------------------------------
    // 細微裂隙與礦物紋路
    // --------------------------------------

    for (let i = 0; i < 22; i++) {
        let x = random() * size;
        let y = random() * size;

        ctx.beginPath();
        ctx.moveTo(x, y);

        const segments = Math.floor(
            randomBetween(random, 2, 5)
        );

        for (let j = 0; j < segments; j++) {
            x += randomBetween(random, -35, 35);
            y += randomBetween(random, -35, 35);

            ctx.lineTo(x, y);
        }

        ctx.strokeStyle = random() > 0.5
            ? "rgba(46, 48, 39, 0.25)"
            : "rgba(220, 216, 191, 0.25)";

        ctx.lineWidth = randomBetween(
            random,
            0.4,
            1.4
        );

        ctx.stroke();
    }

    return canvas;
}


// ==========================================
// 建立玉肉本身的色澤紋理
// ==========================================

function createJadeCanvas(baseColor, seed) {
    const size = VISUAL_CONFIG.textureSize;

    const canvas = document.createElement("canvas");

    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");

    const random = createSeededRandom(seed);

    const base = new THREE.Color(baseColor);

    const lighter = base.clone().lerp(
        new THREE.Color("#ffffff"),
        0.28
    );

    const darker = base.clone().lerp(
        new THREE.Color("#18251b"),
        0.42
    );

    const baseStyle = `#${base.getHexString()}`;
    const lightStyle = `#${lighter.getHexString()}`;
    const darkStyle = `#${darker.getHexString()}`;

    ctx.fillStyle = baseStyle;

    ctx.fillRect(
        0,
        0,
        size,
        size
    );


    // 不規則色塊與雲霧。

    for (let i = 0; i < 65; i++) {
        const x = random() * size;
        const y = random() * size;

        const radius = randomBetween(
            random,
            10,
            100
        );

        const gradient = ctx.createRadialGradient(
            x,
            y,
            0,
            x,
            y,
            radius
        );

        const useLight = random() > 0.48;

        gradient.addColorStop(
            0,
            useLight
                ? lightStyle
                : darkStyle
        );

        gradient.addColorStop(
            1,
            "rgba(100,120,100,0)"
        );

        ctx.globalAlpha = randomBetween(
            random,
            0.08,
            0.32
        );

        ctx.fillStyle = gradient;

        ctx.beginPath();

        ctx.arc(
            x,
            y,
            radius,
            0,
            Math.PI * 2
        );

        ctx.fill();
    }

    ctx.globalAlpha = 1;


    // 柔和色帶。

    for (let i = 0; i < 5; i++) {
        const y = random() * size;

        ctx.beginPath();

        ctx.moveTo(
            -30,
            y
        );

        ctx.bezierCurveTo(
            size * 0.25,
            y + randomBetween(random, -100, 100),
            size * 0.7,
            y + randomBetween(random, -100, 100),
            size + 30,
            y + randomBetween(random, -70, 70)
        );

        ctx.strokeStyle = random() > 0.5
            ? `rgba(255,255,255,${randomBetween(random, 0.08, 0.2)})`
            : `rgba(15,35,20,${randomBetween(random, 0.08, 0.18)})`;

        ctx.lineWidth = randomBetween(
            random,
            5,
            25
        );

        ctx.shadowBlur = 12;

        ctx.stroke();
    }

    ctx.shadowBlur = 0;


    // 細微顆粒。

    for (let i = 0; i < 1800; i++) {
        const x = random() * size;
        const y = random() * size;

        const radius = randomBetween(
            random,
            0.3,
            1.4
        );

        ctx.fillStyle = random() > 0.5
            ? "rgba(255,255,255,0.16)"
            : "rgba(10,25,15,0.13)";

        ctx.beginPath();

        ctx.arc(
            x,
            y,
            radius,
            0,
            Math.PI * 2
        );

        ctx.fill();
    }

    return canvas;
}


// ==========================================
// Canvas 轉換成 Three.js 紋理
// ==========================================

function createCanvasTexture(canvas) {
    const texture = new THREE.CanvasTexture(canvas);

    texture.colorSpace = THREE.SRGBColorSpace;

    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;

    texture.anisotropy = 4;

    texture.needsUpdate = true;

    return texture;
}


// ==========================================
// 建立切面網格
// ==========================================

function createTexturedSurface(
    triangles,
    plane,
    outwardNormal,
    basis,
    bounds,
    material,
    offset,
    name
) {
    if (!triangles.length) {
        return null;
    }

    const positions = [];
    const uvs = [];

    for (const triangle of triangles) {
        for (const vertex of triangle) {
            positions.push(
                vertex[0] + outwardNormal[0] * offset,
                vertex[1] + outwardNormal[1] * offset,
                vertex[2] + outwardNormal[2] * offset
            );

            const uv = calculateUV(
                vertex,
                basis,
                bounds
            );

            uvs.push(
                uv[0],
                uv[1]
            );
        }
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
            positions,
            3
        )
    );

    geometry.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(
            uvs,
            2
        )
    );

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const surface = new THREE.Mesh(
        geometry,
        material
    );

    surface.name = name;

    surface.userData.ownsMaterial = true;

    surface.castShadow = false;
    surface.receiveShadow = true;

    surface.renderOrder = 2;

    return surface;
}


// ==========================================
// 建立原石切面材質
// ==========================================

function createStoneCutMaterial(seed) {
    const canvas = createStoneMatrixCanvas(seed);

    const texture = createCanvasTexture(canvas);

    return new THREE.MeshStandardMaterial({
        color: 0xffffff,

        map: texture,

        roughness: VISUAL_CONFIG.stoneRoughness,
        metalness: 0,

        side: THREE.DoubleSide,

        transparent: false,
        opacity: 1,
        depthWrite: true,

        polygonOffset: true,
        polygonOffsetFactor: -1
    });
}


// ==========================================
// 建立玉肉切面材質
// ==========================================

function createJadeCutMaterial(color, seed) {
    const canvas = createJadeCanvas(
        color,
        seed
    );

    const texture = createCanvasTexture(canvas);

    return new THREE.MeshStandardMaterial({
        color: 0xffffff,

        map: texture,

        roughness: VISUAL_CONFIG.jadeRoughness,
        metalness: 0.015,

        side: THREE.DoubleSide,

        transparent: false,
        opacity: 1,
        depthWrite: true,

        polygonOffset: true,
        polygonOffsetFactor: -2
    });
}


// ==========================================
// 建立正負兩側切割平面
// ==========================================

function createCutPlanes(result) {
    const sourcePlane = result?.cutPlane;

    if (
        !sourcePlane ||
        !Array.isArray(sourcePlane.point) ||
        !Array.isArray(sourcePlane.normal) ||
        sourcePlane.point.length !== 3 ||
        sourcePlane.normal.length !== 3 ||
        !sourcePlane.point.every(Number.isFinite) ||
        !sourcePlane.normal.every(Number.isFinite)
    ) {
        throw new Error("切割結果缺少有效的切割平面資料。");
    }

    const normal = normalizeVector(
        sourcePlane.normal
    );

    const bladeThickness = Number(
        result.bladeThickness
    );

    if (
        !Number.isFinite(bladeThickness) ||
        bladeThickness < 0
    ) {
        throw new Error("刀片厚度資料無效。");
    }

    const halfThickness = bladeThickness / 2;

    const positivePoint = sourcePlane.point.map(
        (value, axis) =>
            value + normal[axis] * halfThickness
    );

    const negativePoint = sourcePlane.point.map(
        (value, axis) =>
            value - normal[axis] * halfThickness
    );

    return {
        positive: {
            point: positivePoint,
            normal: [...normal]
        },

        negative: {
            point: negativePoint,
            normal: normal.map(value => -value)
        },

        positiveOutward: normal.map(
            value => -value
        ),

        negativeOutward: [...normal]
    };
}


// ==========================================
// 原石內部玉肉自然定位
// ==========================================

function createNaturalJadePlacement(
    sourceStone,
    mass,
    index,
    hostBounds
) {
    if (mass.placementApplied && mass.geometry) {
        return {
            geometry: structuredClone(mass.geometry),
            placement: mass.placement ?? null
        };
    }

    if (
        !mass?.geometry ||
        !Array.isArray(mass.geometry.vertices) ||
        !Array.isArray(mass.geometry.faces)
    ) {
        throw new Error(
            `玉料「${mass?.name ?? index}」原始幾何資料無效。`
        );
    }

    const sourceId =
        sourceStone?.id ??
        sourceStone?.name ??
        "jade-stone";

    const sourceSeed = hashString(
        `${sourceId}|natural-jade-deposit`
    );

    const sourceRandom = createSeededRandom(
        sourceSeed
    );

    const massSeed = hashString(
        `${sourceId}|${mass.id ?? index}|shape`
    );

    const random = createSeededRandom(
        massSeed
    );

    const masses = sourceStone?.jadeData?.masses ?? [];

    const count = Math.max(
        1,
        masses.length
    );


    // --------------------------------------
    // 建立同一塊原石共用的玉脈方向
    // --------------------------------------

    const baseRotation = new THREE.Euler(
        randomBetween(sourceRandom, -0.55, 0.55),
        randomBetween(sourceRandom, -Math.PI, Math.PI),
        randomBetween(sourceRandom, -0.4, 0.4)
    );

    const depositAxis = new THREE.Vector3(
        1,
        0,
        0
    ).applyEuler(baseRotation).normalize();

    const reference = Math.abs(depositAxis.y) < 0.85
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1);

    const perpendicular = new THREE.Vector3()
        .crossVectors(depositAxis, reference)
        .normalize();

    const secondary = new THREE.Vector3()
        .crossVectors(depositAxis, perpendicular)
        .normalize();


    // --------------------------------------
    // 將原本偏圓的玉料拉成不規則透鏡狀
    // --------------------------------------

    const vertices = mass.geometry.vertices;

    const center = [0, 0, 0];

    for (const vertex of vertices) {
        center[0] += vertex[0] / vertices.length;
        center[1] += vertex[1] / vertices.length;
        center[2] += vertex[2] / vertices.length;
    }

    const reshapedVertices = vertices.map(vertex => {
        const x = vertex[0] - center[0];
        const y = vertex[1] - center[1];
        const z = vertex[2] - center[2];

        const irregularity =
            1 +
            Math.sin(x * 3.4 + y * 2.1) * 0.035 +
            Math.cos(z * 4.1 - y * 2.8) * 0.025;

        return [
            x * VISUAL_CONFIG.jadeLengthScale * irregularity,
            y * VISUAL_CONFIG.jadeWidthScale * irregularity,
            z * VISUAL_CONFIG.jadeDepthScale * irregularity
        ];
    });

    const reshaped = {
        vertices: reshapedVertices,

        faces: mass.geometry.faces.map(
            face => [...face]
        )
    };


    // --------------------------------------
    // 沿著共同的玉脈方向安排位置
    // --------------------------------------

    const progress = count <= 1
        ? 0
        : index / (count - 1) - 0.5;

    const along = progress * 0.42;

    const sideJitter = randomBetween(
        random,
        -0.075,
        0.075
    );

    const depthJitter = randomBetween(
        random,
        -0.055,
        0.055
    );

    const normalizedPosition = [
        0.5 +
            depositAxis.x * along +
            perpendicular.x * sideJitter +
            secondary.x * depthJitter,

        0.5 +
            depositAxis.y * along +
            perpendicular.y * sideJitter +
            secondary.y * depthJitter,

        0.5 +
            depositAxis.z * along +
            perpendicular.z * sideJitter +
            secondary.z * depthJitter
    ].map(value =>
        clamp(value, 0.30, 0.70)
    );


    // --------------------------------------
    // 依玉料體積控制尺寸
    // --------------------------------------

    const volume = Math.max(
        0,
        Number(mass.volumePercent) || 0
    );

    const countScale = clamp(
        Math.sqrt(5 / count),
        0.62,
        1
    );

    const fitRatio = clamp(
        0.16 + Math.sqrt(volume / 100) * 0.25,
        0.17,
        0.34
    ) * countScale;


    // --------------------------------------
    // 方向略有變化，但保持玉脈整體方向
    // --------------------------------------

    const rotation = {
        x: baseRotation.x + randomBetween(random, -0.16, 0.16),
        y: baseRotation.y + randomBetween(random, -0.20, 0.20),
        z: baseRotation.z + randomBetween(random, -0.16, 0.16)
    };

    const placed = meshPlacementUtils.createPlacement(
        reshaped,
        hostBounds,
        {
            rotation,

            fitRatio,

            padding: 0.035,

            normalizedPosition
        }
    );

    if (
        !placed ||
        !placed.mesh ||
        !Array.isArray(placed.mesh.vertices) ||
        !Array.isArray(placed.mesh.faces)
    ) {
        throw new Error(
            `玉料「${mass.name ?? index}」定位後的幾何資料無效。`
        );
    }

    return {
        geometry: placed.mesh,

        placement: {
            ...(placed.placement ?? {}),

            naturalDeposit: true,

            depositSeed: sourceSeed
        }
    };
}


// ==========================================
// 強制原石材質不透明
// ==========================================

function enforceOpaqueMaterial(material) {
    if (!material) return;

    const materials = Array.isArray(material)
        ? material
        : [material];

    for (const item of materials) {
        if (!item) continue;

        item.transparent = false;
        item.opacity = 1;
        item.depthWrite = true;
        item.side = THREE.DoubleSide;
        item.needsUpdate = true;
    }
}


// ==========================================
// 建立切面朝向鏡頭的群組
// ==========================================

function createFacingGroup(
    outwardNormal,
    viewDirection,
    horizontalOffset
) {
    const group = new THREE.Group();

    const sourceDirection = new THREE.Vector3(
        outwardNormal[0],
        outwardNormal[1],
        outwardNormal[2]
    ).normalize();

    const targetDirection = viewDirection
        .clone()
        .normalize();

    group.quaternion.setFromUnitVectors(
        sourceDirection,
        targetDirection
    );

    group.position.set(
        horizontalOffset,
        0,
        0
    );

    return group;
}


// ==========================================
// 加入石質切面
// ==========================================

function addStoneCutSurface(
    group,
    triangles,
    plane,
    outwardNormal,
    basis,
    bounds,
    material,
    name
) {
    const surface = createTexturedSurface(
        triangles,
        plane,
        outwardNormal,
        basis,
        bounds,
        material,
        VISUAL_CONFIG.stoneSurfaceOffset,
        name
    );

    if (!surface) {
        return false;
    }

    group.add(surface);

    return true;
}


// ==========================================
// 加入玉肉切面
// ==========================================

function addJadeCutSurfaces(
    cuttingUI,
    group,
    masses,
    plane,
    outwardNormal,
    basis,
    bounds
) {
    if (!Array.isArray(masses)) {
        return 0;
    }

    let count = 0;

    for (const mass of masses) {
        if (!mass?.geometry) {
            continue;
        }

        const triangles = extractPlaneTriangles(
            mass.geometry,
            plane
        );

        if (triangles.length === 0) {
            continue;
        }

        const color = cuttingUI.getJadeColor(
            mass.jadeType
        );

        const seed = hashString(
            `${mass.id ?? mass.name ?? count}|${mass.jadeType ?? "jade"}`
        );

        const material = createJadeCutMaterial(
            color,
            seed
        );

        const surface = createTexturedSurface(
            triangles,
            plane,
            outwardNormal,
            basis,
            bounds,
            material,
            VISUAL_CONFIG.jadeSurfaceOffset,
            `${mass.name ?? "玉料"}天然色帶切面`
        );

        if (!surface) {
            material.dispose();
            material.map?.dispose();
            continue;
        }

        surface.userData.jadeType =
            mass.jadeType ?? null;

        group.add(surface);

        count++;
    }

    return count;
}


// ==========================================
// 更新體積顯示
// ==========================================

function updateVolumeDisplay(cuttingUI, result) {
    const elements = cuttingUI.elements;

    const original = Number(result.originalVolume) || 0;
    const positive = Number(result.positiveVolume) || 0;
    const negative = Number(result.negativeVolume) || 0;
    const removed = Number(result.removedVolume) || 0;

    if (elements.originalVolume) {
        elements.originalVolume.textContent =
            original.toFixed(4);
    }

    if (elements.positiveVolume) {
        elements.positiveVolume.textContent =
            positive.toFixed(4);
    }

    if (elements.negativeVolume) {
        elements.negativeVolume.textContent =
            negative.toFixed(4);
    }

    if (elements.removedVolume) {
        elements.removedVolume.textContent =
            removed.toFixed(4);
    }

    const total =
        positive +
        negative +
        removed;

    const difference = Math.abs(
        original - total
    );

    if (elements.volumeDifference) {
        elements.volumeDifference.textContent =
            difference.toFixed(8);
    }
}


// ==========================================
// 覆寫玉肉定位方式
// ==========================================

cuttingUI.createStableJadePlacement =
    createNaturalJadePlacement;


// ==========================================
// 建立切割結果畫面
// ==========================================

cuttingUI.displayResults = function (
    result,
    jadeSplit = null
) {
    if (
        !this.scene ||
        !this.camera ||
        !this.controls
    ) {
        throw new Error(
            "切割工作台場景尚未初始化。"
        );
    }

    if (
        !this.isValidGeometry(result?.positivePiece) ||
        !this.isValidGeometry(result?.negativePiece)
    ) {
        throw new Error(
            "切割結果缺少有效的原石幾何資料。"
        );
    }

    if (
        !this.materials.positive ||
        !this.materials.negative
    ) {
        throw new Error(
            "切割結果材質尚未初始化。"
        );
    }


    // 清除上一輪結果。

    this.clearGroup(this.originalGroup);
    this.clearGroup(this.resultGroup);

    this.clearPreview();

    this.originalGroup = null;
    this.resultGroup = null;


    // 重設鏡頭。

    this.resetCamera();

    const cameraTarget = this.controls.target;

    const viewDirection = this.camera.position
        .clone()
        .sub(cameraTarget)
        .normalize();


    // 原石外殼保持不透明。

    enforceOpaqueMaterial(this.materials.positive);
    enforceOpaqueMaterial(this.materials.negative);
    enforceOpaqueMaterial(this.materials.original);


    // 建立切割平面。

    const planes = createCutPlanes(result);

    const basis = createPlaneBasis(
        planes.positive.normal
    );


    // 擷取原石真正的剖面。

    const positiveStoneTriangles =
        extractPlaneTriangles(
            result.positivePiece,
            planes.positive
        );

    const negativeStoneTriangles =
        extractPlaneTriangles(
            result.negativePiece,
            planes.negative
        );


    // 兩側共用同一組 UV 範圍。

    const bounds = calculateProjectedBounds(
        [
            positiveStoneTriangles,
            negativeStoneTriangles
        ],
        basis
    );


    // 以切割資料產生固定紋理種子。

    const textureSeed = hashString(
        [
            result.originalVolume,
            result.cutPlane.point.join(","),
            result.cutPlane.normal.join(",")
        ].join("|")
    );

    const stoneCutMaterial = createStoneCutMaterial(
        textureSeed
    );


    // 建立兩側展示群組。

    const positiveGroup = createFacingGroup(
        planes.positiveOutward,
        viewDirection,
        -VISUAL_CONFIG.sideSpacing
    );

    const negativeGroup = createFacingGroup(
        planes.negativeOutward,
        viewDirection,
        VISUAL_CONFIG.sideSpacing
    );


    // --------------------------------------
    // 正側原石
    // --------------------------------------

    const positiveStone = this.createStoneMesh(
        result.positivePiece,
        this.materials.positive
    );

    positiveStone.name = "正側原石外殼";

    positiveGroup.add(positiveStone);


    // --------------------------------------
    // 負側原石
    // --------------------------------------

    const negativeStone = this.createStoneMesh(
        result.negativePiece,
        this.materials.negative
    );

    negativeStone.name = "負側原石外殼";

    negativeGroup.add(negativeStone);


    // --------------------------------------
    // 正側石質剖面
    // --------------------------------------

    const positiveStoneSurface = addStoneCutSurface(
        positiveGroup,
        positiveStoneTriangles,
        planes.positive,
        planes.positiveOutward,
        basis,
        bounds,
        stoneCutMaterial,
        "正側原石石質剖面"
    );


    // --------------------------------------
    // 負側石質剖面
    // --------------------------------------

    const negativeStoneMaterial =
        stoneCutMaterial.clone();

    negativeStoneMaterial.map =
        stoneCutMaterial.map;

    const negativeStoneSurface = addStoneCutSurface(
        negativeGroup,
        negativeStoneTriangles,
        planes.negative,
        planes.negativeOutward,
        basis,
        bounds,
        negativeStoneMaterial,
        "負側原石石質剖面"
    );


    // --------------------------------------
    // 正側玉肉剖面
    // --------------------------------------

    const positiveMasses =
        jadeSplit?.positive?.masses ?? [];

    const positiveSurfaceCount = addJadeCutSurfaces(
        this,
        positiveGroup,
        positiveMasses,
        planes.positive,
        planes.positiveOutward,
        basis,
        bounds
    );


    // --------------------------------------
    // 負側玉肉剖面
    // --------------------------------------

    const negativeMasses =
        jadeSplit?.negative?.masses ?? [];

    const negativeSurfaceCount = addJadeCutSurfaces(
        this,
        negativeGroup,
        negativeMasses,
        planes.negative,
        planes.negativeOutward,
        basis,
        bounds
    );


    // --------------------------------------
    // 組合結果
    // --------------------------------------

    this.resultGroup = new THREE.Group();

    this.resultGroup.name = "自然翡翠剖面展示";

    this.resultGroup.add(
        positiveGroup,
        negativeGroup
    );

    this.scene.add(this.resultGroup);


    // 保存結果，供檢視切換使用。

    this.currentResult = result;
    this.currentView = "results";


    // 更新體積。

    updateVolumeDisplay(
        this,
        result
    );

    this.updateViewButtons();


    console.log(
        "[切割視覺] 自然石質剖面已建立。"
    );

    console.log(
        "[切割視覺] 正側玉肉切面數量：",
        positiveSurfaceCount
    );

    console.log(
        "[切割視覺] 負側玉肉切面數量：",
        negativeSurfaceCount
    );

    console.log(
        "[切割視覺] 石質剖面：",
        {
            positive: positiveStoneSurface,
            negative: negativeStoneSurface
        }
    );
};


// ==========================================
// 原石檢視切換
// 保留切割結果，不銷毀結果幾何
// ==========================================

cuttingUI.showOriginal = function () {
    if (!this.currentMesh) {
        return;
    }

    this.clearGroup(this.originalGroup);

    this.clearPreview();

    this.originalGroup = null;

    if (this.resultGroup) {
        this.scene.remove(this.resultGroup);
    }

    this.originalGroup = new THREE.Group();

    this.originalGroup.name = "原石檢視";

    this.originalGroup.add(
        this.createStoneMesh(
            this.currentMesh,
            this.materials.original
        )
    );

    this.scene.add(this.originalGroup);

    this.currentView = "original";

    this.resetCamera();

    this.updateCutPreview();

    this.updateViewButtons();
};


// ==========================================
// 切割結果檢視切換
// ==========================================

cuttingUI.showResults = function () {
    if (
        !this.currentResult ||
        !this.resultGroup
    ) {
        return;
    }

    this.clearGroup(this.originalGroup);

    this.originalGroup = null;

    this.clearPreview();

    this.scene.add(this.resultGroup);

    this.currentView = "results";

    this.resetCamera();

    this.updateViewButtons();
};


// ==========================================
// 模組載入完成
// ==========================================

console.log(
    "[切割視覺] 自然石質剖面、玉肉色帶與不透明外殼系統已載入。"
);

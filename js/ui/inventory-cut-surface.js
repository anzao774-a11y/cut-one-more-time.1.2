
import * as THREE from "three";

import { inventory3DPreview } from "./inventory-3d-preview.js";


// ==========================================
// 固定亂數
// ==========================================

function hashString(value) {
    let hash = 2166136261;

    for (const char of String(value)) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
}


function createRandom(seed) {
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


// ==========================================
// 向量與切面工具
// ==========================================

function normalize(vector) {
    const length = Math.hypot(
        vector[0],
        vector[1],
        vector[2]
    );

    if (!Number.isFinite(length) || length < 1e-10) {
        throw new Error("剖面法線無效。");
    }

    return vector.map(value => value / length);
}


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


function getPlaneDistance(vertex, plane) {
    return (
        (vertex[0] - plane.point[0]) * plane.normal[0] +
        (vertex[1] - plane.point[1]) * plane.normal[1] +
        (vertex[2] - plane.point[2]) * plane.normal[2]
    );
}


// ==========================================
// 擷取真正位於切割平面的三角面
// ==========================================

function extractPlaneTriangles(mesh, plane) {
    if (
        !mesh ||
        !Array.isArray(mesh.vertices) ||
        !Array.isArray(mesh.faces)
    ) {
        return [];
    }

    const triangles = [];

    for (const face of mesh.faces) {
        if (
            !Array.isArray(face) ||
            face.length !== 3 ||
            !face.every(index =>
                Number.isInteger(index) &&
                index >= 0 &&
                index < mesh.vertices.length
            )
        ) {
            continue;
        }

        const vertices = face.map(
            index => mesh.vertices[index]
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
                Math.abs(distance) <= 0.00005
            )
        ) {
            triangles.push(vertices);
        }
    }

    return triangles;
}


// ==========================================
// 計算切面 UV 範圍
// ==========================================

function calculateBounds(triangleSets, basis) {
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
        return null;
    }

    const padding = 0.015;

    return {
        minU: minU - padding,
        maxU: maxU + padding,
        minV: minV - padding,
        maxV: maxV + padding
    };
}


// ==========================================
// 建立固定種子的切面紋理
// ==========================================

function createSurfaceCanvas(baseColor, seed, jade = false) {
    const canvas = document.createElement("canvas");

    canvas.width = 512;
    canvas.height = 512;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
        throw new Error("無法建立剖面紋理畫布。");
    }

    const random = createRandom(seed);

    const base = new THREE.Color(baseColor);

    const baseHex = `#${base.getHexString()}`;

    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, 512, 512);

    // 天然色彩雲霧
    for (let i = 0; i < 100; i++) {
        const x = random() * 512;
        const y = random() * 512;

        const radius = 20 + random() * 100;

        const gradient = ctx.createRadialGradient(
            x,
            y,
            0,
            x,
            y,
            radius
        );

        if (jade) {
            gradient.addColorStop(
                0,
                "rgba(235,245,218,0.24)"
            );

            gradient.addColorStop(
                1,
                "rgba(45,85,55,0)"
            );
        } else {
            gradient.addColorStop(
                0,
                "rgba(210,205,180,0.13)"
            );

            gradient.addColorStop(
                1,
                "rgba(45,45,35,0)"
            );
        }

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

    // 天然纖維與紋理
    for (let i = 0; i < (jade ? 190 : 260); i++) {
        const x = random() * 512;
        const y = random() * 512;

        const length = 12 + random() * 100;

        const angle =
            random() * Math.PI * 2;

        ctx.beginPath();

        ctx.moveTo(x, y);

        ctx.bezierCurveTo(
            x + Math.cos(angle) * length * 0.3,
            y + Math.sin(angle) * length * 0.3,
            x + Math.cos(angle + 0.2) * length * 0.7,
            y + Math.sin(angle + 0.2) * length * 0.7,
            x + Math.cos(angle) * length,
            y + Math.sin(angle) * length
        );

        if (jade) {
            ctx.strokeStyle = random() > 0.5
                ? "rgba(235,250,220,0.20)"
                : "rgba(35,75,45,0.17)";

            ctx.lineWidth = 0.5 + random() * 2.2;
        } else {
            ctx.strokeStyle = random() > 0.5
                ? "rgba(225,215,190,0.17)"
                : "rgba(35,35,28,0.20)";

            ctx.lineWidth = 0.5 + random() * 1.8;
        }

        ctx.stroke();
    }

    // 不規則礦物色帶
    if (jade) {
        for (let i = 0; i < 12; i++) {
            const startY = random() * 512;
            const amplitude = 8 + random() * 35;

            ctx.beginPath();

            ctx.moveTo(0, startY);

            for (let x = 0; x <= 512; x += 32) {
                const y =
                    startY +
                    Math.sin(x * 0.012 + random()) * amplitude +
                    Math.sin(x * 0.025) * amplitude * 0.35;

                ctx.lineTo(x, y);
            }

            ctx.strokeStyle = random() > 0.5
                ? "rgba(235,245,215,0.16)"
                : "rgba(25,75,40,0.15)";

            ctx.lineWidth = 2 + random() * 7;

            ctx.lineCap = "round";

            ctx.stroke();
        }
    }

    return canvas;
}


// ==========================================
// Three.js 紋理
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
// 建立剖面網格
// ==========================================

function createSurfaceMesh(
    triangles,
    outwardNormal,
    basis,
    bounds,
    material,
    offset,
    name
) {
    if (!triangles.length || !bounds) {
        return null;
    }

    const positions = [];
    const uvs = [];

    const normal = new THREE.Vector3(
        outwardNormal[0],
        outwardNormal[1],
        outwardNormal[2]
    ).normalize();

    const width = Math.max(
        bounds.maxU - bounds.minU,
        1e-8
    );

    const height = Math.max(
        bounds.maxV - bounds.minV,
        1e-8
    );

    for (const triangle of triangles) {
        for (const vertex of triangle) {
            const point = new THREE.Vector3(
                vertex[0],
                vertex[1],
                vertex[2]
            );

            point.addScaledVector(
                normal,
                offset
            );

            positions.push(
                point.x,
                point.y,
                point.z
            );

            const projected = projectPoint(
                vertex,
                basis
            );

            uvs.push(
                (projected.u - bounds.minU) / width,
                (projected.v - bounds.minV) / height
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

    const mesh = new THREE.Mesh(
        geometry,
        material
    );

    mesh.name = name;

    mesh.renderOrder = 3;

    mesh.castShadow = false;
    mesh.receiveShadow = true;

    return mesh;
}


// ==========================================
// 切割平面還原
// ==========================================

function createSavedCutPlane(stone) {
    const cutData = stone?.cutData;
    const sourcePlane = cutData?.cutPlane;

    if (
        !sourcePlane ||
        !Array.isArray(sourcePlane.point) ||
        !Array.isArray(sourcePlane.normal) ||
        sourcePlane.point.length !== 3 ||
        sourcePlane.normal.length !== 3 ||
        !sourcePlane.point.every(Number.isFinite) ||
        !sourcePlane.normal.every(Number.isFinite)
    ) {
        return null;
    }

    const normal = normalize(
        sourcePlane.normal
    );

    const thickness = Number(
        cutData.bladeThickness
    );

    const halfThickness =
        Number.isFinite(thickness)
            ? Math.max(0, thickness) / 2
            : 0;

    const positive = stone.cutSide === "positive";

    if (!positive && stone.cutSide !== "negative") {
        return null;
    }

    const direction = positive ? 1 : -1;

    const point = sourcePlane.point.map(
        (value, axis) =>
            value + normal[axis] * halfThickness * direction
    );

    const planeNormal = positive
        ? [...normal]
        : normal.map(value => -value);

    const outwardNormal = positive
        ? normal.map(value => -value)
        : [...normal];

    return {
        plane: {
            point,
            normal: planeNormal
        },

        outwardNormal
    };
}


// ==========================================
// 建立切割產物預覽
// ==========================================

function setupCutPreview(stone) {
    const hasStoneGeometry =
        Array.isArray(stone.geometry?.vertices) &&
        Array.isArray(stone.geometry?.faces) &&
        stone.geometry.vertices.length >= 4 &&
        stone.geometry.faces.length >= 4;

    const masses = Array.isArray(stone.jadeData?.masses)
        ? stone.jadeData.masses
        : [];

    this.previewGroup = new THREE.Group();

    this.previewGroup.name = "切割產物內部玉石";

    for (const mass of masses) {
        try {
            this.validateGeometry(mass?.geometry);

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

    this.scene.add(this.previewGroup);


    // ======================================
    // 重建不透明原石外殼
    // ======================================

    if (hasStoneGeometry) {
        const geometry = this.meshToGeometry(
            stone.geometry
        );

        this.stoneMaterial =
            new THREE.MeshStandardMaterial({
                color: 0x777b68,
                roughness: 0.78,
                metalness: 0.05,
                flatShading: true,
                transparent: false,
                opacity: 1,
                depthWrite: true
            });

        this.stoneMesh = new THREE.Mesh(
            geometry,
            this.stoneMaterial
        );

        this.stoneMesh.name = "切割後原石外殼";

        this.stoneMesh.castShadow = true;
        this.stoneMesh.receiveShadow = true;

        this.scene.add(this.stoneMesh);
    }


    // ======================================
    // 重建真正的切面紋理
    // ======================================

    const savedPlane = createSavedCutPlane(stone);

    if (
        savedPlane &&
        hasStoneGeometry
    ) {
        const { plane, outwardNormal } = savedPlane;

        const basis = createPlaneBasis(
            plane.normal
        );

        const stoneTriangles = extractPlaneTriangles(
            stone.geometry,
            plane
        );

        const jadeTriangleSets = [];

        for (const mass of masses) {
            const triangles = extractPlaneTriangles(
                mass.geometry,
                plane
            );

            jadeTriangleSets.push({
                mass,
                triangles
            });
        }

        const allTriangles = [
            stoneTriangles,
            ...jadeTriangleSets.map(item => item.triangles)
        ];

        const bounds = calculateBounds(
            allTriangles,
            basis
        );

        const seed = hashString(
            [
                stone.sourceStoneId ?? stone.id,
                stone.cutData.cutPlane.point.join(","),
                stone.cutData.cutPlane.normal.join(",")
            ].join("|")
        );

        // 石質切面
        if (stoneTriangles.length > 0 && bounds) {
            const canvas = createSurfaceCanvas(
                0x77796b,
                seed,
                false
            );

            const texture = createCanvasTexture(canvas);

            this.cutSurfaceTextures ??= [];
            this.cutSurfaceTextures.push(texture);

            const material = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map: texture,
                roughness: 0.92,
                metalness: 0,
                side: THREE.DoubleSide,
                transparent: false,
                polygonOffset: true,
                polygonOffsetFactor: -1,
                polygonOffsetUnits: -1
            });

            this.cutStoneSurface = createSurfaceMesh(
                stoneTriangles,
                outwardNormal,
                basis,
                bounds,
                material,
                0.0012,
                "保存的石質剖面"
            );

            if (this.cutStoneSurface) {
                this.scene.add(this.cutStoneSurface);
            } else {
                texture.dispose();
                material.dispose();
            }
        }

        // 玉肉切面
        this.cutJadeSurfaces = [];

        for (let index = 0; index < jadeTriangleSets.length; index++) {
            const item = jadeTriangleSets[index];

            if (
                item.triangles.length === 0 ||
                !bounds
            ) {
                continue;
            }

            const jadeType =
                item.mass.jadeType ?? "jade";

            const color = this.getJadeColor(
                jadeType
            );

            const jadeSeed = hashString(
                `${item.mass.id ?? index}|${jadeType}`
            );

            const canvas = createSurfaceCanvas(
                color,
                jadeSeed,
                true
            );

            const texture = createCanvasTexture(canvas);

            this.cutSurfaceTextures.push(texture);

            const material = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map: texture,
                roughness: 0.48,
                metalness: 0.015,
                side: THREE.DoubleSide,
                transparent: false,
                polygonOffset: true,
                polygonOffsetFactor: -2,
                polygonOffsetUnits: -2
            });

            const surface = createSurfaceMesh(
                item.triangles,
                outwardNormal,
                basis,
                bounds,
                material,
                0.0024,
                `${jadeType} 玉肉剖面`
            );

            if (surface) {
                surface.userData.jadeType = jadeType;

                this.scene.add(surface);

                this.cutJadeSurfaces.push(surface);

            } else {
                texture.dispose();
                material.dispose();
            }
        }

        console.log(
            "[背包剖面] 已重建切面：",
            {
                stone: stoneTriangles.length,
                jade: this.cutJadeSurfaces.length,
                side: stone.cutSide
            }
        );
    }


    // ======================================
    // 統一置中與相機範圍
    // ======================================

    const combinedBounds = new THREE.Box3();

    combinedBounds.makeEmpty();

    if (this.stoneMesh) {
        combinedBounds.union(
            new THREE.Box3().setFromObject(
                this.stoneMesh
            )
        );
    }

    if (this.previewGroup.children.length > 0) {
        combinedBounds.union(
            new THREE.Box3().setFromObject(
                this.previewGroup
            )
        );
    }

    if (this.cutStoneSurface) {
        combinedBounds.union(
            new THREE.Box3().setFromObject(
                this.cutStoneSurface
            )
        );
    }

    for (const surface of this.cutJadeSurfaces ?? []) {
        combinedBounds.union(
            new THREE.Box3().setFromObject(surface)
        );
    }

    if (combinedBounds.isEmpty()) {
        throw new Error("切割產物沒有可顯示的幾何資料。");
    }

    const center = new THREE.Vector3();

    combinedBounds.getCenter(center);

    this.previewGroup.position.sub(center);

    if (this.stoneMesh) {
        this.stoneMesh.position.sub(center);
    }

    if (this.cutStoneSurface) {
        this.cutStoneSurface.position.sub(center);
    }

    for (const surface of this.cutJadeSurfaces ?? []) {
        surface.position.sub(center);
    }

    combinedBounds.setFromObject(
        this.previewGroup
    );

    if (this.stoneMesh) {
        combinedBounds.union(
            new THREE.Box3().setFromObject(
                this.stoneMesh
            )
        );
    }

    if (this.cutStoneSurface) {
        combinedBounds.union(
            new THREE.Box3().setFromObject(
                this.cutStoneSurface
            )
        );
    }

    for (const surface of this.cutJadeSurfaces ?? []) {
        combinedBounds.union(
            new THREE.Box3().setFromObject(surface)
        );
    }

    this.fitCamera(combinedBounds);
}


// ==========================================
// 接入原本的背包預覽系統
// ==========================================

const originalSetupPreview =
    inventory3DPreview.setupPreview;

inventory3DPreview.setupPreview = function (stone) {
    if (stone?.status === "cut") {
        setupCutPreview.call(this, stone);
        return;
    }

    originalSetupPreview.call(this, stone);
};


// ==========================================
// 剖面資源清理
// ==========================================

const originalDestroy =
    inventory3DPreview.destroy;

inventory3DPreview.destroy = function () {
    if (this.cutStoneSurface) {
        this.cutStoneSurface.geometry?.dispose();
        this.cutStoneSurface.material?.dispose();
        this.cutStoneSurface.removeFromParent();

        this.cutStoneSurface = null;
    }

    for (const surface of this.cutJadeSurfaces ?? []) {
        surface.geometry?.dispose();
        surface.material?.dispose();
        surface.removeFromParent();
    }

    this.cutJadeSurfaces = [];

    for (const texture of this.cutSurfaceTextures ?? []) {
        texture.dispose();
    }

    this.cutSurfaceTextures = [];

    return originalDestroy.call(this);
};


// ==========================================
// 顯示控制同步
// ==========================================

const originalSetInclusionsVisible =
    inventory3DPreview.setInclusionsVisible;

inventory3DPreview.setInclusionsVisible = function (visible) {
    const result = originalSetInclusionsVisible.call(
        this,
        visible
    );

    for (const surface of this.cutJadeSurfaces ?? []) {
        surface.visible = Boolean(visible);
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

    if (this.cutStoneSurface) {
        this.cutStoneSurface.visible = Boolean(visible);
    }

    return result;
};


console.log(
    "[背包剖面] 切割剖面持久化預覽模組已載入。"
);

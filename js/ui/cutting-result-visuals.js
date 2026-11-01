// js/ui/cutting-result-visuals.js

import * as THREE from "three";

import { cuttingUI } from "./cutting-ui.js";

import {
    stoneGeometryGenerator
} from "../systems/stone-geometry-generator.js";

import {
    jadeGeometryGenerator
} from "../systems/jade-geometry-generator.js";


// ==========================================
// 固定種子的亂數
// ==========================================

function createSeededRandom(seed) {
    const text = String(seed ?? "natural-stone");

    let state = 2166136261;

    for (let index = 0; index < text.length; index++) {
        state ^= text.charCodeAt(index);
        state = Math.imul(state, 16777619);
    }

    return function random() {
        state += 0x6D2B79F5;

        let value = state;

        value = Math.imul(
            value ^ (value >>> 15),
            value | 1
        );

        value ^= value + Math.imul(
            value ^ (value >>> 7),
            value | 61
        );

        return (
            (value ^ (value >>> 14)) >>> 0
        ) / 4294967296;
    };
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

    if (length <= 1e-10) {
        return [0, 1, 0];
    }

    return [
        vector[0] / length,
        vector[1] / length,
        vector[2] / length
    ];
}


// ==========================================
// 天然不規則幾何形變
// ==========================================

function naturalizeGeometry(
    geometry,
    seed,
    strength,
    elongationRange
) {
    if (
        !geometry ||
        !Array.isArray(geometry.vertices) ||
        !Array.isArray(geometry.faces)
    ) {
        throw new Error("天然外型處理收到無效幾何資料。");
    }

    if (
        geometry.metadata?.naturalizedVersion === 2
    ) {
        return geometry;
    }

    const random = createSeededRandom(seed);

    const elongation = [
        elongationRange[0] +
            random() * (
                elongationRange[1] -
                elongationRange[0]
            ),

        elongationRange[0] +
            random() * (
                elongationRange[1] -
                elongationRange[0]
            ),

        elongationRange[0] +
            random() * (
                elongationRange[1] -
                elongationRange[0]
            )
    ];

    const phase = [
        random() * Math.PI * 2,
        random() * Math.PI * 2,
        random() * Math.PI * 2
    ];

    const center = [0, 0, 0];

    for (const vertex of geometry.vertices) {
        center[0] += vertex[0] / geometry.vertices.length;
        center[1] += vertex[1] / geometry.vertices.length;
        center[2] += vertex[2] / geometry.vertices.length;
    }

    const vertices = geometry.vertices.map(vertex => {
        const relative = [
            vertex[0] - center[0],
            vertex[1] - center[1],
            vertex[2] - center[2]
        ];

        const direction = normalizeVector(relative);

        const randomDisplacement =
            (random() * 2 - 1) * strength;

        const naturalWave =
            Math.sin(direction[0] * 3.7 + phase[0]) *
            Math.sin(direction[1] * 3.1 + phase[1]) *
            Math.cos(direction[2] * 3.9 + phase[2]);

        const ridgeDisplacement =
            naturalWave * strength * 0.35;

        const radialScale = Math.max(
            0.68,
            1 + randomDisplacement + ridgeDisplacement
        );

        return [
            center[0] +
                relative[0] * radialScale * elongation[0],

            center[1] +
                relative[1] * radialScale * elongation[1],

            center[2] +
                relative[2] * radialScale * elongation[2]
        ];
    });

    const result = {
        ...geometry,
        vertices,
        faces: geometry.faces.map(face => [...face]),
        metadata: {
            ...(geometry.metadata ?? {}),
            naturalizedVersion: 2
        }
    };

    return result;
}


// ==========================================
// 原石生成器外型強化
// ==========================================

const originalStoneGenerate =
    stoneGeometryGenerator.generate.bind(
        stoneGeometryGenerator
    );

stoneGeometryGenerator.generate = function (
    rarity,
    seed
) {
    const geometry = originalStoneGenerate(
        rarity,
        seed
    );

    const irregularityByRarity = {
        gypsy: 0.17,
        common: 0.16,
        rare: 0.15,
        epic: 0.14,
        legendary: 0.13
    };

    const strength =
        irregularityByRarity[rarity] ?? 0.16;

    const naturalized = naturalizeGeometry(
        geometry,
        `stone-${rarity}-${seed}`,
        strength,
        [0.78, 1.22]
    );

    const validation = stoneGeometryGenerator.validate(
        naturalized
    );

    naturalized.metadata = {
        ...(naturalized.metadata ?? {}),
        generatorVersion: 2,
        naturalizedVersion: 2,
        volume: validation.volume,
        vertexCount: validation.vertexCount,
        faceCount: validation.faceCount
    };

    return naturalized;
};


// ==========================================
// 玉石生成器外型強化
// ==========================================

const originalJadeGenerate =
    jadeGeometryGenerator.generate.bind(
        jadeGeometryGenerator
    );

jadeGeometryGenerator.generate = function (
    jadeType,
    rarity,
    seed
) {
    const geometry = originalJadeGenerate(
        jadeType,
        rarity,
        seed
    );

    const irregularityByRarity = {
        gypsy: 0.23,
        common: 0.21,
        rare: 0.19,
        epic: 0.17,
        legendary: 0.15,
        special: 0.14
    };

    const strength =
        irregularityByRarity[rarity] ?? 0.20;

    const naturalized = naturalizeGeometry(
        geometry,
        `jade-${jadeType}-${rarity}-${seed}`,
        strength,
        [0.76, 1.24]
    );

    const validation = jadeGeometryGenerator.validate(
        naturalized
    );

    naturalized.metadata = {
        ...(naturalized.metadata ?? {}),
        generatorVersion: 2,
        naturalizedVersion: 2,
        volume: validation.volume,
        vertexCount: validation.vertexCount,
        faceCount: validation.faceCount
    };

    return naturalized;
};


// ==========================================
// 建立切面平面
// ==========================================

function createCutPlanes(result) {
    const plane = result?.cutPlane;

    if (
        !plane ||
        !Array.isArray(plane.point) ||
        !Array.isArray(plane.normal) ||
        plane.point.length !== 3 ||
        plane.normal.length !== 3
    ) {
        throw new Error("切割結果缺少有效的切割平面。");
    }

    const normal = normalizeVector(plane.normal);

    const halfThickness = Math.max(
        0,
        Number(result.bladeThickness) || 0
    ) / 2;

    const positivePoint = plane.point.map(
        (value, axis) =>
            value + normal[axis] * halfThickness
    );

    const negativePoint = plane.point.map(
        (value, axis) =>
            value - normal[axis] * halfThickness
    );

    return {
        positive: {
            point: positivePoint,
            normal
        },

        negative: {
            point: negativePoint,
            normal: normal.map(value => -value)
        },

        positiveOutward: normal.map(value => -value),
        negativeOutward: [...normal]
    };
}


// ==========================================
// 從玉料幾何中擷取真正的切割封口面
// ==========================================

function createJadeCutSurface(
    mass,
    plane,
    outwardNormal,
    color
) {
    const geometryData = mass?.geometry;

    if (
        !geometryData ||
        !Array.isArray(geometryData.vertices) ||
        !Array.isArray(geometryData.faces)
    ) {
        return null;
    }

    const positions = [];

    const offset = 0.002;

    const tolerance = 1e-5;

    for (const face of geometryData.faces) {
        const vertices = face.map(
            index => geometryData.vertices[index]
        );

        if (vertices.some(vertex => !vertex)) {
            continue;
        }

        const distances = vertices.map(vertex => {
            return (
                (vertex[0] - plane.point[0]) *
                    plane.normal[0] +

                (vertex[1] - plane.point[1]) *
                    plane.normal[1] +

                (vertex[2] - plane.point[2]) *
                    plane.normal[2]
            );
        });

        // 只有三個頂點都位於真正切割平面上的面，
        // 才能當成玉料切割後的截面。
        if (
            !distances.every(
                distance => Math.abs(distance) <= tolerance
            )
        ) {
            continue;
        }

        for (const vertex of vertices) {
            positions.push(
                vertex[0] + outwardNormal[0] * offset,
                vertex[1] + outwardNormal[1] * offset,
                vertex[2] + outwardNormal[2] * offset
            );
        }
    }

    if (positions.length === 0) {
        return null;
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
            positions,
            3
        )
    );

    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    const material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.19,
        metalness: 0.025,
        side: THREE.DoubleSide,
        transparent: false,
        opacity: 1,
        depthWrite: true
    });

    const surface = new THREE.Mesh(
        geometry,
        material
    );

    surface.name = `${mass.name ?? "玉料"}切割截面`;

    surface.userData.ownsMaterial = true;
    surface.userData.jadeType = mass.jadeType ?? null;

    surface.castShadow = false;
    surface.receiveShadow = true;

    return surface;
}


// ==========================================
// 建立朝向玩家的切割結果群組
// ==========================================

function createFacingGroup(
    camera,
    controls,
    outwardNormal,
    horizontalOffset
) {
    const group = new THREE.Group();

    const target = controls?.target
        ? controls.target.clone()
        : new THREE.Vector3(0, 0, 0);

    const viewDirection = camera.position
        .clone()
        .sub(target)
        .normalize();

    const cutDirection = new THREE.Vector3(
        outwardNormal[0],
        outwardNormal[1],
        outwardNormal[2]
    ).normalize();

    group.quaternion.setFromUnitVectors(
        cutDirection,
        viewDirection
    );

    group.position.set(
        horizontalOffset,
        0,
        0
    );

    return group;
}


// ==========================================
// 保持原石材質不透明
// ==========================================

function enforceOpaqueMaterial(material) {
    if (!material) return;

    material.transparent = false;
    material.opacity = 1;
    material.depthWrite = true;
    material.side = THREE.DoubleSide;
    material.needsUpdate = true;
}


// ==========================================
// 顯示切割結果
// ==========================================

cuttingUI.displayResults = function (
    result,
    jadeSplit = null
) {
    this.clearGroup(this.originalGroup);
    this.clearGroup(this.resultGroup);
    this.clearPreview();

    this.originalGroup = null;

    if (!this.materials.positive || !this.materials.negative) {
        throw new Error("切割結果材質尚未初始化。");
    }

    enforceOpaqueMaterial(this.materials.positive);
    enforceOpaqueMaterial(this.materials.negative);
    enforceOpaqueMaterial(this.materials.original);

    const planes = createCutPlanes(result);

    const positiveGroup = createFacingGroup(
        this.camera,
        this.controls,
        planes.positiveOutward,
        -1.35
    );

    const negativeGroup = createFacingGroup(
        this.camera,
        this.controls,
        planes.negativeOutward,
        1.35
    );

    // ------------------------------
    // 正側原石外殼
    // ------------------------------

    positiveGroup.add(
        this.createStoneMesh(
            result.positivePiece,
            this.materials.positive
        )
    );

    // ------------------------------
    // 負側原石外殼
    // ------------------------------

    negativeGroup.add(
        this.createStoneMesh(
            result.negativePiece,
            this.materials.negative
        )
    );

    // ------------------------------
    // 正側玉料切面
    // ------------------------------

    const positiveMasses =
        jadeSplit?.positive?.masses ?? [];

    for (const mass of positiveMasses) {
        const surface = createJadeCutSurface(
            mass,
            planes.positive,
            planes.positiveOutward,
            this.getJadeColor(mass.jadeType)
        );

        if (surface) {
            positiveGroup.add(surface);
        }
    }

    // ------------------------------
    // 負側玉料切面
    // ------------------------------

    const negativeMasses =
        jadeSplit?.negative?.masses ?? [];

    for (const mass of negativeMasses) {
        const surface = createJadeCutSurface(
            mass,
            planes.negative,
            planes.negativeOutward,
            this.getJadeColor(mass.jadeType)
        );

        if (surface) {
            negativeGroup.add(surface);
        }
    }

    this.resultGroup = new THREE.Group();

    this.resultGroup.add(
        positiveGroup,
        negativeGroup
    );

    this.scene.add(this.resultGroup);

    // ------------------------------
    // 體積資訊
    // ------------------------------

    if (this.elements.originalVolume) {
        this.elements.originalVolume.textContent =
            result.originalVolume.toFixed(4);
    }

    if (this.elements.positiveVolume) {
        this.elements.positiveVolume.textContent =
            result.positiveVolume.toFixed(4);
    }

    if (this.elements.negativeVolume) {
        this.elements.negativeVolume.textContent =
            result.negativeVolume.toFixed(4);
    }

    if (this.elements.removedVolume) {
        this.elements.removedVolume.textContent =
            result.removedVolume.toFixed(4);
    }

    const total =
        result.positiveVolume +
        result.negativeVolume +
        result.removedVolume;

    const difference = Math.abs(
        result.originalVolume - total
    );

    if (this.elements.volumeDifference) {
        this.elements.volumeDifference.textContent =
            difference.toFixed(8);
    }

    this.currentView = "results";

    this.resetCamera();

    this.updateViewButtons();
};


console.log(
    "[切割視覺] 不透明原石、天然幾何與玉料切面系統已載入。"
);

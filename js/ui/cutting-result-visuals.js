
// js/ui/cutting-result-visuals.js

import * as THREE from "three";

import { cuttingUI } from "./cutting-ui.js";


// ==========================================
// 切割視覺設定
// ==========================================

const VISUAL_CONFIG = {
    sideSpacing: 1.35,
    surfaceOffset: 0.0008,
    planeTolerance: 1e-6,
    jadeRoughness: 0.19,
    jadeMetalness: 0.025
};


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

    const normal = normalizeVector(sourcePlane.normal);

    const bladeThickness = Number(result.bladeThickness);

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

        positiveOutward: normal.map(value => -value),

        negativeOutward: [...normal]
    };
}


// ==========================================
// 擷取玉料真正的切割封口三角面
// ==========================================

function extractJadeCutTriangles(mass, plane) {
    const geometry = mass?.geometry;

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

        const isCutFace = distances.every(
            distance =>
                Math.abs(distance) <=
                VISUAL_CONFIG.planeTolerance
        );

        if (isCutFace) {
            triangles.push(vertices);
        }
    }

    return triangles;
}


// ==========================================
// 建立玉石切面
// ==========================================

function createJadeCutSurface(
    mass,
    plane,
    outwardNormal,
    color
) {
    const triangles = extractJadeCutTriangles(
        mass,
        plane
    );

    if (triangles.length === 0) {
        return null;
    }

    const positions = [];
    const offset = VISUAL_CONFIG.surfaceOffset;

    for (const triangle of triangles) {
        for (const vertex of triangle) {
            positions.push(
                vertex[0] + outwardNormal[0] * offset,
                vertex[1] + outwardNormal[1] * offset,
                vertex[2] + outwardNormal[2] * offset
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

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const material = new THREE.MeshStandardMaterial({
        color,
        roughness: VISUAL_CONFIG.jadeRoughness,
        metalness: VISUAL_CONFIG.jadeMetalness,
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
// 加入玉料切面
// ==========================================

function addJadeCutSurfaces(
    cuttingUI,
    group,
    masses,
    plane,
    outwardNormal
) {
    if (!Array.isArray(masses)) {
        return 0;
    }

    let count = 0;

    for (const mass of masses) {
        if (!mass?.geometry) {
            continue;
        }

        const surface = createJadeCutSurface(
            mass,
            plane,
            outwardNormal,
            cuttingUI.getJadeColor(mass.jadeType)
        );

        if (!surface) {
            continue;
        }

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

    if (elements.originalVolume) {
        elements.originalVolume.textContent =
            result.originalVolume.toFixed(4);
    }

    if (elements.positiveVolume) {
        elements.positiveVolume.textContent =
            result.positiveVolume.toFixed(4);
    }

    if (elements.negativeVolume) {
        elements.negativeVolume.textContent =
            result.negativeVolume.toFixed(4);
    }

    if (elements.removedVolume) {
        elements.removedVolume.textContent =
            result.removedVolume.toFixed(4);
    }

    const total =
        result.positiveVolume +
        result.negativeVolume +
        result.removedVolume;

    const difference = Math.abs(
        result.originalVolume - total
    );

    if (elements.volumeDifference) {
        elements.volumeDifference.textContent =
            difference.toFixed(8);
    }
}


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
        throw new Error("切割工作台場景尚未初始化。");
    }

    if (
        !this.isValidGeometry(result?.positivePiece) ||
        !this.isValidGeometry(result?.negativePiece)
    ) {
        throw new Error("切割結果缺少有效的原石幾何資料。");
    }

    if (
        !this.materials.positive ||
        !this.materials.negative
    ) {
        throw new Error("切割結果材質尚未初始化。");
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


    // 原石保持不透明。

    enforceOpaqueMaterial(this.materials.positive);
    enforceOpaqueMaterial(this.materials.negative);
    enforceOpaqueMaterial(this.materials.original);


    // 建立切割平面。

    const planes = createCutPlanes(result);


    // 建立兩側群組。

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


    // 正側原石。

    const positiveStone = this.createStoneMesh(
        result.positivePiece,
        this.materials.positive
    );

    positiveStone.name = "正側原石外殼";

    positiveGroup.add(positiveStone);


    // 負側原石。

    const negativeStone = this.createStoneMesh(
        result.negativePiece,
        this.materials.negative
    );

    negativeStone.name = "負側原石外殼";

    negativeGroup.add(negativeStone);


    // 正側玉料切面。

    const positiveMasses =
        jadeSplit?.positive?.masses ?? [];

    const positiveSurfaceCount = addJadeCutSurfaces(
        this,
        positiveGroup,
        positiveMasses,
        planes.positive,
        planes.positiveOutward
    );


    // 負側玉料切面。

    const negativeMasses =
        jadeSplit?.negative?.masses ?? [];

    const negativeSurfaceCount = addJadeCutSurfaces(
        this,
        negativeGroup,
        negativeMasses,
        planes.negative,
        planes.negativeOutward
    );


    // 組合結果。

    this.resultGroup = new THREE.Group();

    this.resultGroup.name = "切割結果展示";

    this.resultGroup.add(
        positiveGroup,
        negativeGroup
    );

    this.scene.add(this.resultGroup);


    // 更新狀態。

    this.currentResult = result;
    this.currentView = "results";

    updateVolumeDisplay(this, result);

    this.updateViewButtons();


    console.log("[切割視覺] 結果展示完成。");

    console.log("[切割視覺] 玉料切面數量：", {
        positive: positiveSurfaceCount,
        negative: negativeSurfaceCount
    });
};


// ==========================================
// 修正原石檢視切換
// 保留切割結果，不再提前銷毀
// ==========================================

cuttingUI.showOriginal = function () {
    if (!this.currentMesh) {
        return;
    }

    // 只清理原石展示群組。
    // resultGroup 必須保留，不能在切換時銷毀。

    this.clearGroup(this.originalGroup);

    this.clearPreview();

    this.originalGroup = null;

    // 暫時從場景移除切割結果，但保留物件與幾何。

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
// 修正切割結果檢視切換
// 重新加入保留的結果群組
// ==========================================

cuttingUI.showResults = function () {
    if (
        !this.currentResult ||
        !this.resultGroup
    ) {
        return;
    }

    // 清理原石展示，但不動切割結果。

    this.clearGroup(this.originalGroup);

    this.originalGroup = null;

    this.clearPreview();

    // 重新顯示先前保留的切割結果。

    this.scene.add(this.resultGroup);

    this.currentView = "results";

    this.resetCamera();

    this.updateViewButtons();
};


// ==========================================
// 模組載入完成
// ==========================================

console.log(
    "[切割視覺] 不透明原石、玉料真實截面與檢視保留系統已載入。"
);

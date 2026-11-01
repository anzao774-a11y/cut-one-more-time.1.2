// js/ui/cutting-result-visuals.js

import * as THREE from "three";

import { cuttingUI } from "./cutting-ui.js";


// ==========================================
// 切割視覺設定
// ==========================================

const VISUAL_CONFIG = {
    // 兩側原石的水平間距
    sideSpacing: 1.35,

    // 玉料切面與原石封口面的微小間距
    surfaceOffset: 0.0008,

    // 判定頂點是否位於切割平面的誤差
    planeTolerance: 1e-7,

    // 玉石切面材質
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

    if (
        !Number.isFinite(length) ||
        length <= 1e-10
    ) {
        throw new Error("切割平面法線無效。");
    }

    return [
        vector[0] / length,
        vector[1] / length,
        vector[2] / length
    ];
}


// ==========================================
// 計算頂點到平面的有號距離
// ==========================================

function getPlaneDistance(vertex, plane) {
    return (
        (vertex[0] - plane.point[0]) *
            plane.normal[0] +

        (vertex[1] - plane.point[1]) *
            plane.normal[1] +

        (vertex[2] - plane.point[2]) *
            plane.normal[2]
    );
}


// ==========================================
// 建立正負兩側的實際切割平面
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
            normal: normal.map(
                value => -value
            )
        },

        // 正側封口面的外側方向
        positiveOutward: normal.map(
            value => -value
        ),

        // 負側封口面的外側方向
        negativeOutward: [...normal]
    };
}


// ==========================================
// 從切割後玉料擷取真正的封口三角面
// ==========================================

function extractJadeCutTriangles(
    mass,
    plane
) {
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

        // 必須三個頂點全部落在切割平面上。
        // 一般外殼三角面不會通過此條件。
        const isCutFace = distances.every(
            distance =>
                Math.abs(distance) <=
                VISUAL_CONFIG.planeTolerance
        );

        if (!isCutFace) {
            continue;
        }

        triangles.push(vertices);
    }

    return triangles;
}


// ==========================================
// 建立玉石切割截面
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

        roughness:
            VISUAL_CONFIG.jadeRoughness,

        metalness:
            VISUAL_CONFIG.jadeMetalness,

        side: THREE.DoubleSide,

        transparent: false,

        opacity: 1,

        depthWrite: true
    });

    const surface = new THREE.Mesh(
        geometry,
        material
    );

    surface.name =
        `${mass.name ?? "玉料"}切割截面`;

    surface.userData.ownsMaterial = true;

    surface.userData.jadeType =
        mass.jadeType ?? null;

    surface.castShadow = false;
    surface.receiveShadow = true;

    return surface;
}


// ==========================================
// 強制原石材質保持不透明
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
// 建立切面朝向玩家的群組
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

    // 將切面外側法線轉向玩家鏡頭。
    group.quaternion.setFromUnitVectors(
        sourceDirection,
        targetDirection
    );

    // 使用世界座標水平分開兩側原石。
    group.position.set(
        horizontalOffset,
        0,
        0
    );

    return group;
}


// ==========================================
// 建立玉料切面並加入群組
// ==========================================

function addJadeCutSurfaces(
    cuttingUI,
    group,
    masses,
    plane,
    outwardNormal
) {
    if (!Array.isArray(masses)) {
        return;
    }

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
    }
}


// ==========================================
// 更新切割結果體積資訊
// ==========================================

function updateVolumeDisplay(
    cuttingUI,
    result
) {
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
// 替換切割結果顯示流程
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


    // ======================================
    // 1. 清除舊畫面
    // ======================================

    this.clearGroup(this.originalGroup);
    this.clearGroup(this.resultGroup);

    this.clearPreview();

    this.originalGroup = null;
    this.resultGroup = null;


    // ======================================
    // 2. 重設鏡頭
    // ======================================

    this.resetCamera();

    const cameraTarget = this.controls.target;

    const viewDirection = this.camera.position
        .clone()
        .sub(cameraTarget)
        .normalize();


    // ======================================
    // 3. 強制原石完全不透明
    // ======================================

    enforceOpaqueMaterial(
        this.materials.positive
    );

    enforceOpaqueMaterial(
        this.materials.negative
    );

    enforceOpaqueMaterial(
        this.materials.original
    );


    // ======================================
    // 4. 建立正負切割平面
    // ======================================

    const planes = createCutPlanes(result);


    // ======================================
    // 5. 建立兩側原石群組
    // ======================================

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


    // ======================================
    // 6. 建立正側原石外殼
    // ======================================

    const positiveStone = this.createStoneMesh(
        result.positivePiece,
        this.materials.positive
    );

    positiveStone.name = "正側原石外殼";

    positiveGroup.add(positiveStone);


    // ======================================
    // 7. 建立負側原石外殼
    // ======================================

    const negativeStone = this.createStoneMesh(
        result.negativePiece,
        this.materials.negative
    );

    negativeStone.name = "負側原石外殼";

    negativeGroup.add(negativeStone);


    // ======================================
    // 8. 顯示正側真正的玉石切面
    // ======================================

    const positiveMasses =
        jadeSplit?.positive?.masses ?? [];

    addJadeCutSurfaces(
        this,
        positiveGroup,
        positiveMasses,
        planes.positive,
        planes.positiveOutward
    );


    // ======================================
    // 9. 顯示負側真正的玉石切面
    // ======================================

    const negativeMasses =
        jadeSplit?.negative?.masses ?? [];

    addJadeCutSurfaces(
        this,
        negativeGroup,
        negativeMasses,
        planes.negative,
        planes.negativeOutward
    );


    // ======================================
    // 10. 組合切割結果
    // ======================================

    this.resultGroup = new THREE.Group();

    this.resultGroup.name = "切割結果展示";

    this.resultGroup.add(
        positiveGroup,
        negativeGroup
    );

    this.scene.add(this.resultGroup);


    // ======================================
    // 11. 更新切割結果資料
    // ======================================

    this.currentResult = result;

    this.currentView = "results";


    // ======================================
    // 12. 更新體積資訊
    // ======================================

    updateVolumeDisplay(
        this,
        result
    );


    // ======================================
    // 13. 更新檢視按鈕
    // ======================================

    this.updateViewButtons();

    // performCut() 會在 displayResults() 返回後
    // 執行存檔，因此在同步流程結束後再更新一次按鈕。
    Promise.resolve().then(() => {
        if (this.currentView === "results") {
            this.updateViewButtons();
        }
    });


    // ======================================
    // 14. 顯示診斷資訊
    // ======================================

    console.log("[切割視覺] 結果展示完成。");

    console.log("[切割視覺] 玉料切面數量：", {
        positive: positiveGroup.children.filter(
            child => child.userData?.ownsMaterial
        ).length,

        negative: negativeGroup.children.filter(
            child => child.userData?.ownsMaterial
        ).length
    });
};


// ==========================================
// 模組載入完成
// ==========================================

console.log(
    "[切割視覺] 不透明原石與真實玉料截面系統已載入。"
);

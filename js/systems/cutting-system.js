// js/systems/cutting-system.js

import { geometryEngine } from "./geometry-engine.js";
import { meshGeometryUtils } from "./mesh-geometry-utils.js";


class CuttingSystem {
    constructor() {
        this.lastResult = null;

        this.config = {
            bladeThickness: 0.025,
            minimumVolume: 1e-10,
            volumeTolerance: 1e-6,
            geometryTolerance: 1e-8
        };
    }


    // ==========================================
    // 刀片厚度
    // ==========================================

    setBladeThickness(value) {
        const thickness = Number(value);

        if (
            !Number.isFinite(thickness) ||
            thickness < 0
        ) {
            throw new Error("刀片厚度必須是大於或等於零的有效數值。");
        }

        this.config.bladeThickness = thickness;

        return this.config.bladeThickness;
    }


    getBladeThickness() {
        return this.config.bladeThickness;
    }


    // ==========================================
    // 模型驗證
    // ==========================================

    validateMesh(mesh) {
        if (
            !mesh ||
            !Array.isArray(mesh.vertices) ||
            !Array.isArray(mesh.faces)
        ) {
            throw new Error("缺少有效的模型頂點或面資料。");
        }

        if (
            mesh.vertices.length < 4 ||
            mesh.faces.length < 4
        ) {
            throw new Error("模型頂點數量或面數量不足。");
        }

        try {
            geometryEngine.validateMesh(mesh);
        } catch (error) {
            throw new Error(
                `模型幾何資料驗證失敗：${error.message}`
            );
        }

        return true;
    }


    // ==========================================
    // 向量工具
    // ==========================================

    dot(a, b) {
        return (
            a[0] * b[0] +
            a[1] * b[1] +
            a[2] * b[2]
        );
    }


    subtract(a, b) {
        return [
            a[0] - b[0],
            a[1] - b[1],
            a[2] - b[2]
        ];
    }


    normalize(vector) {
        const length = Math.sqrt(
            this.dot(vector, vector)
        );

        if (
            !Number.isFinite(length) ||
            length < 1e-10
        ) {
            throw new Error("切割平面法線無效，無法正規化。");
        }

        return vector.map(value => value / length);
    }


    // ==========================================
    // 切割平面驗證
    // ==========================================

    normalizePlane(plane) {
        if (
            !plane ||
            !Array.isArray(plane.point) ||
            !Array.isArray(plane.normal) ||
            plane.point.length !== 3 ||
            plane.normal.length !== 3 ||
            !plane.point.every(Number.isFinite) ||
            !plane.normal.every(Number.isFinite)
        ) {
            throw new Error("切割平面資料格式錯誤。");
        }

        return {
            point: [...plane.point],
            normal: this.normalize(plane.normal)
        };
    }


    // ==========================================
    // 頂點與切割平面的距離
    // ==========================================

    getVertexDistances(mesh, plane) {
        return mesh.vertices.map(vertex => {
            const relative = this.subtract(
                vertex,
                plane.point
            );

            return this.dot(
                relative,
                plane.normal
            );
        });
    }


    // ==========================================
    // 確認切割平面確實穿過原石
    // ==========================================

    validateCutPosition(mesh, plane, bladeThickness) {
        const distances = this.getVertexDistances(
            mesh,
            plane
        );

        const halfThickness = bladeThickness / 2;

        const positiveThreshold =
            halfThickness + this.config.geometryTolerance;

        const negativeThreshold =
            -halfThickness - this.config.geometryTolerance;

        const maximumDistance = Math.max(...distances);
        const minimumDistance = Math.min(...distances);

        if (maximumDistance <= positiveThreshold) {
            throw new Error(
                "切割位置不正確：原石沒有足夠的正側空間。"
            );
        }

        if (minimumDistance >= negativeThreshold) {
            throw new Error(
                "切割位置不正確：原石沒有足夠的負側空間。"
            );
        }

        return {
            minimumDistance,
            maximumDistance,
            halfThickness
        };
    }


    // ==========================================
    // 體積計算
    // ==========================================

    calculateVolume(mesh) {
        this.validateMesh(mesh);

        const volume = meshGeometryUtils.getVolume(mesh);

        if (
            !Number.isFinite(volume) ||
            volume <= this.config.minimumVolume
        ) {
            throw new Error(
                "模型體積無效或接近零，無法繼續切割。"
            );
        }

        return volume;
    }


    // ==========================================
    // 建立正側切割平面
    // ==========================================

    createPositivePlane(plane, halfThickness) {
        return {
            point: [
                plane.point[0] +
                    plane.normal[0] * halfThickness,

                plane.point[1] +
                    plane.normal[1] * halfThickness,

                plane.point[2] +
                    plane.normal[2] * halfThickness
            ],

            normal: [...plane.normal]
        };
    }


    // ==========================================
    // 建立負側切割平面
    // ==========================================

    createNegativePlane(plane, halfThickness) {
        return {
            point: [
                plane.point[0] -
                    plane.normal[0] * halfThickness,

                plane.point[1] -
                    plane.normal[1] * halfThickness,

                plane.point[2] -
                    plane.normal[2] * halfThickness
            ],

            normal: [
                -plane.normal[0],
                -plane.normal[1],
                -plane.normal[2]
            ]
        };
    }


    // ==========================================
    // 單側切割
    // ==========================================

    createPiece(mesh, plane, sideName) {
        let result;

        try {
            result = geometryEngine.clipMesh(
                mesh,
                plane
            );
        } catch (error) {
            throw new Error(
                `${sideName}切割失敗：${error.message}`
            );
        }

        if (
            !result ||
            !Array.isArray(result.vertices) ||
            !Array.isArray(result.faces)
        ) {
            throw new Error(
                `${sideName}沒有產生有效的切割模型。`
            );
        }

        this.validateMesh(result);

        return {
            vertices: result.vertices.map(vertex => [
                vertex[0],
                vertex[1],
                vertex[2]
            ]),

            faces: result.faces.map(face => [
                face[0],
                face[1],
                face[2]
            ])
        };
    }


    // ==========================================
    // 切割結果體積檢查
    // ==========================================

    validateVolumes(
        originalVolume,
        positiveVolume,
        negativeVolume
    ) {
        const tolerance = Math.max(
            this.config.volumeTolerance,
            originalVolume * this.config.volumeTolerance
        );

        if (
            positiveVolume <= this.config.minimumVolume
        ) {
            throw new Error(
                "正側切割結果體積過小，無法建立有效模型。"
            );
        }

        if (
            negativeVolume <= this.config.minimumVolume
        ) {
            throw new Error(
                "負側切割結果體積過小，無法建立有效模型。"
            );
        }

        const combinedVolume =
            positiveVolume + negativeVolume;

        if (
            combinedVolume >
            originalVolume + tolerance
        ) {
            throw new Error(
                "切割結果體積超過原石體積，幾何資料可能存在重疊或錯誤。"
            );
        }

        return true;
    }


    // ==========================================
    // 完整雙側切割
    // ==========================================

    cutStone(mesh, plane) {
        // ------------------------------
        // 1. 驗證原始模型
        // ------------------------------

        this.validateMesh(mesh);


        // ------------------------------
        // 2. 正規化切割平面
        // ------------------------------

        const normalizedPlane = this.normalizePlane(
            plane
        );


        // ------------------------------
        // 3. 取得刀片厚度
        // ------------------------------

        const bladeThickness =
            this.config.bladeThickness;

        const halfThickness =
            bladeThickness / 2;


        // ------------------------------
        // 4. 計算原始體積
        // ------------------------------

        const originalVolume = this.calculateVolume(
            mesh
        );


        // ------------------------------
        // 5. 確認切割位置有效
        // ------------------------------

        this.validateCutPosition(
            mesh,
            normalizedPlane,
            bladeThickness
        );


        // ------------------------------
        // 6. 建立正負兩側切割平面
        // ------------------------------

        const positivePlane = this.createPositivePlane(
            normalizedPlane,
            halfThickness
        );

        const negativePlane = this.createNegativePlane(
            normalizedPlane,
            halfThickness
        );


        // ------------------------------
        // 7. 分別切割兩側模型
        // ------------------------------

        const positivePiece = this.createPiece(
            mesh,
            positivePlane,
            "正側"
        );

        const negativePiece = this.createPiece(
            mesh,
            negativePlane,
            "負側"
        );


        // ------------------------------
        // 8. 計算兩側體積
        // ------------------------------

        const positiveVolume = this.calculateVolume(
            positivePiece
        );

        const negativeVolume = this.calculateVolume(
            negativePiece
        );


        // ------------------------------
        // 9. 檢查體積合理性
        // ------------------------------

        this.validateVolumes(
            originalVolume,
            positiveVolume,
            negativeVolume
        );


        // ------------------------------
        // 10. 計算刀片移除體積
        // ------------------------------

        const rawRemovedVolume =
            originalVolume -
            positiveVolume -
            negativeVolume;

        const tolerance = Math.max(
            this.config.volumeTolerance,
            originalVolume * this.config.volumeTolerance
        );

        if (rawRemovedVolume < -tolerance) {
            throw new Error(
                "切割後的體積總和大於原石體積，無法確認切割結果。"
            );
        }

        const removedVolume = Math.max(
            0,
            rawRemovedVolume
        );


        // ------------------------------
        // 11. 組合結果
        // ------------------------------

        const result = {
            positivePiece,
            negativePiece,

            originalVolume,
            positiveVolume,
            negativeVolume,
            removedVolume,

            cutPlane: {
                point: [...normalizedPlane.point],
                normal: [...normalizedPlane.normal]
            },

            bladeThickness,

            createdAt: Date.now()
        };


        // ------------------------------
        // 12. 保存最近一次結果
        // ------------------------------

        this.lastResult = result;

        return result;
    }


    // ==========================================
    // 取得最近一次切割結果
    // ==========================================

    getLastResult() {
        return this.lastResult;
    }


    // ==========================================
    // 清除切割結果
    // ==========================================

    clearResult() {
        this.lastResult = null;
    }


    // ==========================================
    // 重設系統
    // ==========================================

    reset() {
        this.lastResult = null;

        this.config.bladeThickness = 0.025;
    }
}


export const cuttingSystem = new CuttingSystem();

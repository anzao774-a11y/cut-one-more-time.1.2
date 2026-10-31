
import { geometryEngine } from "./geometry-engine.js";

class CuttingSystem {
    constructor() {
        this.lastResult = null;

        this.config = {
            // 刀片厚度，以模型座標單位計算
            bladeThickness: 0.025
        };
    }

    validateMesh(mesh) {
        if (!mesh || !Array.isArray(mesh.vertices)) {
            throw new Error("缺少模型頂點資料");
        }

        if (!Array.isArray(mesh.faces)) {
            throw new Error("缺少模型面資料");
        }

        if (mesh.vertices.length < 4 || mesh.faces.length < 4) {
            throw new Error("模型資料不足");
        }

        for (const vertex of mesh.vertices) {
            if (
                !Array.isArray(vertex) ||
                vertex.length !== 3 ||
                !vertex.every(Number.isFinite)
            ) {
                throw new Error("模型包含無效頂點");
            }
        }

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
                throw new Error("模型包含無效面資料");
            }
        }

        return true;
    }

    // 計算網格的封閉體積
    calculateVolume(mesh) {
        let signedVolume = 0;

        for (const face of mesh.faces) {
            const a = mesh.vertices[face[0]];
            const b = mesh.vertices[face[1]];
            const c = mesh.vertices[face[2]];

            const cross = geometryEngine.cross(b, c);

            signedVolume += geometryEngine.dot(a, cross) / 6;
        }

        return Math.abs(signedVolume);
    }

    // 將切割平面沿法線方向移動
    offsetPlane(plane, distance) {
        const normal = geometryEngine.normalize(plane.normal);

        return {
            point: [
                plane.point[0] + normal[0] * distance,
                plane.point[1] + normal[1] * distance,
                plane.point[2] + normal[2] * distance
            ],
            normal
        };
    }

    // 執行具有刀片厚度的切割
    cutStone(mesh, plane) {
        this.validateMesh(mesh);

        if (
            !plane ||
            !Array.isArray(plane.point) ||
            !Array.isArray(plane.normal) ||
            plane.point.length !== 3 ||
            plane.normal.length !== 3 ||
            !plane.point.every(Number.isFinite) ||
            !plane.normal.every(Number.isFinite)
        ) {
            throw new Error("切割平面設定錯誤");
        }

        if (
            !Number.isFinite(this.config.bladeThickness) ||
            this.config.bladeThickness < 0
        ) {
            throw new Error("刀片厚度設定錯誤");
        }

        const normal = geometryEngine.normalize(plane.normal);
        const halfThickness = this.config.bladeThickness / 2;

        // 刀片兩側的切割平面
        const positivePlane = this.offsetPlane(
            { point: plane.point, normal },
            halfThickness
        );

        const negativePlane = this.offsetPlane(
            { point: plane.point, normal },
            -halfThickness
        );

        // 保留刀片正側的原石
        const positivePiece = geometryEngine.clipMesh(
            mesh,
            positivePlane
        );

        // 保留刀片負側的原石
        const negativePiece = geometryEngine.clipMesh(
            mesh,
            {
                point: negativePlane.point,
                normal: geometryEngine.scale(normal, -1)
            }
        );

        const originalVolume = this.calculateVolume(mesh);
        const positiveVolume = this.calculateVolume(positivePiece);
        const negativeVolume = this.calculateVolume(negativePiece);

        // 被刀片移除的材料體積
        const removedVolume = Math.max(
            0,
            originalVolume - positiveVolume - negativeVolume
        );

        const result = {
            positivePiece,
            negativePiece,

            originalVolume,
            positiveVolume,
            negativeVolume,
            removedVolume,

            bladeThickness: this.config.bladeThickness,

            cutPlane: {
                point: [...plane.point],
                normal: [...normal]
            },

            createdAt: Date.now()
        };

        this.lastResult = result;

        return result;
    }

    getLastResult() {
        return this.lastResult;
    }

    clearResult() {
        this.lastResult = null;
    }

    setBladeThickness(thickness) {
        if (!Number.isFinite(thickness) || thickness < 0) {
            throw new Error("刀片厚度必須是大於或等於零的數字");
        }

        this.config.bladeThickness = thickness;
    }
}

export const cuttingSystem = new CuttingSystem();

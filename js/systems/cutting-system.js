// js/systems/cutting-system.js

import { geometryEngine } from "./geometry-engine.js?version=3";

class CuttingSystem {
    constructor() {
        this.lastResult = null;

        this.config = {
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
                throw new Error("模型頂點資料無效");
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
                throw new Error("模型面資料無效");
            }
        }

        return true;
    }

    calculateVolume(mesh) {
        let volume = 0;

        for (const face of mesh.faces) {
            const a = mesh.vertices[face[0]];
            const b = mesh.vertices[face[1]];
            const c = mesh.vertices[face[2]];

            volume += geometryEngine.dot(
                a,
                geometryEngine.cross(b, c)
            ) / 6;
        }

        return Math.abs(volume);
    }

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
        const half = this.config.bladeThickness / 2;

        // 正側保留切割平面正方向的材料。
        const positivePlane = this.offsetPlane(
            { point: plane.point, normal },
            half
        );

        // 負側保留切割平面負方向的材料。
        const negativePlane = this.offsetPlane(
            { point: plane.point, normal },
            -half
        );

        const positivePiece = geometryEngine.clipMesh(
            mesh,
            positivePlane
        );

        const negativePiece = geometryEngine.clipMesh(
            mesh,
            {
                point: negativePlane.point,
                normal: geometryEngine.scale(normal, -1)
            }
        );

        this.validateMesh(positivePiece);
        this.validateMesh(negativePiece);

        const originalVolume = this.calculateVolume(mesh);
        const positiveVolume = this.calculateVolume(positivePiece);
        const negativeVolume = this.calculateVolume(negativePiece);

        const removedVolume =
            originalVolume - positiveVolume - negativeVolume;

        if (removedVolume < -1e-6) {
            throw new Error(
                "切割後體積超過原始體積，請檢查模型封口或面方向"
            );
        }

        const result = {
            positivePiece,
            negativePiece,
            originalVolume,
            positiveVolume,
            negativeVolume,
            removedVolume: Math.max(0, removedVolume),
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
            throw new Error("刀片厚度必須大於或等於零");
        }

        this.config.bladeThickness = thickness;
    }
}

export const cuttingSystem = new CuttingSystem();

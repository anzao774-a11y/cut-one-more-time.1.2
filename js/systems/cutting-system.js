// js/systems/cutting-system.js

import { geometryEngine } from "./geometry-engine.js";

class CuttingSystem {
    constructor() {
        this.lastResult = null;

        this.config = {
            bladeThickness: 0.025
        };
    }

    // 檢查模型格式
    validateMesh(mesh) {
        if (!mesh || !Array.isArray(mesh.vertices)) {
            throw new Error("缺少模型頂點資料");
        }

        if (!Array.isArray(mesh.faces)) {
            throw new Error("缺少模型面資料");
        }

        if (mesh.vertices.length < 4) {
            throw new Error("模型頂點數量不足");
        }

        if (mesh.faces.length < 4) {
            throw new Error("模型面數量不足");
        }

        return true;
    }

    // 執行切割
    cutStone(mesh, plane) {
        this.validateMesh(mesh);

        const result = geometryEngine.clipMesh(mesh, plane);

        if (result.vertices.length < 3 || result.faces.length < 1) {
            throw new Error("切割失敗，沒有產生有效模型");
        }

        this.lastResult = {
            vertices: result.vertices,
            faces: result.faces,
            cutPlane: {
                point: [...plane.point],
                normal: [...plane.normal]
            },
            createdAt: Date.now()
        };

        return this.lastResult;
    }

    // 取得最近一次切割結果
    getLastResult() {
        return this.lastResult;
    }

    // 清除切割結果
    clearResult() {
        this.lastResult = null;
    }
}

export const cuttingSystem = new CuttingSystem();

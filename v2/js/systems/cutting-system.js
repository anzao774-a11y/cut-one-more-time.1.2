// v2/js/systems/cutting-system.js

import { geometryEngine } from "./geometry-engine.js";

const CUTTING_CONFIG = {
    bladeThickness: 0.025,
    minimumVertices: 4,
    minimumFaces: 4
};

function normalizeVector(vector) {
    const magnitude = Math.sqrt(
        vector.x ** 2 +
        vector.y ** 2 +
        vector.z ** 2
    );

    if (magnitude === 0) {
        throw new Error("切割方向不可為零。");
    }

    return {
        x: vector.x / magnitude,
        y: vector.y / magnitude,
        z: vector.z / magnitude
    };
}

function validateResult(mesh) {
    return Boolean(
        mesh &&
        Array.isArray(mesh.vertices) &&
        Array.isArray(mesh.faces) &&
        mesh.vertices.length >= CUTTING_CONFIG.minimumVertices &&
        mesh.faces.length >= CUTTING_CONFIG.minimumFaces
    );
}

class CuttingSystem {
    constructor() {
        this.processing = false;
    }

    cut(stoneModel, options = {}) {
        if (this.processing) {
            return {
                success: false,
                reason: "目前正在進行切割。"
            };
        }

        this.processing = true;

        try {
            const {
                point = { x: 0, y: 0, z: 0 },
                normal = { x: 1, y: 0, z: 0 }
            } = options;

            const direction = normalizeVector(normal);

            const plane = {
                point: {
                    x: point.x,
                    y: point.y,
                    z: point.z
                },
                normal: direction
            };

            const result = geometryEngine.split(
                stoneModel,
                plane
            );

            if (!result.success) {
                return result;
            }

            if (
                !validateResult(result.positive) ||
                !validateResult(result.negative)
            ) {
                return {
                    success: false,
                    reason: "切割後的原石模型不符合有效幾何條件。"
                };
            }

            return {
                success: true,

                positive: result.positive,
                negative: result.negative,

                cutSurface: result.cutSurface,
                plane: result.plane,

                bladeThickness: CUTTING_CONFIG.bladeThickness,

                statistics: {
                    ...result.statistics,
                    bladeThickness: CUTTING_CONFIG.bladeThickness
                },

                cutAt: new Date().toISOString()
            };
        } catch (error) {
            console.error("原石切割失敗：", error);

            return {
                success: false,
                reason: error.message
            };
        } finally {
            this.processing = false;
        }
    }

    getConfig() {
        return { ...CUTTING_CONFIG };
    }
}

export const cuttingSystem = new CuttingSystem();

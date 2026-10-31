
/**
 * mesh-placement-utils.js
 *
 * 一般 3D 模型定位工具。
 * 提供尺寸限制、模型間距、位置計算及可重現的配置。
 */

function createSeededRandom(seed) {
    let value = 0;

    for (const char of String(seed)) {
        value = (value * 31 + char.charCodeAt(0)) >>> 0;
    }

    return () => {
        value += 0x6D2B79F5;

        let t = value;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function validateVector(vector, name) {
    if (
        !Array.isArray(vector) ||
        vector.length !== 3 ||
        !vector.every(Number.isFinite)
    ) {
        throw new Error(`${name} 必須是三維數值陣列`);
    }
}

class MeshPlacementUtils {
    getBounds(mesh) {
        if (!mesh || !Array.isArray(mesh.vertices) || !mesh.vertices.length) {
            throw new Error("模型缺少頂點資料");
        }

        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];

        for (const vertex of mesh.vertices) {
            validateVector(vertex, "模型頂點");

            for (let axis = 0; axis < 3; axis++) {
                min[axis] = Math.min(min[axis], vertex[axis]);
                max[axis] = Math.max(max[axis], vertex[axis]);
            }
        }

        return {
            min,
            max,
            size: max.map((value, axis) => value - min[axis]),
            center: max.map((value, axis) => (value + min[axis]) / 2)
        };
    }

    getScaleForBounds(mesh, targetSize, padding = 0.1) {
        const bounds = this.getBounds(mesh);

        validateVector(targetSize, "目標尺寸");

        if (padding < 0 || padding >= 0.5) {
            throw new Error("padding 必須介於 0 至 0.5 之間");
        }

        const ratios = bounds.size.map((size, axis) => {
            if (size <= 1e-10) {
                return Infinity;
            }

            return targetSize[axis] / size;
        });

        const scale = Math.min(...ratios) * (1 - padding * 2);

        if (!Number.isFinite(scale) || scale <= 0) {
            throw new Error("無法計算有效縮放比例");
        }

        return scale;
    }

    fitToBounds(mesh, targetSize, padding = 0.1) {
        const bounds = this.getBounds(mesh);
        const scale = this.getScaleForBounds(
            mesh,
            targetSize,
            padding
        );

        const centered = mesh.vertices.map(vertex => [
            (vertex[0] - bounds.center[0]) * scale,
            (vertex[1] - bounds.center[1]) * scale,
            (vertex[2] - bounds.center[2]) * scale
        ]);

        return {
            vertices: centered,
            faces: mesh.faces.map(face => [...face]),
            scale,
            originalBounds: bounds
        };
    }

    isWithinBounds(mesh, bounds, tolerance = 1e-6) {
        this.getBounds(mesh);

        if (!bounds?.min || !bounds?.max) {
            throw new Error("目標邊界無效");
        }

        for (const vertex of mesh.vertices) {
            for (let axis = 0; axis < 3; axis++) {
                if (
                    vertex[axis] < bounds.min[axis] - tolerance ||
                    vertex[axis] > bounds.max[axis] + tolerance
                ) {
                    return false;
                }
            }
        }

        return true;
    }

    translate(mesh, position) {
        validateVector(position, "目標位置");

        return {
            vertices: mesh.vertices.map(vertex => [
                vertex[0] + position[0],
                vertex[1] + position[1],
                vertex[2] + position[2]
            ]),
            faces: mesh.faces.map(face => [...face])
        };
    }

    getRandomPosition(bounds, seed, margin = 0.1) {
        if (!bounds?.min || !bounds?.max) {
            throw new Error("邊界資料無效");
        }

        if (margin < 0 || margin >= 0.5) {
            throw new Error("margin 必須介於 0 至 0.5 之間");
        }

        const random = createSeededRandom(seed);

        return [0, 1, 2].map(axis => {
            const min = bounds.min[axis];
            const max = bounds.max[axis];

            const span = max - min;
            const safeMin = min + span * margin;
            const safeMax = max - span * margin;

            return safeMin + random() * (safeMax - safeMin);
        });
    }

    createPlacement(mesh, hostBounds, options = {}) {
        const targetSize = options.targetSize ?? [
            hostBounds.max[0] - hostBounds.min[0],
            hostBounds.max[1] - hostBounds.min[1],
            hostBounds.max[2] - hostBounds.min[2]
        ];

        const fitted = this.fitToBounds(
            mesh,
            targetSize,
            options.padding ?? 0.1
        );

        const position = options.position ?? this.getRandomPosition(
            hostBounds,
            options.seed ?? "mesh-placement",
            options.margin ?? 0.1
        );

        const rotation = options.rotation ?? {
            x: 0,
            y: 0,
            z: 0
        };

        return {
            geometry: fitted,
            placement: {
                position: [...position],
                rotation: { ...rotation },
                scale: fitted.scale,
                seed: String(options.seed ?? "mesh-placement")
            }
        };
    }
}

export const meshPlacementUtils = new MeshPlacementUtils();

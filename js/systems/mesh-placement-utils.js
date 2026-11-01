
import { meshGeometryUtils } from "./mesh-geometry-utils.js";

class MeshPlacementUtils {
    validateVector(vector, name = "向量") {
        if (!Array.isArray(vector) || vector.length !== 3 ||
            !vector.every(Number.isFinite)) {
            throw new Error(`${name}格式錯誤`);
        }

        return true;
    }

    getBounds(mesh) {
        return meshGeometryUtils.getBounds(mesh);
    }

    rotateMesh(mesh, rotation = {}) {
        return meshGeometryUtils.rotate(mesh, rotation);
    }

    translate(mesh, position) {
        this.validateVector(position, "平移位置");
        return meshGeometryUtils.translate(mesh, position);
    }

    scaleMesh(mesh, scale) {
        return meshGeometryUtils.scale(mesh, scale);
    }

    centerMesh(mesh) {
        return meshGeometryUtils.center(mesh);
    }

    getScaleForBounds(mesh, targetSize, padding = 0) {
        const target = typeof targetSize === "number"
            ? [targetSize, targetSize, targetSize]
            : targetSize;

        this.validateVector(target, "目標尺寸");

        if (!target.every(v => v > 0)) {
            throw new Error("目標尺寸必須大於零");
        }

        const bounds = this.getBounds(mesh);

        const ratios = bounds.size.map((size, i) =>
            size > 1e-10 ? target[i] / size : Infinity
        );

        const factor = Math.min(...ratios) * (1 - padding * 2);

        if (!Number.isFinite(factor) || factor <= 0) {
            throw new Error("無法計算模型縮放比例");
        }

        return factor;
    }

    fitToBounds(mesh, targetSize, padding = 0) {
        return meshGeometryUtils.fitInside(
            mesh,
            targetSize,
            padding
        );
    }

    isWithinBounds(mesh, bounds, tolerance = 1e-6) {
        return meshGeometryUtils.isInsideBounds(
            mesh,
            bounds,
            tolerance
        );
    }

    getPositionFromNormalized(bounds, normalized = [0.5, 0.5, 0.5]) {
        this.validateVector(normalized, "標準化座標");

        if (!normalized.every(v => v >= 0 && v <= 1)) {
            throw new Error("標準化座標必須介於 0 至 1");
        }

        return normalized.map((value, i) =>
            bounds.min[i] + bounds.size[i] * value
        );
    }

    createPlacement(mesh, hostBounds, options = {}) {
        meshGeometryUtils.validate(mesh);

        if (!hostBounds?.min || !hostBounds?.max ||
            !hostBounds?.size) {
            throw new Error("外部模型邊界無效");
        }

        const rotation = options.rotation ?? {
            x: 0, y: 0, z: 0
        };

        const rotated = this.rotateMesh(mesh, rotation);
        const targetSize = hostBounds.size.map(size =>
            size * (options.fitRatio ?? 0.5)
        );

        const fitted = this.fitToBounds(
            rotated,
            targetSize,
            options.padding ?? 0.05
        );

        const normalized = options.normalizedPosition ??
            [0.5, 0.5, 0.5];

        const position = options.position ??
            this.getPositionFromNormalized(hostBounds, normalized);

        this.validateVector(position, "放置位置");

        const placed = this.translate(fitted, position);

        return {
            mesh: placed,
            placement: {
                position: [...position],
                rotation: { ...rotation },
                scale: 1
            },
            bounds: this.getBounds(placed),
            insideHostBounds: this.isWithinBounds(
                placed,
                hostBounds
            )
        };
    }
}

export const meshPlacementUtils = new MeshPlacementUtils();

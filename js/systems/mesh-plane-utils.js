
/**
 * mesh-plane-utils.js
 *
 * 三角網格與平面之間的幾何判斷。
 *
 * plane:
 * {
 *   point: [x, y, z],
 *   normal: [x, y, z]
 * }
 */

class MeshPlaneUtils {
    validatePlane(plane) {
        if (
            !plane ||
            !Array.isArray(plane.point) ||
            !Array.isArray(plane.normal) ||
            plane.point.length !== 3 ||
            plane.normal.length !== 3 ||
            !plane.point.every(Number.isFinite) ||
            !plane.normal.every(Number.isFinite)
        ) {
            throw new Error("平面資料格式錯誤");
        }

        const length = Math.hypot(...plane.normal);

        if (length <= 1e-10) {
            throw new Error("平面法向量不可為零");
        }

        return {
            point: [...plane.point],
            normal: plane.normal.map(value => value / length)
        };
    }

    signedDistance(vertex, plane) {
        const normalized = this.validatePlane(plane);

        return (
            (vertex[0] - normalized.point[0]) * normalized.normal[0] +
            (vertex[1] - normalized.point[1]) * normalized.normal[1] +
            (vertex[2] - normalized.point[2]) * normalized.normal[2]
        );
    }

    getDistances(mesh, plane) {
        if (!mesh || !Array.isArray(mesh.vertices)) {
            throw new Error("模型頂點資料不存在");
        }

        const normalized = this.validatePlane(plane);

        return mesh.vertices.map(vertex =>
            this.signedDistance(vertex, normalized)
        );
    }

    classifyMesh(mesh, plane, tolerance = 1e-6) {
        const distances = this.getDistances(mesh, plane);

        const min = Math.min(...distances);
        const max = Math.max(...distances);

        let classification;

        if (min > tolerance) {
            classification = "positive";
        } else if (max < -tolerance) {
            classification = "negative";
        } else if (
            Math.abs(min) <= tolerance &&
            Math.abs(max) <= tolerance
        ) {
            classification = "coplanar";
        } else {
            classification = "crossing";
        }

        return {
            classification,
            minDistance: min,
            maxDistance: max,
            distances
        };
    }

    classifyWithThickness(mesh, plane, thickness) {
        if (!Number.isFinite(thickness) || thickness < 0) {
            throw new Error("厚度必須是大於或等於零的數值");
        }

        const result = this.classifyMesh(mesh, plane);

        const half = thickness / 2;

        if (result.minDistance > half) {
            return {
                ...result,
                region: "positive"
            };
        }

        if (result.maxDistance < -half) {
            return {
                ...result,
                region: "negative"
            };
        }

        if (
            result.minDistance >= -half &&
            result.maxDistance <= half
        ) {
            return {
                ...result,
                region: "inside-gap"
            };
        }

        return {
            ...result,
            region: "intersects-gap"
        };
    }

    projectPoint(vertex, plane) {
        const normalized = this.validatePlane(plane);
        const distance = this.signedDistance(vertex, normalized);

        return [
            vertex[0] - normalized.normal[0] * distance,
            vertex[1] - normalized.normal[1] * distance,
            vertex[2] - normalized.normal[2] * distance
        ];
    }

    getPlaneBounds(mesh, plane) {
        if (!mesh || !Array.isArray(mesh.vertices)) {
            throw new Error("模型頂點資料不存在");
        }

        const projected = mesh.vertices.map(vertex =>
            this.projectPoint(vertex, plane)
        );

        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];

        for (const vertex of projected) {
            for (let axis = 0; axis < 3; axis++) {
                min[axis] = Math.min(min[axis], vertex[axis]);
                max[axis] = Math.max(max[axis], vertex[axis]);
            }
        }

        return {
            min,
            max,
            size: max.map((value, axis) => value - min[axis])
        };
    }
}

export const meshPlaneUtils = new MeshPlaneUtils();

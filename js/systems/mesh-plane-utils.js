
/**
 * mesh-plane-utils.js
 *
 * 三角網格與平面的幾何關係判斷。
 *
 * plane:
 * {
 *   point: [x, y, z],
 *   normal: [x, y, z]
 * }
 */

class MeshPlaneUtils {
    EPSILON = 1e-8;

    validateMesh(mesh) {
        if (
            !mesh ||
            !Array.isArray(mesh.vertices) ||
            !Array.isArray(mesh.faces) ||
            mesh.vertices.length < 1
        ) {
            throw new Error("模型頂點資料不存在");
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

        return true;
    }

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

        if (length <= this.EPSILON) {
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
            (vertex[0] - normalized.point[0]) *
                normalized.normal[0] +
            (vertex[1] - normalized.point[1]) *
                normalized.normal[1] +
            (vertex[2] - normalized.point[2]) *
                normalized.normal[2]
        );
    }

    getDistances(mesh, plane) {
        this.validateMesh(mesh);

        const normalized = this.validatePlane(plane);

        return mesh.vertices.map(vertex =>
            this.signedDistance(vertex, normalized)
        );
    }

    classifyMesh(mesh, plane, tolerance = 1e-6) {
        if (!Number.isFinite(tolerance) || tolerance < 0) {
            throw new Error("容許誤差設定錯誤");
        }

        const distances = this.getDistances(mesh, plane);

        const min = Math.min(...distances);
        const max = Math.max(...distances);

        const hasPositive = distances.some(
            value => value > tolerance
        );

        const hasNegative = distances.some(
            value => value < -tolerance
        );

        const hasOnPlane = distances.some(
            value => Math.abs(value) <= tolerance
        );

        let classification;

        if (hasPositive && hasNegative) {
            classification = "crossing";
        } else if (hasPositive && hasOnPlane) {
            classification = "positive-touching";
        } else if (hasNegative && hasOnPlane) {
            classification = "negative-touching";
        } else if (hasPositive) {
            classification = "positive";
        } else if (hasNegative) {
            classification = "negative";
        } else {
            classification = "coplanar";
        }

        return {
            classification,
            minDistance: min,
            maxDistance: max,
            hasPositive,
            hasNegative,
            hasOnPlane,
            distances
        };
    }

    classifyWithThickness(mesh, plane, thickness, tolerance = 1e-6) {
        if (
            !Number.isFinite(thickness) ||
            thickness < 0
        ) {
            throw new Error("厚度必須大於或等於零");
        }

        const result = this.classifyMesh(
            mesh,
            plane,
            tolerance
        );

        const half = thickness / 2;

        const min = result.minDistance;
        const max = result.maxDistance;

        let region;

        if (min > half + tolerance) {
            region = "positive";
        } else if (max < -half - tolerance) {
            region = "negative";
        } else if (
            min >= -half - tolerance &&
            max <= half + tolerance
        ) {
            region = "inside-gap";
        } else {
            region = "intersects-gap";
        }

        return {
            ...result,
            region,
            halfThickness: half
        };
    }

    projectPoint(vertex, plane) {
        const normalized = this.validatePlane(plane);

        const distance = this.signedDistance(
            vertex,
            normalized
        );

        return [
            vertex[0] - normalized.normal[0] * distance,
            vertex[1] - normalized.normal[1] * distance,
            vertex[2] - normalized.normal[2] * distance
        ];
    }

    getPlaneBounds(mesh, plane) {
        this.validateMesh(mesh);

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
            size: max.map((value, axis) =>
                value - min[axis]
            ),
            vertices: projected
        };
    }
}

export const meshPlaneUtils = new MeshPlaneUtils();

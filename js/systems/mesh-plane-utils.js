
class MeshPlaneUtils {
    validateMesh(mesh) {
        if (!mesh || !Array.isArray(mesh.vertices) ||
            !Array.isArray(mesh.faces)) {
            throw new Error("網格資料格式錯誤");
        }

        if (mesh.vertices.length < 4 || mesh.faces.length < 4) {
            throw new Error("網格資料不足");
        }

        return true;
    }

    validatePlane(plane) {
        if (!plane || !Array.isArray(plane.point) ||
            !Array.isArray(plane.normal) ||
            plane.point.length !== 3 ||
            plane.normal.length !== 3 ||
            !plane.point.every(Number.isFinite) ||
            !plane.normal.every(Number.isFinite)) {
            throw new Error("平面資料無效");
        }

        const length = Math.hypot(...plane.normal);

        if (length < 1e-10) {
            throw new Error("平面法線不可為零");
        }

        return {
            point: [...plane.point],
            normal: plane.normal.map(v => v / length)
        };
    }

    signedDistance(vertex, plane) {
        const p = this.validatePlane(plane);

        return (
            (vertex[0] - p.point[0]) * p.normal[0] +
            (vertex[1] - p.point[1]) * p.normal[1] +
            (vertex[2] - p.point[2]) * p.normal[2]
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
        const distances = this.getDistances(mesh, plane);

        const hasPositive = distances.some(d => d > tolerance);
        const hasNegative = distances.some(d => d < -tolerance);
        const hasOnPlane = distances.some(d => Math.abs(d) <= tolerance);

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
            minDistance: Math.min(...distances),
            maxDistance: Math.max(...distances),
            hasPositive,
            hasNegative,
            hasOnPlane,
            distances
        };
    }

    classifyWithThickness(mesh, plane, thickness, tolerance = 1e-6) {
        if (!Number.isFinite(thickness) || thickness < 0) {
            throw new Error("厚度必須大於或等於零");
        }

        const result = this.classifyMesh(mesh, plane, tolerance);
        const half = thickness / 2;

        let region;

        if (result.minDistance > half + tolerance) {
            region = "positive";
        } else if (result.maxDistance < -half - tolerance) {
            region = "negative";
        } else if (
            result.minDistance >= -half - tolerance &&
            result.maxDistance <= half + tolerance
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
        const distance = this.signedDistance(vertex, normalized);

        return vertex.map((value, i) =>
            value - normalized.normal[i] * distance
        );
    }

    getPlaneBounds(mesh, plane) {
        this.validateMesh(mesh);

        const vertices = mesh.vertices.map(vertex =>
            this.projectPoint(vertex, plane)
        );

        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];

        for (const v of vertices) {
            for (let i = 0; i < 3; i++) {
                min[i] = Math.min(min[i], v[i]);
                max[i] = Math.max(max[i], v[i]);
            }
        }

        return {
            min,
            max,
            size: max.map((v, i) => v - min[i]),
            vertices
        };
    }
}

export const meshPlaneUtils = new MeshPlaneUtils();


class MeshContainmentUtils {
    EPSILON = 1e-8;

    validateMesh(mesh) {
        if (!mesh || !Array.isArray(mesh.vertices) ||
            !Array.isArray(mesh.faces) ||
            mesh.vertices.length < 4 ||
            mesh.faces.length < 4) {
            throw new Error("網格資料不完整");
        }

        for (const v of mesh.vertices) {
            if (!Array.isArray(v) || v.length !== 3 ||
                !v.every(Number.isFinite)) {
                throw new Error("網格頂點無效");
            }
        }

        for (const f of mesh.faces) {
            if (!Array.isArray(f) || f.length !== 3 ||
                !f.every(i => Number.isInteger(i) &&
                    i >= 0 && i < mesh.vertices.length)) {
                throw new Error("網格三角面無效");
            }
        }

        return true;
    }

    subtract(a, b) {
        return a.map((v, i) => v - b[i]);
    }

    dot(a, b) {
        return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }

    cross(a, b) {
        return [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0]
        ];
    }

    rayTriangleIntersection(origin, direction, a, b, c) {
        const edge1 = this.subtract(b, a);
        const edge2 = this.subtract(c, a);

        const h = this.cross(direction, edge2);
        const determinant = this.dot(edge1, h);

        if (Math.abs(determinant) < this.EPSILON) return null;

        const inverse = 1 / determinant;
        const s = this.subtract(origin, a);
        const u = inverse * this.dot(s, h);

        if (u < -this.EPSILON || u > 1 + this.EPSILON) {
            return null;
        }

        const q = this.cross(s, edge1);
        const v = inverse * this.dot(direction, q);

        if (v < -this.EPSILON || u + v > 1 + this.EPSILON) {
            return null;
        }

        const distance = inverse * this.dot(edge2, q);

        return distance > this.EPSILON ? distance : null;
    }

    getRayHits(point, direction, mesh) {
        const hits = [];

        for (const face of mesh.faces) {
            const distance = this.rayTriangleIntersection(
                point,
                direction,
                mesh.vertices[face[0]],
                mesh.vertices[face[1]],
                mesh.vertices[face[2]]
            );

            if (distance !== null) hits.push(distance);
        }

        hits.sort((a, b) => a - b);

        const unique = [];

        for (const hit of hits) {
            const previous = unique[unique.length - 1];

            if (previous === undefined ||
                Math.abs(hit - previous) > 1e-6) {
                unique.push(hit);
            }
        }

        return unique;
    }

    pointOnTriangle(point, a, b, c, tolerance = 1e-6) {
        const ab = this.subtract(b, a);
        const ac = this.subtract(c, a);
        const ap = this.subtract(point, a);

        const normal = this.cross(ab, ac);
        const normalLength = Math.hypot(...normal);

        if (normalLength < this.EPSILON) return false;

        const planeDistance =
            Math.abs(this.dot(ap, normal)) / normalLength;

        if (planeDistance > tolerance) return false;

        const d00 = this.dot(ab, ab);
        const d01 = this.dot(ab, ac);
        const d11 = this.dot(ac, ac);
        const d20 = this.dot(ap, ab);
        const d21 = this.dot(ap, ac);

        const denominator = d00 * d11 - d01 * d01;

        if (Math.abs(denominator) < this.EPSILON) return false;

        const v = (d11 * d20 - d01 * d21) / denominator;
        const w = (d00 * d21 - d01 * d20) / denominator;
        const u = 1 - v - w;

        return u >= -tolerance &&
            v >= -tolerance &&
            w >= -tolerance;
    }

    isOnSurface(point, mesh, tolerance = 1e-6) {
        for (const face of mesh.faces) {
            if (this.pointOnTriangle(
                point,
                mesh.vertices[face[0]],
                mesh.vertices[face[1]],
                mesh.vertices[face[2]],
                tolerance
            )) {
                return true;
            }
        }

        return false;
    }

    isPointInside(point, mesh, options = {}) {
        this.validateMesh(mesh);

        if (!Array.isArray(point) || point.length !== 3 ||
            !point.every(Number.isFinite)) {
            throw new Error("測試座標無效");
        }

        const tolerance = options.tolerance ?? 1e-6;

        if (this.isOnSurface(point, mesh, tolerance)) {
            return {
                inside: false,
                onSurface: true,
                outside: false
            };
        }

        const directions = [
            [1, 0.371, 0.529],
            [0.217, 1, 0.413],
            [0.319, 0.173, 1]
        ].map(direction => {
            const length = Math.hypot(...direction);
            return direction.map(v => v / length);
        });

        const rayResults = directions.map(direction => {
            const hits = this.getRayHits(point, direction, mesh);
            return hits.length % 2 === 1;
        });

        const votes = rayResults.filter(Boolean).length;

        return {
            inside: votes >= 2,
            onSurface: false,
            outside: votes < 2,
            votes,
            rayResults
        };
    }

    isPointInsideBoolean(point, mesh, options = {}) {
        return this.isPointInside(point, mesh, options).inside;
    }
}

export const meshContainmentUtils = new MeshContainmentUtils();

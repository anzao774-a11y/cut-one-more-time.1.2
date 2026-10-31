
 // js/systems/geometry-engine.js

class GeometryEngine {
    subtract(a, b) {
        return [
            a[0] - b[0],
            a[1] - b[1],
            a[2] - b[2]
        ];
    }

    add(a, b) {
        return [
            a[0] + b[0],
            a[1] + b[1],
            a[2] + b[2]
        ];
    }

    scale(v, s) {
        return [
            v[0] * s,
            v[1] * s,
            v[2] * s
        ];
    }

    dot(a, b) {
        return (
            a[0] * b[0] +
            a[1] * b[1] +
            a[2] * b[2]
        );
    }

    cross(a, b) {
        return [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0]
        ];
    }

    length(v) {
        return Math.sqrt(this.dot(v, v));
    }

    normalize(v) {
        const len = this.length(v);

        if (len < 1e-10) {
            throw new Error("無法正規化零向量");
        }

        return this.scale(v, 1 / len);
    }

    signedDistance(point, plane) {
        return this.dot(
            this.subtract(point, plane.point),
            plane.normal
        );
    }

    intersectEdge(a, b, distanceA, distanceB) {
        const denominator = distanceA - distanceB;

        if (Math.abs(denominator) < 1e-10) {
            return [...a];
        }

        const t = Math.max(
            0,
            Math.min(1, distanceA / denominator)
        );

        return [
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t
        ];
    }

    createVertexStore() {
        const vertices = [];
        const lookup = new Map();

        const getIndex = (point) => {
            const key = point
                .map(value => Math.round(value * 1e8))
                .join(",");

            if (lookup.has(key)) {
                return lookup.get(key);
            }

            const index = vertices.length;

            vertices.push([...point]);
            lookup.set(key, index);

            return index;
        };

        return {
            vertices,
            getIndex
        };
    }

    clipTriangle(triangle, plane) {
        const output = [];
        const intersections = [];

        for (let i = 0; i < triangle.length; i++) {
            const current = triangle[i];
            const next = triangle[(i + 1) % triangle.length];

            const distanceCurrent = this.signedDistance(
                current,
                plane
            );

            const distanceNext = this.signedDistance(
                next,
                plane
            );

            const currentInside = distanceCurrent >= -1e-8;
            const nextInside = distanceNext >= -1e-8;

            if (currentInside) {
                output.push(current);
            }

            if (currentInside !== nextInside) {
                const intersection = this.intersectEdge(
                    current,
                    next,
                    distanceCurrent,
                    distanceNext
                );

                output.push(intersection);
                intersections.push(intersection);
            }
        }

        return {
            output,
            intersections
        };
    }

    createCap(points, plane, vertexStore, faces) {
        const unique = new Map();

        for (const point of points) {
            const key = point
                .map(value => Math.round(value * 1e8))
                .join(",");

            unique.set(key, point);
        }

        const capPoints = [...unique.values()];

        if (capPoints.length < 3) {
            return;
        }

        const center = [0, 0, 0];

        for (const point of capPoints) {
            center[0] += point[0];
            center[1] += point[1];
            center[2] += point[2];
        }

        center[0] /= capPoints.length;
        center[1] /= capPoints.length;
        center[2] /= capPoints.length;

        const normal = this.normalize(plane.normal);

        const reference = Math.abs(normal[0]) < 0.9
            ? [1, 0, 0]
            : [0, 1, 0];

        const axisU = this.normalize(
            this.cross(normal, reference)
        );

        const axisV = this.cross(normal, axisU);

        // 將切面交點依照角度排序
        capPoints.sort((a, b) => {
            const va = this.subtract(a, center);
            const vb = this.subtract(b, center);

            const angleA = Math.atan2(
                this.dot(va, axisV),
                this.dot(va, axisU)
            );

            const angleB = Math.atan2(
                this.dot(vb, axisV),
                this.dot(vb, axisU)
            );

            return angleA - angleB;
        });

        const indices = capPoints.map(point =>
            vertexStore.getIndex(point)
        );

        // 修正封口方向：
        // 切面法線必須朝向保留模型的外側。
        // 因此將原本的三角形頂點順序反轉。
        for (let i = 1; i < indices.length - 1; i++) {
            faces.push([
                indices[0],
                indices[i + 1],
                indices[i]
            ]);
        }
    }

    clipMesh(mesh, plane) {
        if (
            !mesh ||
            !Array.isArray(mesh.vertices) ||
            !Array.isArray(mesh.faces)
        ) {
            throw new Error("模型格式錯誤");
        }

        if (!plane || !plane.point || !plane.normal) {
            throw new Error("切割平面設定錯誤");
        }

        const normalizedPlane = {
            point: plane.point,
            normal: this.normalize(plane.normal)
        };

        const store = this.createVertexStore();

        const faces = [];
        const capPoints = [];

        for (const face of mesh.faces) {
            if (!Array.isArray(face) || face.length !== 3) {
                throw new Error("目前只支援三角形面");
            }

            const triangle = face.map(index => {
                const vertex = mesh.vertices[index];

                if (!vertex) {
                    throw new Error("模型包含無效頂點索引");
                }

                return vertex;
            });

            const result = this.clipTriangle(
                triangle,
                normalizedPlane
            );

            capPoints.push(...result.intersections);

            if (result.output.length < 3) {
                continue;
            }

            const indices = result.output.map(point =>
                store.getIndex(point)
            );

            for (let i = 1; i < indices.length - 1; i++) {
                faces.push([
                    indices[0],
                    indices[i],
                    indices[i + 1]
                ]);
            }
        }

        this.createCap(
            capPoints,
            normalizedPlane,
            store,
            faces
        );

        return {
            vertices: store.vertices,
            faces
        };
    }
}

export const geometryEngine = new GeometryEngine();

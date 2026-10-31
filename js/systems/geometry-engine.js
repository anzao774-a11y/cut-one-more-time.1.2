// js/systems/geometry-engine.js

class GeometryEngine {
    // 向量相減
    subtract(a, b) {
        return [
            a[0] - b[0],
            a[1] - b[1],
            a[2] - b[2]
        ];
    }

    // 向量相加
    add(a, b) {
        return [
            a[0] + b[0],
            a[1] + b[1],
            a[2] + b[2]
        ];
    }

    // 向量縮放
    scale(v, s) {
        return [
            v[0] * s,
            v[1] * s,
            v[2] * s
        ];
    }

    // 內積
    dot(a, b) {
        return (
            a[0] * b[0] +
            a[1] * b[1] +
            a[2] * b[2]
        );
    }

    // 外積
    cross(a, b) {
        return [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0]
        ];
    }

    // 向量長度
    length(v) {
        return Math.sqrt(this.dot(v, v));
    }

    // 向量正規化
    normalize(v) {
        const len = this.length(v);

        if (len < 1e-10) {
            throw new Error("無法正規化零向量");
        }

        return this.scale(v, 1 / len);
    }

    // 計算點到切割平面的有號距離
    signedDistance(point, plane) {
        return this.dot(
            this.subtract(point, plane.point),
            plane.normal
        );
    }

    // 計算兩點之間的切割交點
    intersectEdge(a, b, distanceA, distanceB) {
        const denominator = distanceA - distanceB;

        if (Math.abs(denominator) < 1e-10) {
            return [...a];
        }

        const t = distanceA / denominator;

        return [
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t
        ];
    }

    // 建立唯一頂點，避免重複座標
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

        return { vertices, getIndex };
    }

    // 將三角形裁切，只保留平面正側
    clipTriangle(triangle, plane) {
        const output = [];
        const intersections = [];

        for (let i = 0; i < triangle.length; i++) {
            const current = triangle[i];
            const next = triangle[(i + 1) % triangle.length];

            const dCurrent = this.signedDistance(current, plane);
            const dNext = this.signedDistance(next, plane);

            const currentInside = dCurrent >= -1e-8;
            const nextInside = dNext >= -1e-8;

            if (currentInside) {
                output.push(current);
            }

            if (currentInside !== nextInside) {
                const intersection = this.intersectEdge(
                    current,
                    next,
                    dCurrent,
                    dNext
                );

                output.push(intersection);
                intersections.push(intersection);
            }
        }

        return { output, intersections };
    }

    // 建立切面封口
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

        // 使用扇形三角化建立封口
        for (let i = 1; i < indices.length - 1; i++) {
            faces.push([
                indices[0],
                indices[i],
                indices[i + 1]
            ]);
        }
    }

    // 切割網格，保留切割平面正側
    clipMesh(mesh, plane) {
        if (!mesh || !Array.isArray(mesh.vertices) ||
            !Array.isArray(mesh.faces)) {
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
                continue;
            }

            const triangle = face.map(index => {
                const vertex = mesh.vertices[index];

                if (!vertex) {
                    throw new Error("模型面包含無效頂點索引");
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

// js/systems/geometry-engine.js

class GeometryEngine {
    constructor() {
        this.EPSILON = 1e-8;
        this.KEY_PRECISION = 1e8;
    }

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

    pointKey(point) {
        return point
            .map(value => Math.round(value * this.KEY_PRECISION))
            .join(",");
    }

    samePoint(a, b) {
        return this.length(this.subtract(a, b)) < this.EPSILON;
    }

    uniquePoints(points) {
        const result = new Map();

        for (const point of points) {
            result.set(this.pointKey(point), [...point]);
        }

        return [...result.values()];
    }

    intersectEdge(a, b, distanceA, distanceB) {
        const denominator = distanceA - distanceB;

        if (Math.abs(denominator) < 1e-12) {
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
            const key = this.pointKey(point);

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

            const currentInside = distanceCurrent >= -this.EPSILON;
            const nextInside = distanceNext >= -this.EPSILON;

            if (currentInside) {
                output.push([...current]);
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

        const cleanOutput = [];

        for (const point of output) {
            if (
                cleanOutput.length === 0 ||
                !this.samePoint(
                    cleanOutput[cleanOutput.length - 1],
                    point
                )
            ) {
                cleanOutput.push(point);
            }
        }

        if (
            cleanOutput.length > 1 &&
            this.samePoint(
                cleanOutput[0],
                cleanOutput[cleanOutput.length - 1]
            )
        ) {
            cleanOutput.pop();
        }

        return {
            output: cleanOutput,
            intersections: this.uniquePoints(intersections)
        };
    }

    collectBoundarySegments(mesh, plane) {
        const segments = [];

        for (const face of mesh.faces) {
            const triangle = face.map(index => mesh.vertices[index]);

            const result = this.clipTriangle(triangle, plane);
            const points = result.intersections;

            if (points.length === 2) {
                if (!this.samePoint(points[0], points[1])) {
                    segments.push([
                        points[0],
                        points[1]
                    ]);
                }
            }
        }

        return segments;
    }

    connectBoundaryLoops(segments) {
        const nodes = new Map();
        const edges = [];
        const edgeSet = new Set();

        const addNode = (point) => {
            const key = this.pointKey(point);

            if (!nodes.has(key)) {
                nodes.set(key, {
                    point: [...point],
                    edges: []
                });
            }

            return key;
        };

        for (const segment of segments) {
            const keyA = addNode(segment[0]);
            const keyB = addNode(segment[1]);

            if (keyA === keyB) {
                continue;
            }

            const edgeKey = [keyA, keyB].sort().join("|");

            if (edgeSet.has(edgeKey)) {
                continue;
            }

            edgeSet.add(edgeKey);

            const edgeIndex = edges.length;

            edges.push({
                a: keyA,
                b: keyB,
                used: false
            });

            nodes.get(keyA).edges.push(edgeIndex);
            nodes.get(keyB).edges.push(edgeIndex);
        }

        for (const [key, node] of nodes) {
            if (node.edges.length !== 2) {
                throw new Error(
                    `切割輪廓不完整：交點 ${key} 連接了 ${node.edges.length} 條線段`
                );
            }
        }

        const loops = [];

        for (let startEdge = 0; startEdge < edges.length; startEdge++) {
            if (edges[startEdge].used) {
                continue;
            }

            const firstEdge = edges[startEdge];

            const loop = [];
            const startKey = firstEdge.a;

            let currentKey = startKey;
            let currentEdgeIndex = startEdge;

            let closed = false;
            let safety = 0;

            while (safety++ <= edges.length + 1) {
                const edge = edges[currentEdgeIndex];

                if (edge.used) {
                    break;
                }

                edge.used = true;

                loop.push(nodes.get(currentKey).point);

                const nextKey = edge.a === currentKey
                    ? edge.b
                    : edge.a;

                if (nextKey === startKey) {
                    closed = true;
                    break;
                }

                const nextNode = nodes.get(nextKey);

                const nextEdgeIndex = nextNode.edges.find(
                    index => !edges[index].used
                );

                if (nextEdgeIndex === undefined) {
                    break;
                }

                currentKey = nextKey;
                currentEdgeIndex = nextEdgeIndex;
            }

            if (!closed || loop.length < 3) {
                throw new Error("切割輪廓無法形成封閉區域");
            }

            loops.push(loop);
        }

        return loops;
    }

    calculatePolygonNormal(points) {
        const normal = [0, 0, 0];

        for (let i = 0; i < points.length; i++) {
            const current = points[i];
            const next = points[(i + 1) % points.length];

            normal[0] +=
                (current[1] - next[1]) *
                (current[2] + next[2]);

            normal[1] +=
                (current[2] - next[2]) *
                (current[0] + next[0]);

            normal[2] +=
                (current[0] - next[0]) *
                (current[1] + next[1]);
        }

        return normal;
    }

    createCap(loop, plane, vertexStore, faces) {
        let points = [...loop];

        const polygonNormal = this.calculatePolygonNormal(points);

        // 保留模型的切面外側方向應與切割平面法線相反。
        const desiredNormal = this.scale(plane.normal, -1);

        if (this.dot(polygonNormal, desiredNormal) < 0) {
            points.reverse();
        }

        const indices = points.map(point =>
            vertexStore.getIndex(point)
        );

        // 將已連接成封閉輪廓的多邊形進行扇形三角剖分。
        for (let i = 1; i < indices.length - 1; i++) {
            const a = indices[0];
            const b = indices[i];
            const c = indices[i + 1];

            if (a !== b && b !== c && c !== a) {
                faces.push([a, b, c]);
            }
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
            point: [...plane.point],
            normal: this.normalize(plane.normal)
        };

        const store = this.createVertexStore();
        const faces = [];

        // 第一步：裁切原始三角形。
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

            if (result.output.length < 3) {
                continue;
            }

            const indices = result.output.map(point =>
                store.getIndex(point)
            );

            for (let i = 1; i < indices.length - 1; i++) {
                const a = indices[0];
                const b = indices[i];
                const c = indices[i + 1];

                if (a !== b && b !== c && c !== a) {
                    faces.push([a, b, c]);
                }
            }
        }

        // 第二步：從每個原始三角形收集切割線段。
        const segments = this.collectBoundarySegments(
            mesh,
            normalizedPlane
        );

        // 第三步：把線段連接成封閉輪廓。
        const loops = this.connectBoundaryLoops(segments);

        // 第四步：為每個封閉輪廓建立封口面。
        for (const loop of loops) {
            this.createCap(
                loop,
                normalizedPlane,
                store,
                faces
            );
        }

        return {
            vertices: store.vertices,
            faces
        };
    }
}

export const geometryEngine = new GeometryEngine();





// js/systems/geometry-engine.js

class GeometryEngine {
    constructor() {
        this.EPSILON = 1e-8;
        this.KEY_PRECISION = 1e8;
        this.AREA_EPSILON = 1e-12;
    }


    // ==========================================
    // 基礎向量運算
    // ==========================================

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


    // ==========================================
    // 頂點與幾何資料
    // ==========================================

    pointKey(point) {
        return point
            .map(value =>
                Math.round(value * this.KEY_PRECISION)
            )
            .join(",");
    }


    samePoint(a, b) {
        return (
            this.length(
                this.subtract(a, b)
            ) < this.EPSILON
        );
    }


    uniquePoints(points) {
        const result = new Map();

        for (const point of points) {
            const key = this.pointKey(point);

            if (!result.has(key)) {
                result.set(key, [...point]);
            }
        }

        return [...result.values()];
    }


    validateMesh(mesh) {
        if (
            !mesh ||
            !Array.isArray(mesh.vertices) ||
            !Array.isArray(mesh.faces)
        ) {
            throw new Error("模型格式錯誤");
        }

        if (
            mesh.vertices.length < 3 ||
            mesh.faces.length < 1
        ) {
            throw new Error("模型缺少必要的頂點或面");
        }

        for (let i = 0; i < mesh.vertices.length; i++) {
            const vertex = mesh.vertices[i];

            if (
                !Array.isArray(vertex) ||
                vertex.length !== 3 ||
                !vertex.every(Number.isFinite)
            ) {
                throw new Error(
                    `模型包含無效頂點：${i}`
                );
            }
        }

        for (let i = 0; i < mesh.faces.length; i++) {
            const face = mesh.faces[i];

            if (
                !Array.isArray(face) ||
                face.length !== 3
            ) {
                throw new Error(
                    `模型包含非三角形面：${i}`
                );
            }

            if (
                !face.every(index =>
                    Number.isInteger(index) &&
                    index >= 0 &&
                    index < mesh.vertices.length
                )
            ) {
                throw new Error(
                    `模型包含無效頂點索引：${i}`
                );
            }

            if (
                face[0] === face[1] ||
                face[1] === face[2] ||
                face[2] === face[0]
            ) {
                throw new Error(
                    `模型包含重複頂點面：${i}`
                );
            }
        }

        return true;
    }


    createVertexStore() {
        const vertices = [];
        const lookup = new Map();

        const getIndex = point => {
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


    // ==========================================
    // 切割平面與交點
    // ==========================================

    normalizePlane(plane) {
        if (
            !plane ||
            !Array.isArray(plane.point) ||
            !Array.isArray(plane.normal) ||
            plane.point.length !== 3 ||
            plane.normal.length !== 3 ||
            !plane.point.every(Number.isFinite) ||
            !plane.normal.every(Number.isFinite)
        ) {
            throw new Error("切割平面設定錯誤");
        }

        return {
            point: [...plane.point],
            normal: this.normalize(plane.normal)
        };
    }


    getSnappedDistance(point, plane) {
        const distance = this.signedDistance(
            point,
            plane
        );

        return Math.abs(distance) <= this.EPSILON
            ? 0
            : distance;
    }


    intersectEdge(a, b, distanceA, distanceB) {
        const denominator = distanceA - distanceB;

        if (Math.abs(denominator) < 1e-12) {
            return [...a];
        }

        const t = Math.max(
            0,
            Math.min(
                1,
                distanceA / denominator
            )
        );

        return [
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t
        ];
    }


    // ==========================================
    // 單一三角形裁切
    // ==========================================

    clipTriangle(triangle, plane) {
        const output = [];
        const intersections = [];

        const distances = triangle.map(vertex =>
            this.getSnappedDistance(vertex, plane)
        );

        for (let i = 0; i < triangle.length; i++) {
            const nextIndex = (i + 1) % triangle.length;

            const current = triangle[i];
            const next = triangle[nextIndex];

            const distanceCurrent = distances[i];
            const distanceNext = distances[nextIndex];

            const currentInside =
                distanceCurrent >= 0;

            const nextInside =
                distanceNext >= 0;


            if (currentInside) {
                output.push([...current]);
            }


            // 只有嚴格跨越平面的邊才需要插入新交點。
            if (
                (distanceCurrent > 0 && distanceNext < 0) ||
                (distanceCurrent < 0 && distanceNext > 0)
            ) {
                const intersection = this.intersectEdge(
                    current,
                    next,
                    distanceCurrent,
                    distanceNext
                );

                output.push(intersection);

                intersections.push(intersection);
            }


            // 已經位於平面上的頂點也是交點。
            if (distanceCurrent === 0) {
                intersections.push([...current]);
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

            intersections: this.uniquePoints(
                intersections
            )
        };
    }


    // ==========================================
    // 收集切割邊界
    // ==========================================

    collectBoundarySegments(mesh, plane) {
        const segments = [];

        const segmentKeys = new Set();

        for (const face of mesh.faces) {
            const triangle = face.map(
                index => mesh.vertices[index]
            );

            const distances = triangle.map(vertex =>
                this.getSnappedDistance(vertex, plane)
            );

            // 整個三角形都位於切割平面上時，
            // 不把它當成一般交線。
            if (distances.every(distance => distance === 0)) {
                continue;
            }

            const points = [];

            for (let i = 0; i < 3; i++) {
                const nextIndex = (i + 1) % 3;

                const current = triangle[i];
                const next = triangle[nextIndex];

                const distanceCurrent = distances[i];
                const distanceNext = distances[nextIndex];


                if (distanceCurrent === 0) {
                    points.push([...current]);
                }


                if (
                    (distanceCurrent > 0 && distanceNext < 0) ||
                    (distanceCurrent < 0 && distanceNext > 0)
                ) {
                    points.push(
                        this.intersectEdge(
                            current,
                            next,
                            distanceCurrent,
                            distanceNext
                        )
                    );
                }
            }


            const unique = this.uniquePoints(points);

            if (unique.length !== 2) {
                continue;
            }

            const [pointA, pointB] = unique;

            if (this.samePoint(pointA, pointB)) {
                continue;
            }

            const keyA = this.pointKey(pointA);
            const keyB = this.pointKey(pointB);

            const edgeKey = [
                keyA,
                keyB
            ].sort().join("|");

            if (segmentKeys.has(edgeKey)) {
                continue;
            }

            segmentKeys.add(edgeKey);

            segments.push([
                pointA,
                pointB
            ]);
        }

        return segments;
    }


    // ==========================================
    // 連接封閉切割輪廓
    // ==========================================

    connectBoundaryLoops(segments) {
        const nodes = new Map();

        const edges = [];

        const edgeSet = new Set();


        const addNode = point => {
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

            const edgeKey = [
                keyA,
                keyB
            ].sort().join("|");

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


        if (edges.length === 0) {
            return [];
        }


        // 封閉輪廓的每個交點都必須連接兩條邊。
        for (const [key, node] of nodes) {
            if (node.edges.length !== 2) {
                throw new Error(
                    `切割輪廓不完整：交點 ${key} 連接了 ${node.edges.length} 條線段`
                );
            }
        }


        const loops = [];


        for (
            let startEdge = 0;
            startEdge < edges.length;
            startEdge++
        ) {
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

                loop.push(
                    nodes.get(currentKey).point
                );


                const nextKey =
                    edge.a === currentKey
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
                throw new Error(
                    "切割輪廓無法形成封閉區域"
                );
            }


            loops.push(loop);
        }


        return loops;
    }


    // ==========================================
    // 二維投影工具
    // ==========================================

    createProjectionBasis(normal) {
        const reference =
            Math.abs(normal[0]) < 0.8
                ? [1, 0, 0]
                : [0, 1, 0];

        const u = this.normalize(
            this.cross(reference, normal)
        );

        const v = this.normalize(
            this.cross(normal, u)
        );

        return {
            u,
            v,
            normal
        };
    }


    projectPoint(point, origin, basis) {
        const relative = this.subtract(
            point,
            origin
        );

        return [
            this.dot(relative, basis.u),
            this.dot(relative, basis.v)
        ];
    }


    cross2(a, b, c) {
        return (
            (b[0] - a[0]) * (c[1] - a[1]) -
            (b[1] - a[1]) * (c[0] - a[0])
        );
    }


    polygonArea2D(points) {
        let area = 0;

        for (let i = 0; i < points.length; i++) {
            const current = points[i];

            const next = points[
                (i + 1) % points.length
            ];

            area +=
                current[0] * next[1] -
                next[0] * current[1];
        }

        return area / 2;
    }


    // ==========================================
    // 清理多邊形
    // ==========================================

    cleanPolygon2D(points, originalPoints) {
        const cleaned = [];

        const cleanedOriginal = [];

        for (let i = 0; i < points.length; i++) {
            const current = points[i];

            const previous =
                cleaned[cleaned.length - 1];

            if (
                previous &&
                Math.hypot(
                    current[0] - previous[0],
                    current[1] - previous[1]
                ) < this.EPSILON
            ) {
                continue;
            }

            cleaned.push(current);

            cleanedOriginal.push(
                originalPoints[i]
            );
        }


        if (cleaned.length > 1) {
            const first = cleaned[0];

            const last = cleaned[cleaned.length - 1];

            if (
                Math.hypot(
                    first[0] - last[0],
                    first[1] - last[1]
                ) < this.EPSILON
            ) {
                cleaned.pop();
                cleanedOriginal.pop();
            }
        }


        // 移除位於同一直線上的中間點。
        let changed = true;

        let safety = 0;

        while (
            changed &&
            cleaned.length >= 3 &&
            safety++ < points.length * 2
        ) {
            changed = false;

            for (
                let i = 0;
                i < cleaned.length;
                i++
            ) {
                const previousIndex =
                    (i - 1 + cleaned.length) %
                    cleaned.length;

                const nextIndex =
                    (i + 1) % cleaned.length;

                const cross = this.cross2(
                    cleaned[previousIndex],
                    cleaned[i],
                    cleaned[nextIndex]
                );

                if (Math.abs(cross) <= this.AREA_EPSILON) {
                    cleaned.splice(i, 1);
                    cleanedOriginal.splice(i, 1);

                    changed = true;

                    break;
                }
            }
        }


        return {
            points: cleaned,
            originalPoints: cleanedOriginal
        };
    }


    // ==========================================
    // 點是否位於三角形內
    // ==========================================

    pointInTriangle2D(point, a, b, c) {
        const cross1 = this.cross2(a, b, point);
        const cross2 = this.cross2(b, c, point);
        const cross3 = this.cross2(c, a, point);

        const hasNegative =
            cross1 < -this.AREA_EPSILON ||
            cross2 < -this.AREA_EPSILON ||
            cross3 < -this.AREA_EPSILON;

        const hasPositive =
            cross1 > this.AREA_EPSILON ||
            cross2 > this.AREA_EPSILON ||
            cross3 > this.AREA_EPSILON;

        return !(hasNegative && hasPositive);
    }


    // ==========================================
    // 點是否位於多邊形內
    // ==========================================

    pointInPolygon2D(point, polygon) {
        let inside = false;

        for (
            let i = 0, j = polygon.length - 1;
            i < polygon.length;
            j = i++
        ) {
            const a = polygon[i];
            const b = polygon[j];

            const intersects =
                (
                    a[1] > point[1]
                ) !== (
                    b[1] > point[1]
                ) &&
                (
                    point[0] <
                    (b[0] - a[0]) *
                    (point[1] - a[1]) /
                    (b[1] - a[1]) +
                    a[0]
                );

            if (intersects) {
                inside = !inside;
            }
        }

        return inside;
    }


    // ==========================================
    // 檢查輪廓是否存在內孔
    // ==========================================

    validateNoNestedLoops(loops, plane) {
        if (loops.length <= 1) {
            return true;
        }

        const desiredNormal = this.scale(
            plane.normal,
            -1
        );

        const basis = this.createProjectionBasis(
            desiredNormal
        );

        const origin = plane.point;

        const projectedLoops = loops.map(loop =>
            loop.map(point =>
                this.projectPoint(
                    point,
                    origin,
                    basis
                )
            )
        );


        for (let i = 0; i < projectedLoops.length; i++) {
            for (
                let j = i + 1;
                j < projectedLoops.length;
                j++
            ) {
                const loopA = projectedLoops[i];
                const loopB = projectedLoops[j];

                const aInsideB = this.pointInPolygon2D(
                    loopA[0],
                    loopB
                );

                const bInsideA = this.pointInPolygon2D(
                    loopB[0],
                    loopA
                );

                if (aInsideB || bInsideA) {
                    throw new Error(
                        "切割截面包含巢狀輪廓或內孔，目前不支援自動封口。"
                    );
                }
            }
        }

        return true;
    }


    // ==========================================
    // 耳切法三角剖分
    // ==========================================

    triangulatePolygon2D(points) {
        if (
            !Array.isArray(points) ||
            points.length < 3
        ) {
            throw new Error(
                "切割封口多邊形的頂點數不足"
            );
        }


        const area = this.polygonArea2D(points);

        if (Math.abs(area) <= this.AREA_EPSILON) {
            throw new Error(
                "切割封口多邊形面積過小或退化"
            );
        }


        // 耳切法統一使用逆時針方向。
        const polygon = points.map(
            (point, index) => ({
                point,
                index
            })
        );

        if (area < 0) {
            polygon.reverse();
        }


        const triangles = [];

        let safety = 0;

        const maxIterations =
            polygon.length * polygon.length * 2;


        while (
            polygon.length > 3 &&
            safety++ < maxIterations
        ) {
            let earFound = false;


            for (
                let i = 0;
                i < polygon.length;
                i++
            ) {
                const previousIndex =
                    (i - 1 + polygon.length) %
                    polygon.length;

                const nextIndex =
                    (i + 1) % polygon.length;

                const previous =
                    polygon[previousIndex];

                const current =
                    polygon[i];

                const next =
                    polygon[nextIndex];


                // 凹角不能當作耳朵。
                const convexity = this.cross2(
                    previous.point,
                    current.point,
                    next.point
                );

                if (
                    convexity <= this.AREA_EPSILON
                ) {
                    continue;
                }


                // 確認其他頂點沒有落在候選三角形內。
                let containsOtherPoint = false;

                for (
                    let j = 0;
                    j < polygon.length;
                    j++
                ) {
                    if (
                        j === previousIndex ||
                        j === i ||
                        j === nextIndex
                    ) {
                        continue;
                    }

                    if (
                        this.pointInTriangle2D(
                            polygon[j].point,
                            previous.point,
                            current.point,
                            next.point
                        )
                    ) {
                        containsOtherPoint = true;
                        break;
                    }
                }


                if (containsOtherPoint) {
                    continue;
                }


                triangles.push([
                    previous.index,
                    current.index,
                    next.index
                ]);

                polygon.splice(i, 1);

                earFound = true;

                break;
            }


            if (!earFound) {
                throw new Error(
                    "耳切法無法找到有效三角形，切割輪廓可能自交或退化。"
                );
            }
        }


        if (polygon.length !== 3) {
            throw new Error(
                "切割封口三角剖分未能完成"
            );
        }


        const finalArea = this.cross2(
            polygon[0].point,
            polygon[1].point,
            polygon[2].point
        );

        if (
            Math.abs(finalArea) <= this.AREA_EPSILON
        ) {
            throw new Error(
                "最後一個封口三角形面積過小"
            );
        }


        triangles.push([
            polygon[0].index,
            polygon[1].index,
            polygon[2].index
        ]);

        return triangles;
    }


    // ==========================================
    // 封口面建立
    // ==========================================

    calculatePolygonNormal(points) {
        const normal = [0, 0, 0];

        for (
            let i = 0;
            i < points.length;
            i++
        ) {
            const current = points[i];

            const next = points[
                (i + 1) % points.length
            ];

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
        if (!Array.isArray(loop) || loop.length < 3) {
            throw new Error(
                "切割封口輪廓無效"
            );
        }


        // 被保留區域的外側方向與切割平面法線相反。
        const desiredNormal = this.scale(
            plane.normal,
            -1
        );

        const basis = this.createProjectionBasis(
            desiredNormal
        );


        let points = [...loop];

        let projected = points.map(point =>
            this.projectPoint(
                point,
                plane.point,
                basis
            )
        );


        const cleaned = this.cleanPolygon2D(
            projected,
            points
        );

        projected = cleaned.points;
        points = cleaned.originalPoints;


        if (points.length < 3) {
            throw new Error(
                "切割封口輪廓清理後不足三個頂點"
            );
        }


        const polygonNormal =
            this.calculatePolygonNormal(points);

        if (
            this.length(polygonNormal) <=
            this.AREA_EPSILON
        ) {
            throw new Error(
                "切割封口輪廓法線無效"
            );
        }


        // 讓封口面法線朝向被切除的一側。
        if (
            this.dot(
                polygonNormal,
                desiredNormal
            ) < 0
        ) {
            points.reverse();
            projected.reverse();
        }


        // 使用耳切法處理凹多邊形。
        const triangles = this.triangulatePolygon2D(
            projected
        );


        const indices = points.map(point =>
            vertexStore.getIndex(point)
        );


        for (const triangle of triangles) {
            const a = indices[triangle[0]];
            const b = indices[triangle[1]];
            const c = indices[triangle[2]];

            if (
                a === b ||
                b === c ||
                c === a
            ) {
                throw new Error(
                    "封口面包含重複頂點"
                );
            }

            faces.push([
                a,
                b,
                c
            ]);
        }
    }


    // ==========================================
    // 完整模型切割
    // ==========================================

    clipMesh(mesh, plane) {
        this.validateMesh(mesh);

        const normalizedPlane = this.normalizePlane(
            plane
        );

        const store = this.createVertexStore();

        const faces = [];


        // ======================================
        // 第一步：裁切原始三角形
        // ======================================

        for (const face of mesh.faces) {
            const triangle = face.map(
                index => mesh.vertices[index]
            );

            const result = this.clipTriangle(
                triangle,
                normalizedPlane
            );

            if (result.output.length < 3) {
                continue;
            }


            const indices = result.output.map(
                point => store.getIndex(point)
            );


            // 單一三角形裁切後最多形成四邊形。
            // 此處扇形拆分是凸多邊形，不會有凹輪廓問題。
            for (
                let i = 1;
                i < indices.length - 1;
                i++
            ) {
                const a = indices[0];
                const b = indices[i];
                const c = indices[i + 1];

                if (
                    a !== b &&
                    b !== c &&
                    c !== a
                ) {
                    faces.push([
                        a,
                        b,
                        c
                    ]);
                }
            }
        }


        // ======================================
        // 第二步：收集切割交線
        // ======================================

        const segments = this.collectBoundarySegments(
            mesh,
            normalizedPlane
        );


        // 沒有交線表示切割平面沒有真正切開模型。
        if (segments.length === 0) {
            if (faces.length === 0) {
                throw new Error(
                    "切割後沒有保留任何模型面"
                );
            }

            return {
                vertices: store.vertices,
                faces
            };
        }


        // ======================================
        // 第三步：連接封閉輪廓
        // ======================================

        const loops = this.connectBoundaryLoops(
            segments
        );


        if (loops.length === 0) {
            throw new Error(
                "切割平面未形成有效封口輪廓"
            );
        }


        // ======================================
        // 第四步：檢查內孔
        // ======================================

        this.validateNoNestedLoops(
            loops,
            normalizedPlane
        );


        // ======================================
        // 第五步：建立封口面
        // ======================================

        for (const loop of loops) {
            this.createCap(
                loop,
                normalizedPlane,
                store,
                faces
            );
        }


        // ======================================
        // 第六步：最終資料檢查
        // ======================================

        if (
            store.vertices.length < 4 ||
            faces.length < 4
        ) {
            throw new Error(
                "切割結果幾何資料不足"
            );
        }


        const result = {
            vertices: store.vertices,
            faces
        };

        this.validateMesh(result);

        return result;
    }
}


export const geometryEngine = new GeometryEngine();

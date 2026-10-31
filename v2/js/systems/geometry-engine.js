// v2/js/systems/geometry-engine.js

const EPSILON = 1e-8;

function vector(x = 0, y = 0, z = 0) {
    return { x, y, z };
}

function subtract(a, b) {
    return vector(
        a.x - b.x,
        a.y - b.y,
        a.z - b.z
    );
}

function add(a, b) {
    return vector(
        a.x + b.x,
        a.y + b.y,
        a.z + b.z
    );
}

function multiply(v, scalar) {
    return vector(
        v.x * scalar,
        v.y * scalar,
        v.z * scalar
    );
}

function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
    return vector(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x
    );
}

function length(v) {
    return Math.sqrt(dot(v, v));
}

function normalize(v) {
    const magnitude = length(v);

    if (magnitude < EPSILON) {
        throw new Error("切割平面的法線方向不可為零。");
    }

    return multiply(v, 1 / magnitude);
}

function interpolate(a, b, t) {
    return add(a, multiply(subtract(b, a), t));
}

function signedDistance(point, plane) {
    return dot(
        subtract(point, plane.point),
        plane.normal
    );
}

function cleanPolygon(points) {
    const result = [];

    for (const point of points) {
        const previous = result[result.length - 1];

        if (
            !previous ||
            length(subtract(point, previous)) > EPSILON
        ) {
            result.push(point);
        }
    }

    if (
        result.length > 1 &&
        length(subtract(result[0], result[result.length - 1])) <= EPSILON
    ) {
        result.pop();
    }

    return result;
}

function clipTriangle(triangle, plane, keepPositive, intersections) {
    let polygon = [...triangle];

    const output = [];

    for (let index = 0; index < polygon.length; index++) {
        const current = polygon[index];
        const next = polygon[(index + 1) % polygon.length];

        const currentDistance = signedDistance(current, plane);
        const nextDistance = signedDistance(next, plane);

        const currentInside = keepPositive
            ? currentDistance >= -EPSILON
            : currentDistance <= EPSILON;

        const nextInside = keepPositive
            ? nextDistance >= -EPSILON
            : nextDistance <= EPSILON;

        if (currentInside && nextInside) {
            output.push(next);
            continue;
        }

        if (currentInside && !nextInside) {
            const t = currentDistance /
                (currentDistance - nextDistance);

            const point = interpolate(current, next, t);

            output.push(point);
            intersections.push(point);
            continue;
        }

        if (!currentInside && nextInside) {
            const t = currentDistance /
                (currentDistance - nextDistance);

            const point = interpolate(current, next, t);

            output.push(point);
            output.push(next);
            intersections.push(point);
        }
    }

    return cleanPolygon(output);
}

function triangulatePolygon(polygon) {
    const triangles = [];

    if (polygon.length < 3) {
        return triangles;
    }

    for (let index = 1; index < polygon.length - 1; index++) {
        triangles.push([
            polygon[0],
            polygon[index],
            polygon[index + 1]
        ]);
    }

    return triangles;
}

function uniquePoints(points) {
    const result = [];

    for (const point of points) {
        const exists = result.some(
            existing =>
                length(subtract(existing, point)) <= EPSILON
        );

        if (!exists) {
            result.push(point);
        }
    }

    return result;
}

function sortPointsOnPlane(points, normal) {
    if (points.length < 3) {
        return points;
    }

    const center = points.reduce(
        (sum, point) => add(sum, point),
        vector()
    );

    const centroid = multiply(center, 1 / points.length);

    const reference = Math.abs(normal.x) < 0.9
        ? vector(1, 0, 0)
        : vector(0, 1, 0);

    const axisU = normalize(cross(normal, reference));
    const axisV = cross(normal, axisU);

    return [...points].sort((a, b) => {
        const da = subtract(a, centroid);
        const db = subtract(b, centroid);

        const angleA = Math.atan2(
            dot(da, axisV),
            dot(da, axisU)
        );

        const angleB = Math.atan2(
            dot(db, axisV),
            dot(db, axisU)
        );

        return angleA - angleB;
    });
}

function calculateNormal(a, b, c) {
    const normal = cross(
        subtract(b, a),
        subtract(c, a)
    );

    if (length(normal) < EPSILON) {
        return null;
    }

    return normalize(normal);
}

function createCapTriangles(points, normal) {
    const ordered = sortPointsOnPlane(
        uniquePoints(points),
        normal
    );

    return triangulatePolygon(ordered);
}

function validateMesh(mesh) {
    if (!mesh || !Array.isArray(mesh.vertices)) {
        throw new Error("原石模型缺少 vertices 資料。");
    }

    if (!Array.isArray(mesh.faces) || mesh.faces.length === 0) {
        throw new Error("原石模型缺少 faces 資料。");
    }

    for (const face of mesh.faces) {
        if (
            !Array.isArray(face) ||
            face.length !== 3 ||
            face.some(
                index =>
                    !Number.isInteger(index) ||
                    index < 0 ||
                    index >= mesh.vertices.length
            )
        ) {
            throw new Error("原石模型包含無效三角面。");
        }
    }
}

function validatePlane(plane) {
    if (!plane?.point || !plane?.normal) {
        throw new Error("缺少切割平面資料。");
    }

    return {
        point: vector(
            plane.point.x,
            plane.point.y,
            plane.point.z
        ),
        normal: normalize(
            vector(
                plane.normal.x,
                plane.normal.y,
                plane.normal.z
            )
        )
    };
}

function buildMesh(triangles, capTriangles = []) {
    const vertices = [];
    const faces = [];
    const vertexMap = new Map();

    function getVertexIndex(point) {
        const key = [
            point.x.toFixed(8),
            point.y.toFixed(8),
            point.z.toFixed(8)
        ].join(",");

        if (vertexMap.has(key)) {
            return vertexMap.get(key);
        }

        const index = vertices.length;

        vertices.push(vector(point.x, point.y, point.z));
        vertexMap.set(key, index);

        return index;
    }

    for (const triangle of [...triangles, ...capTriangles]) {
        const face = triangle.map(getVertexIndex);

        if (new Set(face).size === 3) {
            faces.push(face);
        }
    }

    return { vertices, faces };
}

class GeometryEngine {
    split(mesh, inputPlane) {
        validateMesh(mesh);

        const plane = validatePlane(inputPlane);

        const positiveTriangles = [];
        const negativeTriangles = [];
        const intersections = [];

        let positiveCount = 0;
        let negativeCount = 0;

        for (const face of mesh.faces) {
            const triangle = face.map(index => {
                const point = mesh.vertices[index];

                return vector(point.x, point.y, point.z);
            });

            const distances = triangle.map(
                point => signedDistance(point, plane)
            );

            if (distances.every(d => d > EPSILON)) {
                positiveTriangles.push(triangle);
                positiveCount++;
                continue;
            }

            if (distances.every(d => d < -EPSILON)) {
                negativeTriangles.push(triangle);
                negativeCount++;
                continue;
            }

            const positivePolygon = clipTriangle(
                triangle,
                plane,
                true,
                intersections
            );

            const negativePolygon = clipTriangle(
                triangle,
                plane,
                false,
                intersections
            );

            positiveTriangles.push(
                ...triangulatePolygon(positivePolygon)
            );

            negativeTriangles.push(
                ...triangulatePolygon(negativePolygon)
            );
        }

        const uniqueIntersections = uniquePoints(intersections);

        if (positiveCount === 0 || negativeCount === 0) {
            return {
                success: false,
                reason: "切割平面沒有完整穿過原石。",
                positive: null,
                negative: null,
                cutSurface: []
            };
        }

        const positiveCap = createCapTriangles(
            uniqueIntersections,
            multiply(plane.normal, -1)
        );

        const negativeCap = createCapTriangles(
            uniqueIntersections,
            plane.normal
        );

        const positive = buildMesh(
            positiveTriangles,
            positiveCap
        );

        const negative = buildMesh(
            negativeTriangles,
            negativeCap
        );

        if (
            positive.faces.length === 0 ||
            negative.faces.length === 0
        ) {
            return {
                success: false,
                reason: "切割後產生無效幾何資料。",
                positive: null,
                negative: null,
                cutSurface: []
            };
        }

        return {
            success: true,
            positive,
            negative,
            cutSurface: uniqueIntersections,
            plane,
            statistics: {
                originalFaces: mesh.faces.length,
                positiveFaces: positive.faces.length,
                negativeFaces: negative.faces.length,
                cutVertices: uniqueIntersections.length
            }
        };
    }
}

export const geometryEngine = new GeometryEngine();


const EPSILON = 1e-8;

function vec(x = 0, y = 0, z = 0) {
    return { x, y, z };
}

function add(a, b) {
    return vec(a.x + b.x, a.y + b.y, a.z + b.z);
}

function sub(a, b) {
    return vec(a.x - b.x, a.y - b.y, a.z - b.z);
}

function mul(v, n) {
    return vec(v.x * n, v.y * n, v.z * n);
}

function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
    return vec(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x
    );
}

function magnitude(v) {
    return Math.sqrt(dot(v, v));
}

function normalize(v) {
    const length = magnitude(v);

    if (length < EPSILON) {
        throw new Error("無效的切割方向。");
    }

    return mul(v, 1 / length);
}

function interpolate(a, b, t) {
    return add(a, mul(sub(b, a), t));
}

function distanceToPlane(point, plane) {
    return dot(sub(point, plane.point), plane.normal);
}

function uniquePoints(points) {
    const result = [];

    for (const point of points) {
        if (!result.some(
            item => magnitude(sub(item, point)) < EPSILON
        )) {
            result.push(point);
        }
    }

    return result;
}

function clipPolygon(polygon, plane, positive, intersections) {
    const output = [];

    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];

        const da = distanceToPlane(a, plane);
        const db = distanceToPlane(b, plane);

        const insideA = positive ? da >= -EPSILON : da <= EPSILON;
        const insideB = positive ? db >= -EPSILON : db <= EPSILON;

        if (insideA && insideB) {
            output.push(b);
        } else if (insideA && !insideB) {
            const t = da / (da - db);
            const point = interpolate(a, b, t);

            output.push(point);
            intersections.push(point);
        } else if (!insideA && insideB) {
            const t = da / (da - db);
            const point = interpolate(a, b, t);

            output.push(point);
            output.push(b);
            intersections.push(point);
        }
    }

    return uniquePoints(output);
}

function triangulate(polygon) {
    const result = [];

    for (let i = 1; i < polygon.length - 1; i++) {
        result.push([
            polygon[0],
            polygon[i],
            polygon[i + 1]
        ]);
    }

    return result;
}

function sortOnPlane(points, normal) {
    if (points.length < 3) return points;

    const center = points.reduce(
        (sum, p) => add(sum, p),
        vec()
    );

    const centroid = mul(center, 1 / points.length);

    const reference = Math.abs(normal.x) < 0.9
        ? vec(1, 0, 0)
        : vec(0, 1, 0);

    const axisU = normalize(cross(normal, reference));
    const axisV = cross(normal, axisU);

    return [...points].sort((a, b) => {
        const da = sub(a, centroid);
        const db = sub(b, centroid);

        return Math.atan2(dot(da, axisV), dot(da, axisU))
            - Math.atan2(dot(db, axisV), dot(db, axisU));
    });
}

function buildMesh(triangles) {
    const vertices = [];
    const faces = [];
    const map = new Map();

    function indexOf(point) {
        const key = [
            point.x.toFixed(8),
            point.y.toFixed(8),
            point.z.toFixed(8)
        ].join(",");

        if (map.has(key)) return map.get(key);

        const index = vertices.length;
        vertices.push(vec(point.x, point.y, point.z));
        map.set(key, index);

        return index;
    }

    for (const triangle of triangles) {
        const face = triangle.map(indexOf);

        if (new Set(face).size === 3) {
            faces.push(face);
        }
    }

    return { vertices, faces };
}

function validateMesh(mesh) {
    if (!mesh || !Array.isArray(mesh.vertices) ||
        !Array.isArray(mesh.faces) || mesh.faces.length === 0) {
        throw new Error("原石模型資料不完整。");
    }

    for (const face of mesh.faces) {
        if (
            !Array.isArray(face) ||
            face.length !== 3 ||
            face.some(index =>
                !Number.isInteger(index) ||
                index < 0 ||
                index >= mesh.vertices.length
            )
        ) {
            throw new Error("原石模型包含無效三角面。");
        }
    }
}

class GeometryEngine {
    split(mesh, inputPlane) {
        validateMesh(mesh);

        const plane = {
            point: vec(
                inputPlane.point.x,
                inputPlane.point.y,
                inputPlane.point.z
            ),
            normal: normalize(vec(
                inputPlane.normal.x,
                inputPlane.normal.y,
                inputPlane.normal.z
            ))
        };

        const positive = [];
        const negative = [];
        const intersections = [];

        let hasPositive = false;
        let hasNegative = false;

        for (const face of mesh.faces) {
            const triangle = face.map(index => {
                const p = mesh.vertices[index];
                return vec(p.x, p.y, p.z);
            });

            const distances = triangle.map(
                p => distanceToPlane(p, plane)
            );

            if (distances.some(d => d > EPSILON)) {
                hasPositive = true;
            }

            if (distances.some(d => d < -EPSILON)) {
                hasNegative = true;
            }

            const p = clipPolygon(
                triangle, plane, true, intersections
            );

            const n = clipPolygon(
                triangle, plane, false, intersections
            );

            positive.push(...triangulate(p));
            negative.push(...triangulate(n));
        }

        if (!hasPositive || !hasNegative) {
            return {
                success: false,
                reason: "切割平面沒有穿過原石。"
            };
        }

        const section = uniquePoints(intersections);

        if (section.length < 3) {
            return {
                success: false,
                reason: "無法建立有效切割截面。"
            };
        }

        const positiveCap = triangulate(
            sortOnPlane(section, mul(plane.normal, -1))
        );

        const negativeCap = triangulate(
            sortOnPlane(section, plane.normal)
        );

        positive.push(...positiveCap);
        negative.push(...negativeCap);

        const positiveMesh = buildMesh(positive);
        const negativeMesh = buildMesh(negative);

        if (
            positiveMesh.faces.length === 0 ||
            negativeMesh.faces.length === 0
        ) {
            return {
                success: false,
                reason: "切割後模型無效。"
            };
        }

        return {
            success: true,
            positive: positiveMesh,
            negative: negativeMesh,
            cutSurface: section,
            plane
        };
    }
}

export const geometryEngine = new GeometryEngine();

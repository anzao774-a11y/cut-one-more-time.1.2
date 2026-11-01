
import { cuttingUI } from "./cutting-ui.js";


// ======================================================
// 基礎工具
// ======================================================

function normalize(vector) {
    const length = Math.hypot(
        vector[0],
        vector[1],
        vector[2]
    );

    if (!Number.isFinite(length) || length < 1e-10) {
        throw new Error("切割平面法線無效。");
    }

    return vector.map(value => value / length);
}


function getDistance(vertex, plane) {
    return (
        (vertex[0] - plane.point[0]) * plane.normal[0] +
        (vertex[1] - plane.point[1]) * plane.normal[1] +
        (vertex[2] - plane.point[2]) * plane.normal[2]
    );
}


function getSidePlane(result, side) {
    const source = result?.cutPlane;

    if (
        !source ||
        !Array.isArray(source.point) ||
        !Array.isArray(source.normal)
    ) {
        throw new Error("缺少有效的切割平面。");
    }

    const normal = normalize(source.normal);

    const thickness = Math.max(
        0,
        Number(result.bladeThickness) || 0
    );

    const direction = side === "positive" ? 1 : -1;

    return {
        point: source.point.map(
            (value, axis) =>
                value +
                normal[axis] *
                thickness *
                0.5 *
                direction
        ),

        // 統一使用保留區域朝向的法線。
        normal: side === "positive"
            ? normal
            : normal.map(value => -value),

        // 保留區域外側的方向。
        outwardNormal: side === "positive"
            ? normal.map(value => -value)
            : [...normal]
    };
}


// ======================================================
// 擷取切面三角形
// ======================================================

function extractCoplanarTriangles(mesh, plane) {
    if (
        !mesh ||
        !Array.isArray(mesh.vertices) ||
        !Array.isArray(mesh.faces)
    ) {
        return [];
    }

    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];

    for (const vertex of mesh.vertices) {
        for (let axis = 0; axis < 3; axis++) {
            min[axis] = Math.min(min[axis], vertex[axis]);
            max[axis] = Math.max(max[axis], vertex[axis]);
        }
    }

    const diagonal = Math.hypot(
        max[0] - min[0],
        max[1] - min[1],
        max[2] - min[2]
    );

    const tolerance = Math.max(
        1e-7,
        diagonal * 0.00002
    );

    const triangles = [];

    for (const face of mesh.faces) {
        if (
            !Array.isArray(face) ||
            face.length !== 3
        ) {
            continue;
        }

        const triangle = face.map(
            index => mesh.vertices[index]
        );

        if (
            triangle.some(vertex =>
                !vertex ||
                !vertex.every(Number.isFinite)
            )
        ) {
            continue;
        }

        const distances = triangle.map(
            vertex => getDistance(vertex, plane)
        );

        if (
            distances.every(distance =>
                Math.abs(distance) <= tolerance
            )
        ) {
            triangles.push(
                triangle.map(vertex => [...vertex])
            );
        }
    }

    return triangles;
}


// ======================================================
// 裁切以前保存的剖面
// ======================================================

function intersect(a, b, da, db) {
    const denominator = da - db;

    if (Math.abs(denominator) < 1e-12) {
        return [...a];
    }

    const t = da / denominator;

    return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t
    ];
}


function clipTriangle(triangle, plane) {
    const epsilon = 1e-8;

    const input = triangle.map(vertex => ({
        vertex: [...vertex],
        distance: getDistance(vertex, plane)
    }));

    const output = [];

    for (let i = 0; i < input.length; i++) {
        const current = input[i];

        const next = input[
            (i + 1) % input.length
        ];

        const currentInside =
            current.distance >= -epsilon;

        const nextInside =
            next.distance >= -epsilon;

        if (currentInside && nextInside) {
            output.push([...next.vertex]);

        } else if (currentInside && !nextInside) {
            output.push(
                intersect(
                    current.vertex,
                    next.vertex,
                    current.distance,
                    next.distance
                )
            );

        } else if (!currentInside && nextInside) {
            output.push(
                intersect(
                    current.vertex,
                    next.vertex,
                    current.distance,
                    next.distance
                )
            );

            output.push([...next.vertex]);
        }
    }

    if (output.length < 3) {
        return [];
    }

    const triangles = [];

    for (let i = 1; i < output.length - 1; i++) {
        triangles.push([
            [...output[0]],
            [...output[i]],
            [...output[i + 1]]
        ]);
    }

    return triangles;
}


function inheritHistory(history, plane) {
    if (!Array.isArray(history)) {
        return [];
    }

    const inherited = [];

    for (const entry of history) {
        if (
            !entry ||
            !Array.isArray(entry.triangles)
        ) {
            continue;
        }

        const triangles = [];

        for (const triangle of entry.triangles) {
            if (
                !Array.isArray(triangle) ||
                triangle.length !== 3
            ) {
                continue;
            }

            triangles.push(
                ...clipTriangle(triangle, plane)
            );
        }

        if (triangles.length === 0) {
            continue;
        }

        inherited.push({
            ...entry,

            outwardNormal: Array.isArray(entry.outwardNormal)
                ? [...entry.outwardNormal]
                : [...plane.outwardNormal],

            triangles
        });
    }

    return inherited;
}


// ======================================================
// 建立本次切割留下的剖面紀錄
// ======================================================

function createHistoryEntry(
    mesh,
    plane,
    kind,
    jadeType = null,
    id = null
) {
    const triangles = extractCoplanarTriangles(
        mesh,
        plane
    );

    if (triangles.length === 0) {
        return null;
    }

    return {
        id: id ?? (
            `${kind}-${Date.now()}-` +
            Math.random().toString(36).slice(2, 8)
        ),

        kind,

        jadeType,

        outwardNormal: [
            ...plane.outwardNormal
        ],

        triangles
    };
}


// ======================================================
// 玉肉剖面歷史
// ======================================================

function updateJadeHistory(
    jadeData,
    sourceStone,
    plane,
    cutId
) {
    if (
        !jadeData ||
        !Array.isArray(jadeData.masses)
    ) {
        return;
    }

    const sourceMasses =
        sourceStone?.jadeData?.masses ?? [];

    const sourceMap = new Map();

    for (const mass of sourceMasses) {
        if (mass.id != null) {
            sourceMap.set(mass.id, mass);
        }

        if (mass.sourceMassId != null) {
            sourceMap.set(mass.sourceMassId, mass);
        }
    }

    for (const mass of jadeData.masses) {
        if (!mass?.geometry) {
            continue;
        }

        const sourceMass =
            sourceMap.get(mass.sourceMassId) ??
            sourceMap.get(mass.id);

        const previousHistory =
            sourceMass?.cutHistory ??
            mass.cutHistory ??
            [];

        const history = inheritHistory(
            previousHistory,
            plane
        );

        const currentEntry = createHistoryEntry(
            mass.geometry,
            plane,
            "jade",
            mass.jadeType ?? null,
            `${cutId}-jade-${mass.id}`
        );

        if (currentEntry) {
            history.push(currentEntry);
        }

        mass.cutHistory = history;
        mass.cutHistoryVersion = 2;
    }
}


// ======================================================
// 保存石質剖面與玉肉剖面
// ======================================================

const originalCreateInventoryRecord =
    cuttingUI.createInventoryRecord;


cuttingUI.createInventoryRecord = function (
    mesh,
    side,
    result,
    sourceStone,
    jadeData
) {
    // 先完全交由原始方法建立背包紀錄。
    const record = originalCreateInventoryRecord.call(
        this,
        mesh,
        side,
        result,
        sourceStone,
        jadeData
    );

    const plane = getSidePlane(
        result,
        side
    );

    const cutId = (
        `cut-${result.createdAt ?? Date.now()}-${side}`
    );

    // 繼承之前的石質切面。
    const history = inheritHistory(
        sourceStone.cutHistory,
        plane
    );

    // 加入本次石質切面。
    const currentStoneEntry = createHistoryEntry(
        mesh,
        plane,
        "stone",
        null,
        `${cutId}-stone`
    );

    if (currentStoneEntry) {
        history.push(currentStoneEntry);
    }

    record.cutHistory = history;
    record.cutHistoryVersion = 2;

    // 玉肉使用原始 splitJadeData 已經產生的幾何。
    // 不重新定位、不重新縮放、不再次切割。
    updateJadeHistory(
        record.jadeData,
        sourceStone,
        plane,
        cutId
    );

    return record;
};


console.log(
    "[切割持久化] 已載入剖面歷史紀錄，原始玉料定位與切割流程保持不變。"
);


// js/systems/stone-geometry-generator.js

// =====================================
// 種子亂數
// =====================================

function createSeededRandom(seed) {
    let state = seed >>> 0;

    return function () {
        state += 0x6D2B79F5;

        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(
            value ^ (value >>> 7),
            value | 61
        );

        return (
            (value ^ (value >>> 14)) >>> 0
        ) / 4294967296;
    };
}

function createSeed() {
    if (globalThis.crypto?.getRandomValues) {
        const values = new Uint32Array(1);
        globalThis.crypto.getRandomValues(values);
        return values[0];
    }

    return Math.floor(Math.random() * 4294967296);
}

function randomBetween(random, min, max) {
    return min + random() * (max - min);
}


// =====================================
// 稀有度外觀設定
// =====================================

const STONE_SHAPES = {
    gypsy: {
        radius: [0.85, 1.0],
        irregularity: 0.22,
        detail: 1,
        elongation: [0.8, 1.2]
    },

    common: {
        radius: [0.95, 1.1],
        irregularity: 0.17,
        detail: 1,
        elongation: [0.8, 1.25]
    },

    rare: {
        radius: [1.0, 1.2],
        irregularity: 0.14,
        detail: 2,
        elongation: [0.75, 1.3]
    },

    epic: {
        radius: [1.1, 1.3],
        irregularity: 0.12,
        detail: 2,
        elongation: [0.75, 1.35]
    },

    legendary: {
        radius: [1.2, 1.45],
        irregularity: 0.1,
        detail: 3,
        elongation: [0.7, 1.4]
    }
};


// =====================================
// 基礎多面體
// =====================================

function createIcosahedron() {
    const t = (1 + Math.sqrt(5)) / 2;

    const vertices = [
        [-1, t, 0],
        [1, t, 0],
        [-1, -t, 0],
        [1, -t, 0],

        [0, -1, t],
        [0, 1, t],
        [0, -1, -t],
        [0, 1, -t],

        [t, 0, -1],
        [t, 0, 1],
        [-t, 0, -1],
        [-t, 0, 1]
    ];

    const faces = [
        [0, 11, 5],
        [0, 5, 1],
        [0, 1, 7],
        [0, 7, 10],
        [0, 10, 11],

        [1, 5, 9],
        [5, 11, 4],
        [11, 10, 2],
        [10, 7, 6],
        [7, 1, 8],

        [3, 9, 4],
        [3, 4, 2],
        [3, 2, 6],
        [3, 6, 8],
        [3, 8, 9],

        [4, 9, 5],
        [2, 4, 11],
        [6, 2, 10],
        [8, 6, 7],
        [9, 8, 1]
    ];

    return { vertices, faces };
}


// =====================================
// 向量工具
// =====================================

function normalize(vertex) {
    const length = Math.hypot(
        vertex[0],
        vertex[1],
        vertex[2]
    );

    if (length === 0) {
        throw new Error("無法正規化零向量");
    }

    return vertex.map(value => value / length);
}


// =====================================
// 網格細分
// =====================================

function subdivideMesh(mesh) {
    const vertices = mesh.vertices.map(
        vertex => [...vertex]
    );

    const faces = [];
    const midpointCache = new Map();

    function getMidpoint(a, b) {
        const key = [Math.min(a, b), Math.max(a, b)]
            .join("_");

        if (midpointCache.has(key)) {
            return midpointCache.get(key);
        }

        const va = vertices[a];
        const vb = vertices[b];

        const midpoint = normalize([
            (va[0] + vb[0]) / 2,
            (va[1] + vb[1]) / 2,
            (va[2] + vb[2]) / 2
        ]);

        const index = vertices.length;

        vertices.push(midpoint);
        midpointCache.set(key, index);

        return index;
    }

    for (const [a, b, c] of mesh.faces) {
        const ab = getMidpoint(a, b);
        const bc = getMidpoint(b, c);
        const ca = getMidpoint(c, a);

        faces.push(
            [a, ab, ca],
            [b, bc, ab],
            [c, ca, bc],
            [ab, bc, ca]
        );
    }

    return { vertices, faces };
}


// =====================================
// 三角面方向修正
// =====================================

function orientFacesOutward(mesh) {
    const center = [0, 0, 0];

    for (const vertex of mesh.vertices) {
        center[0] += vertex[0];
        center[1] += vertex[1];
        center[2] += vertex[2];
    }

    center[0] /= mesh.vertices.length;
    center[1] /= mesh.vertices.length;
    center[2] /= mesh.vertices.length;

    for (const face of mesh.faces) {
        const a = mesh.vertices[face[0]];
        const b = mesh.vertices[face[1]];
        const c = mesh.vertices[face[2]];

        const ab = [
            b[0] - a[0],
            b[1] - a[1],
            b[2] - a[2]
        ];

        const ac = [
            c[0] - a[0],
            c[1] - a[1],
            c[2] - a[2]
        ];

        const normal = [
            ab[1] * ac[2] - ab[2] * ac[1],
            ab[2] * ac[0] - ab[0] * ac[2],
            ab[0] * ac[1] - ab[1] * ac[0]
        ];

        const outward = [
            a[0] - center[0],
            a[1] - center[1],
            a[2] - center[2]
        ];

        const dot =
            normal[0] * outward[0] +
            normal[1] * outward[1] +
            normal[2] * outward[2];

        if (dot < 0) {
            face.reverse();
        }
    }

    return mesh;
}


// =====================================
// 原石表面變形
// =====================================

function deformMesh(mesh, config, random) {
    const radius = randomBetween(
        random,
        config.radius[0],
        config.radius[1]
    );

    const elongation = [
        randomBetween(random, ...config.elongation),
        randomBetween(random, ...config.elongation),
        randomBetween(random, ...config.elongation)
    ];

    const vertices = mesh.vertices.map(vertex => {
        const direction = normalize(vertex);

        const displacement = randomBetween(
            random,
            -config.irregularity,
            config.irregularity
        );

        const scale = radius * (1 + displacement);

        return [
            direction[0] * scale * elongation[0],
            direction[1] * scale * elongation[1],
            direction[2] * scale * elongation[2]
        ];
    });

    return {
        vertices,
        faces: mesh.faces.map(face => [...face])
    };
}


// =====================================
// 幾何檢查
// =====================================

function calculateVolume(mesh) {
    let volume = 0;

    for (const face of mesh.faces) {
        const a = mesh.vertices[face[0]];
        const b = mesh.vertices[face[1]];
        const c = mesh.vertices[face[2]];

        volume += (
            a[0] * (b[1] * c[2] - b[2] * c[1]) +
            a[1] * (b[2] * c[0] - b[0] * c[2]) +
            a[2] * (b[0] * c[1] - b[1] * c[0])
        ) / 6;
    }

    return Math.abs(volume);
}

function validateMesh(mesh) {
    if (
        !mesh ||
        !Array.isArray(mesh.vertices) ||
        !Array.isArray(mesh.faces)
    ) {
        throw new Error("原石幾何資料格式錯誤");
    }

    const edgeCounts = new Map();

    for (const vertex of mesh.vertices) {
        if (
            !Array.isArray(vertex) ||
            vertex.length !== 3 ||
            !vertex.every(Number.isFinite)
        ) {
            throw new Error("原石包含無效頂點");
        }
    }

    for (const face of mesh.faces) {
        if (
            !Array.isArray(face) ||
            face.length !== 3 ||
            !face.every(index =>
                Number.isInteger(index) &&
                index >= 0 &&
                index < mesh.vertices.length
            )
        ) {
            throw new Error("原石包含無效三角面");
        }

        const [a, b, c] = face;

        if (a === b || b === c || c === a) {
            throw new Error("原石包含退化三角面");
        }

        const va = mesh.vertices[a];
        const vb = mesh.vertices[b];
        const vc = mesh.vertices[c];

        const ab = [
            vb[0] - va[0],
            vb[1] - va[1],
            vb[2] - va[2]
        ];

        const ac = [
            vc[0] - va[0],
            vc[1] - va[1],
            vc[2] - va[2]
        ];

        const cross = [
            ab[1] * ac[2] - ab[2] * ac[1],
            ab[2] * ac[0] - ab[0] * ac[2],
            ab[0] * ac[1] - ab[1] * ac[0]
        ];

        if (Math.hypot(...cross) < 1e-10) {
            throw new Error("原石包含零面積三角面");
        }

        for (const [from, to] of [
            [a, b],
            [b, c],
            [c, a]
        ]) {
            const key = `${Math.min(from, to)}_${Math.max(from, to)}`;

            const entry = edgeCounts.get(key) ?? {
                count: 0,
                direction: 0
            };

            entry.count += 1;
            entry.direction += from < to ? 1 : -1;

            edgeCounts.set(key, entry);
        }
    }

    for (const edge of edgeCounts.values()) {
        if (
            edge.count !== 2 ||
            edge.direction !== 0
        ) {
            throw new Error("原石網格未封閉或面方向不一致");
        }
    }

    const volume = calculateVolume(mesh);

    if (!Number.isFinite(volume) || volume <= 1e-8) {
        throw new Error("原石體積無效");
    }

    return {
        valid: true,
        volume,
        vertexCount: mesh.vertices.length,
        faceCount: mesh.faces.length
    };
}


// =====================================
// 原石生成器
// =====================================

class StoneGeometryGenerator {
    generate(rarity, seed = createSeed()) {
        const config = STONE_SHAPES[rarity];

        if (!config) {
            throw new Error(
                `未知的原石稀有度：${rarity}`
            );
        }

        const random = createSeededRandom(seed);

        let mesh = createIcosahedron();

        for (let i = 0; i < config.detail; i++) {
            mesh = subdivideMesh(mesh);
        }

        mesh = deformMesh(mesh, config, random);
        mesh = orientFacesOutward(mesh);

        const validation = validateMesh(mesh);

        return {
            vertices: mesh.vertices,
            faces: mesh.faces,

            metadata: {
                generatorVersion: 1,
                shapeSeed: seed,
                rarity,
                volume: validation.volume,
                vertexCount: validation.vertexCount,
                faceCount: validation.faceCount
            }
        };
    }

    validate(mesh) {
        return validateMesh(mesh);
    }
}

export const stoneGeometryGenerator =
    new StoneGeometryGenerator();

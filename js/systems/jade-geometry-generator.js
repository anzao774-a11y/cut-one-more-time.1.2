
const JADE_SHAPES = {
    gypsy: { detail: 0, irregularity: 0.22, elongation: [0.82, 1.18] },
    common: { detail: 1, irregularity: 0.19, elongation: [0.78, 1.22] },
    rare: { detail: 1, irregularity: 0.14, elongation: [0.82, 1.18] },
    epic: { detail: 2, irregularity: 0.10, elongation: [0.88, 1.12] },
    legendary: { detail: 2, irregularity: 0.07, elongation: [0.92, 1.08] },
    special: { detail: 2, irregularity: 0.05, elongation: [0.95, 1.05] }
};

function createSeededRandom(seed) {
    let value = 0;

    for (let i = 0; i < String(seed).length; i++) {
        value = (value * 31 + String(seed).charCodeAt(i)) >>> 0;
    }

    return function random() {
        value += 0x6D2B79F5;

        let t = value;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function normalize(vector) {
    const length = Math.hypot(...vector) || 1;

    return vector.map(value => value / length);
}

function midpoint(a, b) {
    return normalize([
        (a[0] + b[0]) / 2,
        (a[1] + b[1]) / 2,
        (a[2] + b[2]) / 2
    ]);
}

function createIcosahedron() {
    const t = (1 + Math.sqrt(5)) / 2;

    const vertices = [
        [-1, t, 0], [1, t, 0],
        [-1, -t, 0], [1, -t, 0],
        [0, -1, t], [0, 1, t],
        [0, -1, -t], [0, 1, -t],
        [t, 0, -1], [t, 0, 1],
        [-t, 0, -1], [-t, 0, 1]
    ].map(normalize);

    const faces = [
        [0, 11, 5], [0, 5, 1], [0, 1, 7],
        [0, 7, 10], [0, 10, 11],
        [1, 5, 9], [5, 11, 4], [11, 10, 2],
        [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6],
        [3, 6, 8], [3, 8, 9],
        [4, 9, 5], [2, 4, 11], [6, 2, 10],
        [8, 6, 7], [9, 8, 1]
    ];

    return { vertices, faces };
}

function subdivide(mesh) {
    const vertices = mesh.vertices.map(vertex => [...vertex]);
    const faces = [];
    const midpointCache = new Map();

    function getMidpointIndex(a, b) {
        const key = `${Math.min(a, b)}_${Math.max(a, b)}`;

        if (midpointCache.has(key)) {
            return midpointCache.get(key);
        }

        const index = vertices.length;
        vertices.push(midpoint(mesh.vertices[a], mesh.vertices[b]));
        midpointCache.set(key, index);

        return index;
    }

    for (const [a, b, c] of mesh.faces) {
        const ab = getMidpointIndex(a, b);
        const bc = getMidpointIndex(b, c);
        const ca = getMidpointIndex(c, a);

        faces.push(
            [a, ab, ca],
            [b, bc, ab],
            [c, ca, bc],
            [ab, bc, ca]
        );
    }

    return { vertices, faces };
}

function orientFacesOutward(mesh) {
    const center = [0, 0, 0];

    for (const vertex of mesh.vertices) {
        center[0] += vertex[0] / mesh.vertices.length;
        center[1] += vertex[1] / mesh.vertices.length;
        center[2] += vertex[2] / mesh.vertices.length;
    }

    const faces = mesh.faces.map(face => {
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
            (a[0] + b[0] + c[0]) / 3 - center[0],
            (a[1] + b[1] + c[1]) / 3 - center[1],
            (a[2] + b[2] + c[2]) / 3 - center[2]
        ];

        const dot =
            normal[0] * outward[0] +
            normal[1] * outward[1] +
            normal[2] * outward[2];

        return dot < 0
            ? [face[0], face[2], face[1]]
            : [...face];
    });

    return { vertices: mesh.vertices, faces };
}

function deformMesh(mesh, config, random) {
    const elongation = [
        config.elongation[0] +
            random() * (config.elongation[1] - config.elongation[0]),
        config.elongation[0] +
            random() * (config.elongation[1] - config.elongation[0]),
        config.elongation[0] +
            random() * (config.elongation[1] - config.elongation[0])
    ];

    const vertices = mesh.vertices.map(vertex => {
        const direction = normalize(vertex);
        const displacement =
            (random() * 2 - 1) * config.irregularity;

        const scale = 1 + displacement;

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
        !Array.isArray(mesh.faces) ||
        mesh.vertices.length < 4 ||
        mesh.faces.length < 4
    ) {
        throw new Error("玉石幾何資料不完整");
    }

    const edges = new Map();

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
            throw new Error("玉石包含無效三角面");
        }

        const [a, b, c] = face;

        for (const [from, to] of [
            [a, b], [b, c], [c, a]
        ]) {
            const key = `${Math.min(from, to)}_${Math.max(from, to)}`;

            const entry = edges.get(key) ?? {
                count: 0,
                direction: 0
            };

            entry.count += 1;
            entry.direction += from < to ? 1 : -1;

            edges.set(key, entry);
        }
    }

    for (const edge of edges.values()) {
        if (edge.count !== 2 || edge.direction !== 0) {
            throw new Error("玉石網格未封閉或面方向不一致");
        }
    }

    const volume = calculateVolume(mesh);

    if (!Number.isFinite(volume) || volume <= 1e-8) {
        throw new Error("玉石體積無效");
    }

    return {
        valid: true,
        volume,
        vertexCount: mesh.vertices.length,
        faceCount: mesh.faces.length
    };
}

class JadeGeometryGenerator {
    generate(jadeType, rarity, seed) {
        const config = JADE_SHAPES[rarity] ?? JADE_SHAPES.common;
        const random = createSeededRandom(seed);

        let mesh = createIcosahedron();

        for (let i = 0; i < config.detail; i++) {
            mesh = subdivide(mesh);
        }

        mesh = deformMesh(mesh, config, random);
        mesh = orientFacesOutward(mesh);

        const validation = validateMesh(mesh);

        return {
            vertices: mesh.vertices,
            faces: mesh.faces,
            metadata: {
                generatorVersion: 1,
                jadeType,
                rarity,
                seed: String(seed),
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

export const jadeGeometryGenerator =
    new JadeGeometryGenerator();

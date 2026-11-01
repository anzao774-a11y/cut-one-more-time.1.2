import { meshGeometryUtils } from "./mesh-geometry-utils.js";

class JadeProductGeometry {
    constructor() {
        this.defaultSegments = 48;
        this.defaultRings = 12;
    }

    createId(prefix = "mesh") {
        return `${prefix}-${Date.now()}-${Math.random()
            .toString(16)
            .slice(2)}`;
    }

    validateSource(sourceMesh) {
        if (!sourceMesh) return null;

        try {
            meshGeometryUtils.validate(sourceMesh);
            return sourceMesh;
        } catch (error) {
            console.warn("來源玉料幾何無效：", error);
            return null;
        }
    }

    getSourceSize(sourceMesh) {
        const source = this.validateSource(sourceMesh);

        if (!source) {
            return [1, 1, 1];
        }

        const bounds = meshGeometryUtils.getBounds(source);

        return bounds.size.map(value =>
            Math.max(value, 0.01)
        );
    }

    createMesh(vertices, faces, metadata = {}) {
        const mesh = {
            vertices,
            faces,
            metadata: {
                generatedBy: "jade-product-geometry",
                createdAt: new Date().toISOString(),
                ...metadata
            }
        };

        meshGeometryUtils.validate(mesh);

        return mesh;
    }

    // =====================================
    // 橢圓形玉石
    // =====================================

    createEllipsoid(options = {}) {
        const radiusX = options.radiusX ?? 0.5;
        const radiusY = options.radiusY ?? 0.65;
        const radiusZ = options.radiusZ ?? 0.3;

        const segments = Math.max(
            8,
            Math.floor(options.segments ?? 32)
        );

        const rings = Math.max(
            4,
            Math.floor(options.rings ?? 16)
        );

        const vertices = [];
        const faces = [];

        for (let ring = 0; ring <= rings; ring++) {
            const phi = Math.PI * ring / rings;

            for (let segment = 0; segment <= segments; segment++) {
                const theta =
                    Math.PI * 2 * segment / segments;

                const x =
                    radiusX *
                    Math.sin(phi) *
                    Math.cos(theta);

                const y =
                    radiusY *
                    Math.cos(phi);

                const z =
                    radiusZ *
                    Math.sin(phi) *
                    Math.sin(theta);

                vertices.push([x, y, z]);
            }
        }

        for (let ring = 0; ring < rings; ring++) {
            for (let segment = 0; segment < segments; segment++) {
                const a = ring * (segments + 1) + segment;
                const b = a + 1;
                const c = a + segments + 1;
                const d = c + 1;

                faces.push([a, c, b]);
                faces.push([b, c, d]);
            }
        }

        return this.createMesh(
            vertices,
            faces,
            {
                shape: "ellipsoid"
            }
        );
    }

    // =====================================
    // 玉石吊墜
    // =====================================

    createPendant(sourceMesh) {
        const size = this.getSourceSize(sourceMesh);

        const scale = Math.min(
            size[0],
            size[1],
            size[2]
        );

        const mesh = this.createEllipsoid({
            radiusX: scale * 0.42,
            radiusY: scale * 0.58,
            radiusZ: scale * 0.22,
            segments: 40,
            rings: 20
        });

        mesh.metadata.shape = "pendant";
        mesh.metadata.sourceSize = size;

        return mesh;
    }

    // =====================================
    // 圓環幾何
    // =====================================

    createTorus(options = {}) {
        const majorRadius = options.majorRadius ?? 0.5;
        const tubeRadius = options.tubeRadius ?? 0.12;

        const radialSegments = Math.max(
            12,
            Math.floor(options.radialSegments ?? 64)
        );

        const tubularSegments = Math.max(
            8,
            Math.floor(options.tubularSegments ?? 20)
        );

        const vertices = [];
        const faces = [];

        for (let i = 0; i <= radialSegments; i++) {
            const u = Math.PI * 2 * i / radialSegments;

            for (let j = 0; j <= tubularSegments; j++) {
                const v = Math.PI * 2 * j / tubularSegments;

                const ringRadius =
                    majorRadius +
                    tubeRadius * Math.cos(v);

                const x = ringRadius * Math.cos(u);
                const y = tubeRadius * Math.sin(v);
                const z = ringRadius * Math.sin(u);

                vertices.push([x, y, z]);
            }
        }

        for (let i = 0; i < radialSegments; i++) {
            for (let j = 0; j < tubularSegments; j++) {
                const a =
                    i * (tubularSegments + 1) + j;

                const b = a + tubularSegments + 1;
                const c = a + 1;
                const d = b + 1;

                faces.push([a, b, c]);
                faces.push([c, b, d]);
            }
        }

        return this.createMesh(
            vertices,
            faces,
            {
                shape: "torus",
                majorRadius,
                tubeRadius
            }
        );
    }

    // =====================================
    // 玉石戒指
    // =====================================

    createRing(sourceMesh) {
        const size = this.getSourceSize(sourceMesh);

        const base = Math.min(
            size[0],
            size[1],
            size[2]
        );

        const majorRadius = base * 0.34;
        const tubeRadius = base * 0.09;

        const mesh = this.createTorus({
            majorRadius,
            tubeRadius,
            radialSegments: 72,
            tubularSegments: 20
        });

        mesh.metadata.shape = "ring";
        mesh.metadata.innerRadius =
            majorRadius - tubeRadius;

        mesh.metadata.outerRadius =
            majorRadius + tubeRadius;

        mesh.metadata.sourceSize = size;

        return mesh;
    }

    // =====================================
    // 玉石耳環
    // =====================================

    createEarrings(sourceMesh) {
        const size = this.getSourceSize(sourceMesh);

        const base = Math.min(
            size[0],
            size[1],
            size[2]
        );

        const mesh = this.createTorus({
            majorRadius: base * 0.22,
            tubeRadius: base * 0.07,
            radialSegments: 48,
            tubularSegments: 16
        });

        mesh.metadata.shape = "earrings";
        mesh.metadata.sourceSize = size;

        return mesh;
    }

    // =====================================
    // 玉石手鐲
    // =====================================

    createBracelet(sourceMesh) {
        const size = this.getSourceSize(sourceMesh);

        const base = Math.min(
            size[0],
            size[1],
            size[2]
        );

        const majorRadius = base * 0.42;
        const tubeRadius = base * 0.075;

        const mesh = this.createTorus({
            majorRadius,
            tubeRadius,
            radialSegments: 96,
            tubularSegments: 24
        });

        mesh.metadata.shape = "bracelet";

        mesh.metadata.innerRadius =
            majorRadius - tubeRadius;

        mesh.metadata.outerRadius =
            majorRadius + tubeRadius;

        mesh.metadata.sourceSize = size;

        return mesh;
    }

    // =====================================
    // 加工入口
    // =====================================

    createProduct(type, sourceMesh) {
        const source = this.validateSource(sourceMesh);

        if (!source) {
            return {
                success: false,
                message: "來源玉石沒有有效的幾何資料。"
            };
        }

        let geometry;

        switch (type) {
            case "pendant":
                geometry = this.createPendant(source);
                break;

            case "ring":
                geometry = this.createRing(source);
                break;

            case "earrings":
                geometry = this.createEarrings(source);
                break;

            case "bracelet":
                geometry = this.createBracelet(source);
                break;

            default:
                return {
                    success: false,
                    message: "找不到對應的加工模型。"
                };
        }

        return {
            success: true,
            geometry,
            productGeometryId: this.createId(type)
        };
    }
}

export const jadeProductGeometry =
    new JadeProductGeometry();


import * as THREE from "three";

/**
 * 專案 Mesh 資料與 Three.js 之間的轉換工具。
 *
 * Mesh 格式：
 * {
 *   vertices: [[x, y, z], ...],
 *   faces: [[a, b, c], ...]
 * }
 */

const JADE_COLORS = {
    agate: 0xb96b58,
    jasper: 0x9c5948,
    quartz: 0xe8e3d8,
    commercial_nephrite: 0x8caa85,
    amethyst: 0x9275b8,
    citrine: 0xd9ae43,
    garnet: 0x922d42,
    lapis_lazuli: 0x315caa,
    turquoise: 0x45aaa0,
    aquamarine: 0x83c9c5,
    peridot: 0x91ae4b,
    spinel: 0xa94d75,
    tourmaline: 0x547d65,
    jadeite: 0x75a982,
    moonstone: 0xc8d5dc,
    emerald: 0x16845a,
    ruby: 0xc42e42,
    sapphire: 0x3156a4,
    precious_opal: 0xb9c6d0,
    imperial_green_jadeite: 0x087c45,
    alexandrite: 0x526b9e,
    black_opal: 0x343c50,
    pigeon_blood_ruby: 0x8e142d,
    jade_37: 0xd5bd75
};

class MeshThreeAdapter {
    constructor() {
        this.defaultStoneColor = 0xaaa18d;
        this.defaultJadeColor = 0x72a98a;
    }

    validateMesh(mesh) {
        if (
            !mesh ||
            !Array.isArray(mesh.vertices) ||
            !Array.isArray(mesh.faces)
        ) {
            throw new Error("模型資料格式錯誤");
        }

        if (
            mesh.vertices.length < 4 ||
            mesh.faces.length < 4
        ) {
            throw new Error("模型資料不足");
        }

        for (const vertex of mesh.vertices) {
            if (
                !Array.isArray(vertex) ||
                vertex.length !== 3 ||
                !vertex.every(Number.isFinite)
            ) {
                throw new Error("模型頂點資料無效");
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
                throw new Error("模型面資料無效");
            }
        }

        return true;
    }

    createGeometry(meshData) {
        this.validateMesh(meshData);

        const positions = [];

        for (const vertex of meshData.vertices) {
            positions.push(
                vertex[0],
                vertex[1],
                vertex[2]
            );
        }

        const indices = [];

        for (const face of meshData.faces) {
            indices.push(
                face[0],
                face[1],
                face[2]
            );
        }

        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(
                positions,
                3
            )
        );

        geometry.setIndex(indices);

        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        return geometry;
    }

    createStoneMaterial(options = {}) {
        return new THREE.MeshStandardMaterial({
            color: options.color ?? this.defaultStoneColor,
            roughness: options.roughness ?? 0.48,
            metalness: options.metalness ?? 0.08,
            flatShading: options.flatShading ?? true,
            side: THREE.DoubleSide
        });
    }

    createJadeMaterial(jadeType, options = {}) {
        const color =
            JADE_COLORS[jadeType] ??
            this.defaultJadeColor;

        return new THREE.MeshStandardMaterial({
            color,
            roughness: options.roughness ?? 0.2,
            metalness: options.metalness ?? 0.03,
            transparent: options.transparent ?? false,
            opacity: options.opacity ?? 1,
            side: THREE.DoubleSide,
            flatShading: options.flatShading ?? false
        });
    }

    createMesh(meshData, material, options = {}) {
        const geometry = this.createGeometry(meshData);

        const mesh = new THREE.Mesh(
            geometry,
            material
        );

        mesh.castShadow = options.castShadow ?? true;
        mesh.receiveShadow = options.receiveShadow ?? true;

        if (options.position) {
            mesh.position.set(
                options.position[0] ?? 0,
                options.position[1] ?? 0,
                options.position[2] ?? 0
            );
        }

        if (options.rotation) {
            mesh.rotation.set(
                options.rotation.x ?? 0,
                options.rotation.y ?? 0,
                options.rotation.z ?? 0
            );
        }

        if (options.scale !== undefined) {
            const scale = options.scale;

            if (typeof scale === "number") {
                mesh.scale.setScalar(scale);
            } else {
                mesh.scale.set(
                    scale.x ?? 1,
                    scale.y ?? 1,
                    scale.z ?? 1
                );
            }
        }

        return mesh;
    }

    createStoneMesh(meshData, options = {}) {
        const material = this.createStoneMaterial(options);

        return this.createMesh(
            meshData,
            material,
            options
        );
    }

    createJadeMesh(mass, options = {}) {
        if (!mass || !mass.geometry) {
            throw new Error("玉料缺少幾何資料");
        }

        const material = this.createJadeMaterial(
            mass.jadeType,
            options
        );

        const mesh = this.createMesh(
            mass.geometry,
            material,
            options
        );

        mesh.name = mass.name ?? "內部玉料";

        mesh.userData = {
            jadeId: mass.id ?? null,
            jadeType: mass.jadeType ?? null,
            rarity: mass.rarity ?? null,
            volumePercent: mass.volumePercent ?? null
        };

        return mesh;
    }

    createGroup() {
        return new THREE.Group();
    }

    addStoneToGroup(group, meshData, options = {}) {
        if (!group?.isObject3D) {
            throw new Error("場景群組無效");
        }

        const stoneMesh = this.createStoneMesh(
            meshData,
            options
        );

        stoneMesh.name = options.name ?? "原石";

        group.add(stoneMesh);

        return stoneMesh;
    }

    addJadeToGroup(group, masses, options = {}) {
        if (!group?.isObject3D) {
            throw new Error("場景群組無效");
        }

        if (!Array.isArray(masses)) {
            throw new Error("玉料清單格式錯誤");
        }

        const createdMeshes = [];

        try {
            for (const mass of masses) {
                const jadeMesh = this.createJadeMesh(
                    mass,
                    options
                );

                group.add(jadeMesh);
                createdMeshes.push(jadeMesh);
            }

            return createdMeshes;

        } catch (error) {
            for (const mesh of createdMeshes) {
                group.remove(mesh);
                mesh.geometry.dispose();
                mesh.material.dispose();
            }

            throw error;
        }
    }

    disposeGroup(group) {
        if (!group?.isObject3D) return;

        group.traverse(object => {
            if (object.geometry) {
                object.geometry.dispose();
            }

            if (object.material) {
                const materials = Array.isArray(object.material)
                    ? object.material
                    : [object.material];

                for (const material of materials) {
                    material.dispose();
                }
            }
        });

        group.clear();
    }
}

export const meshThreeAdapter = new MeshThreeAdapter();

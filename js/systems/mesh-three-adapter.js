
import * as THREE from "three";

/**
 * Mesh 與 Three.js 轉換工具。
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
        if (!mesh || !Array.isArray(mesh.vertices) ||
            !Array.isArray(mesh.faces)) {
            throw new Error("模型資料格式錯誤");
        }

        if (mesh.vertices.length < 4 || mesh.faces.length < 4) {
            throw new Error("模型資料不足");
        }

        for (const v of mesh.vertices) {
            if (!Array.isArray(v) || v.length !== 3 ||
                !v.every(Number.isFinite)) {
                throw new Error("模型頂點無效");
            }
        }

        for (const f of mesh.faces) {
            if (!Array.isArray(f) || f.length !== 3 ||
                !f.every(i => Number.isInteger(i) &&
                    i >= 0 && i < mesh.vertices.length)) {
                throw new Error("模型面資料無效");
            }
        }

        return true;
    }

    createGeometry(meshData) {
        this.validateMesh(meshData);

        const positions = meshData.vertices.flat();
        const indices = meshData.faces.flat();

        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(positions, 3)
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
        return new THREE.MeshStandardMaterial({
            color: options.color ??
                JADE_COLORS[jadeType] ??
                this.defaultJadeColor,
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

        const mesh = new THREE.Mesh(geometry, material);

        mesh.castShadow = options.castShadow ?? true;
        mesh.receiveShadow = options.receiveShadow ?? true;

        if (options.position) {
            mesh.position.set(...options.position);
        }

        if (options.rotation) {
            mesh.rotation.set(
                options.rotation.x ?? 0,
                options.rotation.y ?? 0,
                options.rotation.z ?? 0
            );
        }

        if (options.scale !== undefined) {
            if (typeof options.scale === "number") {
                mesh.scale.setScalar(options.scale);
            } else if (Array.isArray(options.scale)) {
                mesh.scale.set(...options.scale);
            } else {
                mesh.scale.set(
                    options.scale.x ?? 1,
                    options.scale.y ?? 1,
                    options.scale.z ?? 1
                );
            }
        }

        return mesh;
    }

    createStoneMesh(meshData, options = {}) {
        return this.createMesh(
            meshData,
            this.createStoneMaterial(options),
            options
        );
    }

    createJadeMesh(mass, options = {}) {
        if (!mass?.geometry) {
            throw new Error("玉料缺少幾何資料");
        }

        const mesh = this.createMesh(
            mass.geometry,
            this.createJadeMaterial(mass.jadeType, options),
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

        const mesh = this.createStoneMesh(meshData, options);
        mesh.name = options.name ?? "原石";
        group.add(mesh);

        return mesh;
    }

    addJadeToGroup(group, masses, options = {}) {
        if (!group?.isObject3D || !Array.isArray(masses)) {
            throw new Error("玉料群組或清單無效");
        }

        const created = [];

        try {
            for (const mass of masses) {
                const mesh = this.createJadeMesh(mass, options);
                group.add(mesh);
                created.push(mesh);
            }

            return created;
        } catch (error) {
            for (const mesh of created) {
                group.remove(mesh);
                mesh.geometry.dispose();
                mesh.material.dispose();
            }

            throw error;
        }
    }

    disposeGroup(group) {
        if (!group?.isObject3D) return;

        const geometries = new Set();
        const materials = new Set();

        group.traverse(object => {
            if (object.geometry) geometries.add(object.geometry);

            if (object.material) {
                const list = Array.isArray(object.material)
                    ? object.material
                    : [object.material];

                list.forEach(material => materials.add(material));
            }
        });

        geometries.forEach(item => item.dispose());
        materials.forEach(item => item.dispose());

        group.clear();
    }
}

export const meshThreeAdapter = new MeshThreeAdapter();

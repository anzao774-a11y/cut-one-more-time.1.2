import * as THREE from "three";

/**
 * Mesh 與 Three.js 轉換工具
 *
 * 負責：
 * 1. 驗證幾何資料
 * 2. 建立 BufferGeometry
 * 3. 建立原石與玉料材質
 * 4. 建立 Three.js Mesh
 * 5. 管理轉換過程中的錯誤清理
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

    /**
     * 驗證幾何資料
     */
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
                throw new Error("模型頂點無效");
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

            if (
                face[0] === face[1] ||
                face[1] === face[2] ||
                face[0] === face[2]
            ) {
                throw new Error("模型面包含重複頂點");
            }
        }

        return true;
    }

    /**
     * 建立 BufferGeometry
     */
    createGeometry(meshData) {
        this.validateMesh(meshData);

        const positions = meshData.vertices.flat();
        const indices = meshData.faces.flat();

        const geometry = new THREE.BufferGeometry();

        try {
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

            if (
                !geometry.boundingBox ||
                !geometry.boundingSphere
            ) {
                throw new Error("無法計算模型邊界");
            }

            return geometry;

        } catch (error) {
            geometry.dispose();
            throw error;
        }
    }

    /**
     * 建立原石材質
     */
    createStoneMaterial(options = {}) {
        return new THREE.MeshStandardMaterial({
            color:
                options.color ??
                this.defaultStoneColor,

            roughness:
                options.roughness ?? 0.48,

            metalness:
                options.metalness ?? 0.08,

            flatShading:
                options.flatShading ?? true,

            side: THREE.DoubleSide
        });
    }

    /**
     * 建立玉料材質
     */
    createJadeMaterial(jadeType, options = {}) {
        const opacity = options.opacity ?? 1;

        if (
            !Number.isFinite(opacity) ||
            opacity < 0 ||
            opacity > 1
        ) {
            throw new Error("玉料透明度設定無效");
        }

        return new THREE.MeshStandardMaterial({
            color:
                options.color ??
                JADE_COLORS[jadeType] ??
                this.defaultJadeColor,

            roughness:
                options.roughness ?? 0.2,

            metalness:
                options.metalness ?? 0.03,

            transparent:
                options.transparent ?? false,

            opacity,

            side: THREE.DoubleSide,

            flatShading:
                options.flatShading ?? false
        });
    }

    /**
     * 驗證三維向量
     */
    validateVector(value, name) {
        if (
            !Array.isArray(value) ||
            value.length !== 3 ||
            !value.every(Number.isFinite)
        ) {
            throw new Error(`${name}設定無效`);
        }

        return true;
    }

    /**
     * 驗證縮放設定
     */
    validateScale(scale) {
        if (typeof scale === "number") {
            if (
                !Number.isFinite(scale) ||
                scale <= 0
            ) {
                throw new Error("模型縮放比例無效");
            }

            return true;
        }

        if (Array.isArray(scale)) {
            this.validateVector(scale, "模型縮放");

            if (scale.some(value => value <= 0)) {
                throw new Error("模型縮放比例必須大於零");
            }

            return true;
        }

        if (scale && typeof scale === "object") {
            const values = [
                scale.x ?? 1,
                scale.y ?? 1,
                scale.z ?? 1
            ];

            this.validateVector(values, "模型縮放");

            if (values.some(value => value <= 0)) {
                throw new Error("模型縮放比例必須大於零");
            }

            return true;
        }

        throw new Error("模型縮放設定無效");
    }

    /**
     * 建立 Mesh
     *
     * 幾何與材質由本次建立流程管理。
     * 發生錯誤時會釋放已建立資源。
     */
    createMesh(meshData, material, options = {}) {
        if (!material?.isMaterial) {
            throw new Error("模型材質無效");
        }

        let geometry = null;

        try {
            geometry = this.createGeometry(meshData);

            const mesh = new THREE.Mesh(
                geometry,
                material
            );

            mesh.castShadow =
                options.castShadow ?? true;

            mesh.receiveShadow =
                options.receiveShadow ?? true;

            if (options.position !== undefined) {
                this.validateVector(
                    options.position,
                    "模型位置"
                );

                mesh.position.set(
                    ...options.position
                );
            }

            if (options.rotation !== undefined) {
                const rotation = options.rotation;

                if (Array.isArray(rotation)) {
                    this.validateVector(
                        rotation,
                        "模型旋轉"
                    );

                    mesh.rotation.set(
                        rotation[0],
                        rotation[1],
                        rotation[2]
                    );

                } else if (
                    rotation &&
                    typeof rotation === "object"
                ) {
                    const values = [
                        rotation.x ?? 0,
                        rotation.y ?? 0,
                        rotation.z ?? 0
                    ];

                    this.validateVector(
                        values,
                        "模型旋轉"
                    );

                    mesh.rotation.set(
                        values[0],
                        values[1],
                        values[2]
                    );

                } else {
                    throw new Error("模型旋轉設定無效");
                }
            }

            if (options.scale !== undefined) {
                this.validateScale(options.scale);

                if (typeof options.scale === "number") {
                    mesh.scale.setScalar(options.scale);

                } else if (Array.isArray(options.scale)) {
                    mesh.scale.set(
                        ...options.scale
                    );

                } else {
                    mesh.scale.set(
                        options.scale.x ?? 1,
                        options.scale.y ?? 1,
                        options.scale.z ?? 1
                    );
                }
            }

            mesh.updateMatrix();
            mesh.updateMatrixWorld(true);

            return mesh;

        } catch (error) {
            geometry?.dispose();
            material.dispose();

            throw error;
        }
    }

    /**
     * 建立原石 Mesh
     */
    createStoneMesh(meshData, options = {}) {
        const material =
            this.createStoneMaterial(options);

        return this.createMesh(
            meshData,
            material,
            options
        );
    }

    /**
     * 建立玉料 Mesh
     */
    createJadeMesh(mass, options = {}) {
        if (!mass?.geometry) {
            throw new Error("玉料缺少幾何資料");
        }

        const material =
            this.createJadeMaterial(
                mass.jadeType,
                options
            );

        const mesh = this.createMesh(
            mass.geometry,
            material,
            options
        );

        mesh.name =
            mass.name ?? "內部玉料";

        mesh.userData = {
            jadeId: mass.id ?? null,
            jadeType: mass.jadeType ?? null,
            rarity: mass.rarity ?? null,
            volumePercent: mass.volumePercent ?? null
        };

        return mesh;
    }

    /**
     * 建立群組
     */
    createGroup() {
        return new THREE.Group();
    }

    /**
     * 將原石加入群組
     */
    addStoneToGroup(group, meshData, options = {}) {
        if (!group?.isObject3D) {
            throw new Error("場景群組無效");
        }

        const mesh = this.createStoneMesh(
            meshData,
            options
        );

        try {
            mesh.name =
                options.name ?? "原石";

            group.add(mesh);

            return mesh;

        } catch (error) {
            mesh.geometry?.dispose();
            mesh.material?.dispose();

            throw error;
        }
    }

    /**
     * 將多個玉料加入群組
     */
    addJadeToGroup(group, masses, options = {}) {
        if (
            !group?.isObject3D ||
            !Array.isArray(masses)
        ) {
            throw new Error("玉料群組或清單無效");
        }

        const created = [];

        try {
            for (const mass of masses) {
                const mesh = this.createJadeMesh(
                    mass,
                    options
                );

                group.add(mesh);
                created.push(mesh);
            }

            return created;

        } catch (error) {
            for (const mesh of created) {
                group.remove(mesh);

                mesh.geometry?.dispose();
                mesh.material?.dispose();
            }

            throw error;
        }
    }

    /**
     * 釋放群組資源
     */
    disposeGroup(group) {
        if (!group?.isObject3D) {
            return;
        }

        const geometries = new Set();
        const materials = new Set();

        group.traverse(object => {
            if (object.geometry?.dispose) {
                geometries.add(object.geometry);
            }

            if (!object.material) {
                return;
            }

            const materialList =
                Array.isArray(object.material)
                    ? object.material
                    : [object.material];

            for (const material of materialList) {
                if (material?.dispose) {
                    materials.add(material);
                }
            }
        });

        for (const geometry of geometries) {
            geometry.dispose();
        }

        for (const material of materials) {
            material.dispose();
        }

        group.clear();
    }
}

export const meshThreeAdapter =
    new MeshThreeAdapter();

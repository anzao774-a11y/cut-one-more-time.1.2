import * as THREE from "three";
import { meshGeometryUtils } from "./mesh-geometry-utils.js";
import { meshThreeAdapter } from "./mesh-three-adapter.js";

/**
 * 3D 模型預覽管理器
 *
 * 負責：
 * 1. 建立原石與內部模型的預覽場景
 * 2. 管理內部模型的位置、旋轉與縮放
 * 3. 控制原石及內部模型的顯示狀態
 * 4. 管理預覽物件的資源釋放
 *
 * 不負責：
 * - 抽取與機率
 * - 獎勵與道具
 * - 背包資料存取
 */
class MeshPreviewManager {
    constructor() {
        this.previews = new Map();
    }

    /**
     * 建立一組預覽模型
     */
    createPreview(
        id,
        stoneMesh,
        includedMeshes = [],
        options = {}
    ) {
        if (!id) {
            throw new Error("預覽模型必須具有識別碼");
        }

        if (!this.validateMesh(stoneMesh)) {
            throw new Error("原石幾何資料無效");
        }

        if (!Array.isArray(includedMeshes)) {
            throw new Error("內部模型資料必須是陣列");
        }

        const bounds = meshGeometryUtils.getBounds(stoneMesh);

        if (
            !bounds?.center ||
            ![
                bounds.center.x,
                bounds.center.y,
                bounds.center.z
            ].every(Number.isFinite)
        ) {
            throw new Error("無法取得原石中心位置");
        }

        const center = bounds.center;

        const root = new THREE.Group();
        root.name = `preview-root-${id}`;

        const stoneGroup = new THREE.Group();
        stoneGroup.name = "stone-group";

        const includedGroup = new THREE.Group();
        includedGroup.name = "included-group";

        root.add(stoneGroup);
        root.add(includedGroup);

        const preview = {
            id,
            root,
            stoneGroup,
            includedGroup,

            center: new THREE.Vector3(
                center.x,
                center.y,
                center.z
            ),

            stoneObject: null,
            includedObjects: [],
            options: { ...options }
        };

        try {
            // 建立原石
            const stoneObject =
                meshThreeAdapter.createStoneMesh(
                    stoneMesh,
                    options.stoneOptions || {}
                );

            if (!stoneObject?.isObject3D) {
                throw new Error("原石模型建立失敗");
            }

            stoneGroup.add(stoneObject);
            preview.stoneObject = stoneObject;

            // 建立內部模型
            for (
                let index = 0;
                index < includedMeshes.length;
                index++
            ) {
                const item = includedMeshes[index];

                if (
                    !item ||
                    !this.validateMesh(item.geometry)
                ) {
                    console.warn(
                        `略過無效的內部模型，索引：${index}`
                    );

                    continue;
                }

                const jadeObject =
                    meshThreeAdapter.createJadeMesh(
                        item,
                        options.jadeOptions || {}
                    );

                if (!jadeObject?.isObject3D) {
                    console.warn(
                        `內部模型建立失敗，索引：${index}`
                    );

                    continue;
                }

                /*
                 * 先加入群組，再套用位置。
                 *
                 * 即使套用設定時出錯，
                 * 清理程序也能找到並釋放模型資源。
                 */
                includedGroup.add(jadeObject);

                jadeObject.name =
                    item.name || `included-${index}`;

                preview.includedObjects.push(jadeObject);

                this.applyPlacement(
                    jadeObject,
                    item.placement || {}
                );
            }

            // 將原石中心移至世界座標原點
            root.position.set(
                -center.x,
                -center.y,
                -center.z
            );

            root.updateMatrixWorld(true);

            /*
             * 新預覽完整建立成功後才替換舊預覽。
             * 如果建立失敗，舊預覽仍然保留。
             */
            this.disposePreview(id);

            this.previews.set(id, preview);

            return preview;

        } catch (error) {
            this.disposePreviewObject(preview);
            throw error;
        }
    }

    /**
     * 驗證基本幾何資料
     */
    validateMesh(mesh) {
        if (!mesh || typeof mesh !== "object") {
            return false;
        }

        if (
            !Array.isArray(mesh.vertices) ||
            !Array.isArray(mesh.faces)
        ) {
            return false;
        }

        if (
            mesh.vertices.length < 4 ||
            mesh.faces.length < 4
        ) {
            return false;
        }

        // 驗證頂點
        for (const vertex of mesh.vertices) {
            if (
                !Array.isArray(vertex) ||
                vertex.length !== 3 ||
                !vertex.every(Number.isFinite)
            ) {
                return false;
            }
        }

        // 驗證三角面
        for (const face of mesh.faces) {
            if (
                !Array.isArray(face) ||
                face.length !== 3
            ) {
                return false;
            }

            if (
                !face.every(index =>
                    Number.isInteger(index) &&
                    index >= 0 &&
                    index < mesh.vertices.length
                )
            ) {
                return false;
            }

            // 不允許同一個三角面重複使用同一頂點
            if (
                face[0] === face[1] ||
                face[1] === face[2] ||
                face[0] === face[2]
            ) {
                return false;
            }
        }

        return true;
    }

    /**
     * 套用內部模型位置設定
     *
     * position：位置
     * rotation：弧度
     * scale：縮放比例
     */
    applyPlacement(object, placement = {}) {
        if (!object?.isObject3D) {
            throw new Error("無效的內部模型物件");
        }

        const position =
            placement.position || [0, 0, 0];

        const rotation =
            placement.rotation || [0, 0, 0];

        const scale =
            placement.scale ?? 1;

        if (
            !Array.isArray(position) ||
            position.length !== 3 ||
            !position.every(Number.isFinite)
        ) {
            throw new Error("內部模型位置設定無效");
        }

        if (
            !Array.isArray(rotation) ||
            rotation.length !== 3 ||
            !rotation.every(Number.isFinite)
        ) {
            throw new Error("內部模型旋轉設定無效");
        }

        object.position.set(
            position[0],
            position[1],
            position[2]
        );

        object.rotation.set(
            rotation[0],
            rotation[1],
            rotation[2]
        );

        if (typeof scale === "number") {
            if (
                !Number.isFinite(scale) ||
                scale <= 0
            ) {
                throw new Error("模型縮放比例無效");
            }

            object.scale.setScalar(scale);

        } else if (
            Array.isArray(scale) &&
            scale.length === 3 &&
            scale.every(value =>
                Number.isFinite(value) &&
                value > 0
            )
        ) {
            object.scale.set(
                scale[0],
                scale[1],
                scale[2]
            );

        } else {
            throw new Error("模型縮放設定無效");
        }

        object.updateMatrix();
        object.updateMatrixWorld(true);

        return true;
    }

    getPreview(id) {
        return this.previews.get(id) || null;
    }

    getStoneObject(id) {
        return this.getPreview(id)?.stoneObject || null;
    }

    getIncludedGroup(id) {
        return this.getPreview(id)?.includedGroup || null;
    }

    getRoot(id) {
        return this.getPreview(id)?.root || null;
    }

    setInclusionsVisible(id, visible) {
        const preview = this.getPreview(id);

        if (!preview) {
            return false;
        }

        preview.includedGroup.visible =
            Boolean(visible);

        return true;
    }

    setStoneVisible(id, visible) {
        const preview = this.getPreview(id);

        if (!preview?.stoneObject) {
            return false;
        }

        preview.stoneObject.visible =
            Boolean(visible);

        return true;
    }

    /**
     * 設定原石透明度
     */
    setStoneOpacity(id, opacity) {
        const preview = this.getPreview(id);

        if (!preview?.stoneObject) {
            return false;
        }

        const numericOpacity = Number(opacity);

        if (!Number.isFinite(numericOpacity)) {
            return false;
        }

        const value = THREE.MathUtils.clamp(
            numericOpacity,
            0,
            1
        );

        preview.stoneObject.traverse(object => {
            if (
                !object.isMesh ||
                !object.material
            ) {
                return;
            }

            const materials =
                Array.isArray(object.material)
                    ? object.material
                    : [object.material];

            for (const material of materials) {
                if (!material) {
                    continue;
                }

                material.transparent = value < 1;
                material.opacity = value;
                material.depthWrite = value >= 1;
                material.needsUpdate = true;
            }
        });

        return true;
    }

    /**
     * 設定整組預覽的位置
     *
     * position 是原石中心希望放置的世界座標。
     */
    setPreviewPosition(id, position) {
        const preview = this.getPreview(id);

        if (
            !preview ||
            !Array.isArray(position) ||
            position.length !== 3 ||
            !position.every(Number.isFinite)
        ) {
            return false;
        }

        preview.root.position.set(
            position[0] - preview.center.x,
            position[1] - preview.center.y,
            position[2] - preview.center.z
        );

        preview.root.updateMatrixWorld(true);

        return true;
    }

    /**
     * 設定整組預覽旋轉
     */
    setPreviewRotation(id, rotation) {
        const preview = this.getPreview(id);

        if (
            !preview ||
            !Array.isArray(rotation) ||
            rotation.length !== 3 ||
            !rotation.every(Number.isFinite)
        ) {
            return false;
        }

        preview.root.rotation.set(
            rotation[0],
            rotation[1],
            rotation[2]
        );

        preview.root.updateMatrixWorld(true);

        return true;
    }

    /**
     * 設定內部模型群組旋轉
     */
    setIncludedRotation(id, rotation) {
        const preview = this.getPreview(id);

        if (
            !preview ||
            !Array.isArray(rotation) ||
            rotation.length !== 3 ||
            !rotation.every(Number.isFinite)
        ) {
            return false;
        }

        preview.includedGroup.rotation.set(
            rotation[0],
            rotation[1],
            rotation[2]
        );

        preview.includedGroup.updateMatrixWorld(true);

        return true;
    }

    /**
     * 清理預覽物件資源
     *
     * 幾何與材質由預覽模型建立流程建立。
     * 貼圖可能被其他材質共用，因此預設不釋放。
     *
     * 只有明確標記 previewOwned 的貼圖才會釋放。
     */
    disposeObjectResources(object) {
        if (!object?.traverse) {
            return;
        }

        const geometries = new Set();
        const materials = new Set();
        const ownedTextures = new Set();

        object.traverse(child => {
            if (child.geometry?.dispose) {
                geometries.add(child.geometry);
            }

            if (!child.material) {
                return;
            }

            const materialList =
                Array.isArray(child.material)
                    ? child.material
                    : [child.material];

            for (const material of materialList) {
                if (!material) {
                    continue;
                }

                materials.add(material);

                // 搜尋材質直接使用的貼圖
                for (
                    const value of Object.values(material)
                ) {
                    if (
                        value?.isTexture &&
                        value.userData?.previewOwned === true
                    ) {
                        ownedTextures.add(value);
                    }
                }

                // 搜尋 ShaderMaterial uniforms
                if (material.uniforms) {
                    for (
                        const uniform of Object.values(
                            material.uniforms
                        )
                    ) {
                        const value = uniform?.value;

                        if (
                            value?.isTexture &&
                            value.userData?.previewOwned === true
                        ) {
                            ownedTextures.add(value);
                        }

                        if (Array.isArray(value)) {
                            for (const item of value) {
                                if (
                                    item?.isTexture &&
                                    item.userData?.previewOwned === true
                                ) {
                                    ownedTextures.add(item);
                                }
                            }
                        }
                    }
                }
            }
        });

        for (const geometry of geometries) {
            geometry.dispose();
        }

        for (const material of materials) {
            material.dispose();
        }

        for (const texture of ownedTextures) {
            texture.dispose();
        }
    }

    /**
     * 釋放單組預覽物件
     */
    disposePreviewObject(preview) {
        if (!preview) {
            return;
        }

        preview.root?.removeFromParent();

        this.disposeObjectResources(preview.root);

        preview.includedObjects = [];
        preview.stoneObject = null;

        preview.stoneGroup?.clear();
        preview.includedGroup?.clear();
        preview.root?.clear();
    }

    /**
     * 根據識別碼釋放預覽
     */
    disposePreview(id) {
        const preview = this.previews.get(id);

        if (!preview) {
            return false;
        }

        this.disposePreviewObject(preview);
        this.previews.delete(id);

        return true;
    }

    /**
     * 釋放所有預覽
     */
    disposeAll() {
        for (const preview of this.previews.values()) {
            this.disposePreviewObject(preview);
        }

        this.previews.clear();
    }

    getPreviewCount() {
        return this.previews.size;
    }

    hasPreview(id) {
        return this.previews.has(id);
    }
}

export const meshPreviewManager =
    new MeshPreviewManager();

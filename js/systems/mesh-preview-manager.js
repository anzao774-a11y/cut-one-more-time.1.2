
/**
 * mesh-preview-manager.js
 *
 * 管理原石及內部模型的 Three.js 預覽。
 *
 * 使用的模型格式：
 * {
 *   vertices: [[x, y, z], ...],
 *   faces: [[a, b, c], ...]
 * }
 *
 * 內部模型格式：
 * {
 *   geometry: {
 *     vertices: [...],
 *     faces: [...]
 *   },
 *   placement: {
 *     position: [x, y, z],
 *     rotation: { x, y, z },
 *     scale: number | [x, y, z]
 *   }
 * }
 */

import * as THREE from "three";
import { meshGeometryUtils } from "./mesh-geometry-utils.js";
import { meshThreeAdapter } from "./mesh-three-adapter.js";

class MeshPreviewManager {
    previews = new Map();

    validateId(id) {
        if (
            typeof id !== "string" ||
            id.trim().length === 0
        ) {
            throw new Error("預覽 ID 不可為空");
        }
    }

    validateMesh(mesh, name = "模型") {
        if (
            !mesh ||
            !Array.isArray(mesh.vertices) ||
            !Array.isArray(mesh.faces) ||
            mesh.vertices.length < 4 ||
            mesh.faces.length < 4
        ) {
            throw new Error(`${name}資料不完整`);
        }

        for (const vertex of mesh.vertices) {
            if (
                !Array.isArray(vertex) ||
                vertex.length !== 3 ||
                !vertex.every(Number.isFinite)
            ) {
                throw new Error(`${name}包含無效頂點`);
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
                throw new Error(`${name}包含無效三角面`);
            }
        }
    }

    getCenter(mesh) {
        const bounds = meshGeometryUtils.getBounds(mesh);

        return bounds.center;
    }

    getScaleVector(scale) {
        if (scale === undefined) {
            return [1, 1, 1];
        }

        const result = typeof scale === "number"
            ? [scale, scale, scale]
            : scale;

        if (
            !Array.isArray(result) ||
            result.length !== 3 ||
            !result.every(value =>
                Number.isFinite(value) && value > 0
            )
        ) {
            throw new Error("內部模型縮放比例無效");
        }

        return result;
    }

    getPosition(placement) {
        const position = placement?.position ?? [0, 0, 0];

        if (
            !Array.isArray(position) ||
            position.length !== 3 ||
            !position.every(Number.isFinite)
        ) {
            throw new Error("內部模型位置無效");
        }

        return position;
    }

    getRotation(placement) {
        const rotation = placement?.rotation ?? {
            x: 0,
            y: 0,
            z: 0
        };

        const result = {
            x: rotation.x ?? 0,
            y: rotation.y ?? 0,
            z: rotation.z ?? 0
        };

        if (!Object.values(result).every(Number.isFinite)) {
            throw new Error("內部模型旋轉角度無效");
        }

        return result;
    }

    applyPlacement(object, placement = {}) {
        const position = this.getPosition(placement);
        const rotation = this.getRotation(placement);
        const scale = this.getScaleVector(placement.scale);

        object.position.set(
            position[0],
            position[1],
            position[2]
        );

        object.rotation.set(
            rotation.x,
            rotation.y,
            rotation.z
        );

        object.scale.set(
            scale[0],
            scale[1],
            scale[2]
        );

        object.updateMatrix();
    }

    createRootGroup() {
        const group = new THREE.Group();

        group.name = "MeshPreviewRoot";

        return group;
    }

    createPreview(id, stoneMesh, includedMeshes = [], options = {}) {
        this.validateId(id);
        this.validateMesh(stoneMesh, "原石");

        if (!Array.isArray(includedMeshes)) {
            throw new Error("內部模型必須是陣列");
        }

        // 先建立新預覽，避免新模型建立失敗時舊預覽消失。
        const center = this.getCenter(stoneMesh);
        const root = this.createRootGroup();

        const stoneGroup = new THREE.Group();
        stoneGroup.name = "StoneGroup";

        const includedGroup = new THREE.Group();
        includedGroup.name = "IncludedMeshes";

        root.add(stoneGroup);
        root.add(includedGroup);

        let stoneObject = null;

        try {
            stoneObject = meshThreeAdapter.createStoneMesh(
                stoneMesh,
                options.stoneOptions ?? {}
            );

            stoneGroup.add(stoneObject);

            for (let index = 0; index < includedMeshes.length; index++) {
                const mass = includedMeshes[index];

                const geometryData = mass.geometry ?? mass.mesh;

                this.validateMesh(
                    geometryData,
                    `內部模型 ${index}`
                );

                const jadeObject = meshThreeAdapter.createJadeMesh(
                    {
                        ...mass,
                        geometry: geometryData
                    },
                    options.jadeOptions ?? {}
                );

                this.applyPlacement(
                    jadeObject,
                    mass.placement ?? {}
                );

                jadeObject.name =
                    mass.id ?? `IncludedMesh_${index}`;

                includedGroup.add(jadeObject);
            }

            // 將位移放在共同根群組上。
            // 原石與內部模型會一起移動，保持相同座標系統。
            root.position.set(
                -center[0],
                -center[1],
                -center[2]
            );

            root.updateMatrixWorld(true);

            const previous = this.previews.get(id);

            const preview = {
                id,
                root,
                stoneGroup,
                includedGroup,
                stoneObject,
                center: [...center],
                includedCount: includedGroup.children.length,
                createdAt: Date.now()
            };

            this.previews.set(id, preview);

            // 新預覽成功建立後，才清除舊預覽。
            if (previous) {
                this.disposePreviewObject(previous);
            }

            return preview;
        } catch (error) {
            this.disposeObjectResources(root);
            throw error;
        }
    }

    getPreview(id) {
        return this.previews.get(id) ?? null;
    }

    getStoneObject(id) {
        return this.getPreview(id)?.stoneObject ?? null;
    }

    getIncludedGroup(id) {
        return this.getPreview(id)?.includedGroup ?? null;
    }

    getRoot(id) {
        return this.getPreview(id)?.root ?? null;
    }

    setInclusionsVisible(id, visible) {
        const preview = this.getPreview(id);

        if (!preview) {
            return false;
        }

        preview.includedGroup.visible = Boolean(visible);

        return true;
    }

    setStoneVisible(id, visible) {
        const preview = this.getPreview(id);

        if (!preview) {
            return false;
        }

        preview.stoneGroup.visible = Boolean(visible);

        return true;
    }

    setStoneOpacity(id, opacity) {
        const preview = this.getPreview(id);

        if (!preview) {
            return false;
        }

        if (
            !Number.isFinite(opacity) ||
            opacity < 0 ||
            opacity > 1
        ) {
            throw new Error("透明度必須介於 0 至 1");
        }

        preview.stoneObject.traverse(object => {
            if (!object.isMesh || !object.material) {
                return;
            }

            const materials = Array.isArray(object.material)
                ? object.material
                : [object.material];

            for (const material of materials) {
                material.transparent = opacity < 1;
                material.opacity = opacity;
                material.depthWrite = opacity >= 1;
                material.needsUpdate = true;
            }
        });

        return true;
    }

    disposeObjectResources(root) {
        if (!root) {
            return;
        }

        const geometries = new Set();
        const materials = new Set();

        root.traverse(object => {
            if (object.geometry) {
                geometries.add(object.geometry);
            }

            if (!object.material) {
                return;
            }

            const list = Array.isArray(object.material)
                ? object.material
                : [object.material];

            for (const material of list) {
                if (material) {
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

        if (root.parent) {
            root.parent.remove(root);
        }

        root.clear();
    }

    disposePreviewObject(preview) {
        if (!preview) {
            return;
        }

        this.disposeObjectResources(preview.root);
    }

    disposePreview(id) {
        const preview = this.previews.get(id);

        if (!preview) {
            return false;
        }

        this.disposePreviewObject(preview);
        this.previews.delete(id);

        return true;
    }

    disposeAll() {
        for (const preview of this.previews.values()) {
            this.disposePreviewObject(preview);
        }

        this.previews.clear();
    }

    setPreviewPosition(id, position) {
        const preview = this.getPreview(id);

        if (!preview) {
            return false;
        }

        if (
            !Array.isArray(position) ||
            position.length !== 3 ||
            !position.every(Number.isFinite)
        ) {
            throw new Error("預覽位置無效");
        }

        preview.root.position.set(
            position[0] - preview.center[0],
            position[1] - preview.center[1],
            position[2] - preview.center[2]
        );

        return true;
    }
}

export const meshPreviewManager =
    new MeshPreviewManager();

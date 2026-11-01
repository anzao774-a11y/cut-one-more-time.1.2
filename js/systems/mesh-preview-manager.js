
import * as THREE from "three";
import { meshGeometryUtils } from "./mesh-geometry-utils.js";
import { meshThreeAdapter } from "./mesh-three-adapter.js";

class MeshPreviewManager {
    constructor() {
        this.previews = new Map();
    }

    validateId(id) {
        if (typeof id !== "string" || !id.trim()) {
            throw new Error("預覽 ID 不可為空");
        }
    }

    validateMesh(mesh, name = "模型") {
        meshGeometryUtils.validate(mesh);
        if (!mesh) throw new Error(`${name}不存在`);
    }

    getCenter(mesh) {
        return meshGeometryUtils.getBounds(mesh).center;
    }

    normalizeScale(scale) {
        if (scale === undefined) return [1, 1, 1];

        const result = typeof scale === "number"
            ? [scale, scale, scale]
            : scale;

        if (!Array.isArray(result) || result.length !== 3 ||
            !result.every(v => Number.isFinite(v) && v > 0)) {
            throw new Error("模型縮放比例無效");
        }

        return result;
    }

    normalizePosition(position) {
        const result = position ?? [0, 0, 0];

        if (!Array.isArray(result) || result.length !== 3 ||
            !result.every(Number.isFinite)) {
            throw new Error("模型位置無效");
        }

        return result;
    }

    normalizeRotation(rotation = {}) {
        const result = {
            x: rotation.x ?? 0,
            y: rotation.y ?? 0,
            z: rotation.z ?? 0
        };

        if (!Object.values(result).every(Number.isFinite)) {
            throw new Error("模型旋轉無效");
        }

        return result;
    }

    applyPlacement(object, placement = {}) {
        const position = this.normalizePosition(placement.position);
        const rotation = this.normalizeRotation(placement.rotation);
        const scale = this.normalizeScale(placement.scale);

        object.position.set(...position);
        object.rotation.set(rotation.x, rotation.y, rotation.z);
        object.scale.set(...scale);
        object.updateMatrix();
    }

    createPreview(id, stoneMesh, includedMeshes = [], options = {}) {
        this.validateId(id);
        this.validateMesh(stoneMesh, "原石");

        if (!Array.isArray(includedMeshes)) {
            throw new Error("內部模型清單必須是陣列");
        }

        const center = this.getCenter(stoneMesh);

        const root = new THREE.Group();
        root.name = `Preview_${id}`;

        const stoneGroup = new THREE.Group();
        stoneGroup.name = "StoneGroup";

        const includedGroup = new THREE.Group();
        includedGroup.name = "IncludedGroup";

        root.add(stoneGroup);
        root.add(includedGroup);

        let preview;

        try {
            const stone = meshThreeAdapter.createStoneMesh(
                stoneMesh,
                options.stoneOptions ?? {}
            );

            stone.name = "原石";
            stoneGroup.add(stone);

            for (const mass of includedMeshes) {
                this.validateMesh(mass.geometry, "內部玉料");

                const jade = meshThreeAdapter.createJadeMesh(
                    mass,
                    options.jadeOptions ?? {}
                );

                this.applyPlacement(jade, mass.placement ?? {});
                jade.name = mass.name ?? "內部玉料";

                includedGroup.add(jade);
            }

            // 原石與內部玉料共用同一個置中位移。
            root.position.set(-center[0], -center[1], -center[2]);

            preview = {
                id,
                root,
                stoneGroup,
                includedGroup,
                stone,
                center: [...center],
                visible: true,
                inclusionsVisible: true
            };

            const previous = this.previews.get(id);
            this.previews.set(id, preview);

            if (previous) {
                this.disposePreviewObject(previous);
            }

            return preview;
        } catch (error) {
            this.disposePreviewObject({
                root,
                stoneGroup,
                includedGroup
            });

            throw error;
        }
    }

    getPreview(id) {
        return this.previews.get(id) ?? null;
    }

    getRoot(id) {
        return this.getPreview(id)?.root ?? null;
    }

    getStoneObject(id) {
        return this.getPreview(id)?.stone ?? null;
    }

    getIncludedGroup(id) {
        return this.getPreview(id)?.includedGroup ?? null;
    }

    setInclusionsVisible(id, visible) {
        const preview = this.getPreview(id);
        if (!preview) return false;

        preview.includedGroup.visible = Boolean(visible);
        preview.inclusionsVisible = Boolean(visible);

        return true;
    }

    setStoneVisible(id, visible) {
        const preview = this.getPreview(id);
        if (!preview) return false;

        preview.stoneGroup.visible = Boolean(visible);
        return true;
    }

    setStoneOpacity(id, opacity) {
        const preview = this.getPreview(id);
        if (!preview) return false;

        if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
            throw new Error("透明度必須介於 0 至 1");
        }

        preview.stone.traverse(object => {
            if (!object.material) return;

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

    setPreviewPosition(id, position) {
        const preview = this.getPreview(id);
        if (!preview) return false;

        const target = this.normalizePosition(position);

        preview.root.position.set(
            target[0] - preview.center[0],
            target[1] - preview.center[1],
            target[2] - preview.center[2]
        );

        return true;
    }

    disposePreviewObject(preview) {
        if (!preview?.root) return;

        const geometries = new Set();
        const materials = new Set();

        preview.root.traverse(object => {
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

        preview.root.removeFromParent();
        preview.root.clear();
    }

    disposePreview(id) {
        const preview = this.getPreview(id);
        if (!preview) return false;

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
}

export const meshPreviewManager = new MeshPreviewManager();

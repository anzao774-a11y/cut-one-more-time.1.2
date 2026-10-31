
import * as THREE from "three";
import { meshGeometryUtils } from "./mesh-geometry-utils.js";
import { meshThreeAdapter } from "./mesh-three-adapter.js";

class MeshPreviewManager {
    constructor() {
        this.groups = new Map();
    }

    createPreview(id, stoneMesh, includedMeshes = []) {
        if (!id) {
            throw new Error("預覽識別碼不可為空");
        }

        this.disposePreview(id);

        const group = meshThreeAdapter.createGroup();
        group.name = `preview-${id}`;

        try {
            const centeredStone = meshGeometryUtils.center(stoneMesh);

            const stoneObject = meshThreeAdapter.createStoneMesh(
                centeredStone,
                {
                    color: 0xaaa18d,
                    roughness: 0.55,
                    metalness: 0.05,
                    flatShading: true
                }
            );

            stoneObject.name = "preview-stone";
            group.add(stoneObject);

            const includedGroup = new THREE.Group();
            includedGroup.name = "preview-inclusions";

            for (const item of includedMeshes) {
                if (!item || !item.geometry) {
                    throw new Error("內部模型缺少幾何資料");
                }

                const object = meshThreeAdapter.createJadeMesh(item);

                const placement = item.placement ?? {};

                if (Array.isArray(placement.position)) {
                    object.position.set(
                        placement.position[0] ?? 0,
                        placement.position[1] ?? 0,
                        placement.position[2] ?? 0
                    );
                }

                if (placement.rotation) {
                    object.rotation.set(
                        placement.rotation.x ?? 0,
                        placement.rotation.y ?? 0,
                        placement.rotation.z ?? 0
                    );
                }

                includedGroup.add(object);
            }

            group.add(includedGroup);

            this.groups.set(id, {
                group,
                stoneObject,
                includedGroup
            });

            return group;

        } catch (error) {
            meshThreeAdapter.disposeGroup(group);
            throw error;
        }
    }

    getPreview(id) {
        return this.groups.get(id)?.group ?? null;
    }

    getStoneObject(id) {
        return this.groups.get(id)?.stoneObject ?? null;
    }

    getIncludedGroup(id) {
        return this.groups.get(id)?.includedGroup ?? null;
    }

    setInclusionsVisible(id, visible) {
        const includedGroup = this.getIncludedGroup(id);

        if (!includedGroup) {
            return false;
        }

        includedGroup.visible = Boolean(visible);
        return true;
    }

    setStoneOpacity(id, opacity) {
        const stone = this.getStoneObject(id);

        if (!stone) {
            return false;
        }

        const value = Math.max(0, Math.min(1, opacity));

        stone.material.transparent = value < 1;
        stone.material.opacity = value;
        stone.material.depthWrite = value >= 1;

        return true;
    }

    disposePreview(id) {
        const entry = this.groups.get(id);

        if (!entry) {
            return false;
        }

        meshThreeAdapter.disposeGroup(entry.group);
        this.groups.delete(id);

        return true;
    }

    disposeAll() {
        for (const id of [...this.groups.keys()]) {
            this.disposePreview(id);
        }
    }
}

export const meshPreviewManager = new MeshPreviewManager();

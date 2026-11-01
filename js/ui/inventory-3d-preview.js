import * as THREE from "three";
import { OrbitControls } from
    "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";

import { meshPreviewManager } from
    "../systems/mesh-preview-manager.js";

class Inventory3DPreview {
    constructor() {
        this.container = null;
        this.previewId = null;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        this.resizeObserver = null;
        this.animationFrame = null;

        this.initialized = false;
    }

    /**
     * 建立背包原石預覽
     *
     * stone.geometry：原石幾何
     * stone.jadeData.masses：內部模型資料
     */
    mount(container, stone) {
        if (!container || !stone?.geometry) {
            return false;
        }

        this.destroy();

        this.container = container;
        this.previewId = `inventory-${stone.id}`;

        try {
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color("#20231e");

            this.camera = new THREE.PerspectiveCamera(
                42,
                1,
                0.01,
                1000
            );

            this.renderer = new THREE.WebGLRenderer({
                antialias: true,
                alpha: false
            });

            this.renderer.setPixelRatio(
                Math.min(window.devicePixelRatio || 1, 2)
            );

            this.renderer.outputColorSpace =
                THREE.SRGBColorSpace;

            this.renderer.toneMapping =
                THREE.ACESFilmicToneMapping;

            this.renderer.toneMappingExposure = 1.15;

            container.replaceChildren(
                this.renderer.domElement
            );

            this.controls = new OrbitControls(
                this.camera,
                this.renderer.domElement
            );

            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.06;
            this.controls.enablePan = false;
            this.controls.autoRotate = true;
            this.controls.autoRotateSpeed = 0.8;

            this.setupLights();
            this.setupPreview(stone);
            this.setupGround();
            this.setupResizeObserver();

            this.resize();

            this.initialized = true;
            this.animate();

            return true;

        } catch (error) {
            console.error(
                "背包 3D 預覽建立失敗：",
                error
            );

            this.destroy();

            const message = document.createElement("div");
            message.className = "inventory-preview-fallback";
            message.textContent =
                "目前無法顯示 3D 模型，請稍後再試。";

            container.replaceChildren(message);

            return false;
        }
    }

    /**
     * 建立場景光源
     */
    setupLights() {
        const ambient = new THREE.AmbientLight(
            0xffffff,
            1.5
        );

        this.scene.add(ambient);

        const keyLight = new THREE.DirectionalLight(
            0xffe4b8,
            3
        );

        keyLight.position.set(5, 7, 5);
        this.scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(
            0x9db7c8,
            1.8
        );

        fillLight.position.set(-5, 2, -4);
        this.scene.add(fillLight);

        const rimLight = new THREE.PointLight(
            0xd5b56c,
            18,
            20
        );

        rimLight.position.set(0, 5, -5);
        this.scene.add(rimLight);
    }

    /**
     * 建立原石及內部模型
     */
    setupPreview(stone) {
        const jadeData = stone.jadeData || {};

        const masses = Array.isArray(jadeData.masses)
            ? jadeData.masses.filter(
                mass =>
                    mass?.geometry &&
                    Array.isArray(mass.geometry.vertices) &&
                    Array.isArray(mass.geometry.faces)
            )
            : [];

        const preview = meshPreviewManager.createPreview(
            this.previewId,
            stone.geometry,
            masses,
            {
                stoneOptions: {
                    roughness: 0.55,
                    metalness: 0.05,
                    flatShading: true,
                    color: 0x9a927d
                },
                jadeOptions: {
                    roughness: 0.22,
                    metalness: 0.02,
                    flatShading: false
                }
            }
        );

        this.scene.add(preview.root);

        this.fitCamera(stone.geometry);

        // 預設保留原石外觀及內部模型。
        meshPreviewManager.setStoneVisible(
            this.previewId,
            true
        );

        meshPreviewManager.setInclusionsVisible(
            this.previewId,
            true
        );
    }

    /**
     * 依原石尺寸調整攝影機
     */
    fitCamera(meshData) {
        const positions = meshData.vertices;

        let minX = Infinity;
        let minY = Infinity;
        let minZ = Infinity;

        let maxX = -Infinity;
        let maxY = -Infinity;
        let maxZ = -Infinity;

        for (const vertex of positions) {
            minX = Math.min(minX, vertex[0]);
            minY = Math.min(minY, vertex[1]);
            minZ = Math.min(minZ, vertex[2]);

            maxX = Math.max(maxX, vertex[0]);
            maxY = Math.max(maxY, vertex[1]);
            maxZ = Math.max(maxZ, vertex[2]);
        }

        const sizeX = maxX - minX;
        const sizeY = maxY - minY;
        const sizeZ = maxZ - minZ;

        const maxDimension = Math.max(
            sizeX,
            sizeY,
            sizeZ,
            0.1
        );

        const distance = maxDimension * 2.6;

        this.camera.position.set(
            distance,
            distance * 0.75,
            distance
        );

        this.camera.near = maxDimension * 0.001;
        this.camera.far = maxDimension * 100;

        this.camera.updateProjectionMatrix();

        this.controls.target.set(0, 0, 0);
        this.controls.minDistance = maxDimension * 0.8;
        this.controls.maxDistance = maxDimension * 8;

        this.controls.update();
    }

    /**
     * 建立地面格線
     */
    setupGround() {
        const grid = new THREE.GridHelper(
            6,
            12,
            0x77715c,
            0x393b32
        );

        grid.position.y = -1.5;
        this.scene.add(grid);

        this.grid = grid;
    }

    /**
     * 監聽預覽容器尺寸
     */
    setupResizeObserver() {
        if (typeof ResizeObserver === "undefined") {
            return;
        }

        this.resizeObserver = new ResizeObserver(() => {
            this.resize();
        });

        this.resizeObserver.observe(this.container);
    }

    /**
     * 更新攝影機與渲染器尺寸
     */
    resize() {
        if (!this.renderer || !this.camera || !this.container) {
            return;
        }

        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        if (width <= 0 || height <= 0) {
            return;
        }

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
    }

    /**
     * 顯示或隱藏內部模型
     */
    setInclusionsVisible(visible) {
        if (!this.previewId) {
            return false;
        }

        return meshPreviewManager.setInclusionsVisible(
            this.previewId,
            visible
        );
    }

    /**
     * 顯示或隱藏原石
     */
    setStoneVisible(visible) {
        if (!this.previewId) {
            return false;
        }

        return meshPreviewManager.setStoneVisible(
            this.previewId,
            visible
        );
    }

    /**
     * 調整原石透明度
     */
    setStoneOpacity(opacity) {
        if (!this.previewId) {
            return false;
        }

        return meshPreviewManager.setStoneOpacity(
            this.previewId,
            opacity
        );
    }

    /**
     * 開始動畫
     */
    animate() {
        if (!this.renderer) {
            return;
        }

        this.animationFrame =
            requestAnimationFrame(() => this.animate());

        this.controls?.update();

        this.renderer.render(
            this.scene,
            this.camera
        );
    }

    /**
     * 清理預覽
     */
    destroy() {
        if (this.animationFrame !== null) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }

        this.resizeObserver?.disconnect();
        this.resizeObserver = null;

        this.controls?.dispose();
        this.controls = null;

        if (this.previewId) {
            meshPreviewManager.disposePreview(
                this.previewId
            );
        }

        if (this.grid?.geometry) {
            this.grid.geometry.dispose();
        }

        if (this.grid?.material) {
            const materials = Array.isArray(this.grid.material)
                ? this.grid.material
                : [this.grid.material];

            for (const material of materials) {
                material.dispose();
            }
        }

        this.grid = null;

        if (this.renderer) {
            this.renderer.dispose();

            const canvas = this.renderer.domElement;

            if (canvas?.parentNode) {
                canvas.parentNode.removeChild(canvas);
            }
        }

        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.container = null;
        this.previewId = null;
        this.initialized = false;
    }
}

export const inventory3DPreview = new Inventory3DPreview();

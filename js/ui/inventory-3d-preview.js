
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

        this.grid = null;
        this.resizeObserver = null;
        this.animationFrame = null;

        this.initialized = false;
        this.destroying = false;
    }

    /**
     * 建立背包原石預覽
     *
     * stone.geometry：原石幾何
     * stone.jadeData.masses：內部模型資料
     */
    mount(container, stone) {
        if (!container || !stone?.geometry || !stone?.id) {
            return false;
        }

        this.destroy();

        this.container = container;
        this.previewId = `inventory-${stone.id}`;

        try {
            this.validateGeometry(stone.geometry);

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

            if (container.isConnected) {
                const message = document.createElement("div");

                message.className =
                    "inventory-preview-fallback";

                message.textContent =
                    "目前無法顯示 3D 模型，請稍後再試。";

                container.replaceChildren(message);
            }

            return false;
        }
    }

    /**
     * 驗證幾何資料
     */
    validateGeometry(meshData) {
        if (
            !meshData ||
            !Array.isArray(meshData.vertices) ||
            !Array.isArray(meshData.faces) ||
            meshData.vertices.length < 4 ||
            meshData.faces.length < 4
        ) {
            throw new Error("原石幾何資料不完整");
        }

        for (const vertex of meshData.vertices) {
            if (
                !Array.isArray(vertex) ||
                vertex.length < 3 ||
                !vertex.slice(0, 3).every(Number.isFinite)
            ) {
                throw new Error("原石頂點資料格式錯誤");
            }
        }

        for (const face of meshData.faces) {
            if (
                !Array.isArray(face) ||
                face.length !== 3 ||
                !face.every(index =>
                    Number.isInteger(index) &&
                    index >= 0 &&
                    index < meshData.vertices.length
                )
            ) {
                throw new Error("原石面資料格式錯誤");
            }
        }

        return true;
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

        const min = new THREE.Vector3(
            Infinity,
            Infinity,
            Infinity
        );

        const max = new THREE.Vector3(
            -Infinity,
            -Infinity,
            -Infinity
        );

        for (const vertex of positions) {
            min.min(
                new THREE.Vector3(
                    vertex[0],
                    vertex[1],
                    vertex[2]
                )
            );

            max.max(
                new THREE.Vector3(
                    vertex[0],
                    vertex[1],
                    vertex[2]
                )
            );
        }

        const size = max.clone().sub(min);

        const maxDimension = Math.max(
            size.x,
            size.y,
            size.z,
            0.1
        );

        const distance = maxDimension * 2.6;

        this.camera.position.set(
            distance,
            distance * 0.75,
            distance
        );

        this.camera.near = Math.max(
            maxDimension * 0.001,
            0.001
        );

        this.camera.far = maxDimension * 100;

        this.camera.updateProjectionMatrix();

        this.controls.target.set(0, 0, 0);

        this.controls.minDistance =
            maxDimension * 0.8;

        this.controls.maxDistance =
            maxDimension * 8;

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
     * 監聽容器尺寸
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
     * 更新渲染尺寸
     */
    resize() {
        if (
            !this.renderer ||
            !this.camera ||
            !this.container
        ) {
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
        if (
            !this.renderer ||
            !this.scene ||
            !this.camera ||
            this.destroying
        ) {
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
        this.destroying = true;

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

        if (this.grid) {
            this.grid.geometry?.dispose();

            const materials = Array.isArray(this.grid.material)
                ? this.grid.material
                : [this.grid.material];

            for (const material of materials) {
                material?.dispose();
            }

            this.grid.removeFromParent();
            this.grid = null;
        }

        if (this.renderer) {
            const canvas = this.renderer.domElement;

            this.renderer.dispose();

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

        this.destroying = false;
    }
}

export const inventory3DPreview =
    new Inventory3DPreview();

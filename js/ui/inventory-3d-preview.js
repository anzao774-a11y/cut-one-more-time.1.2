
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

        this.windowResizeHandler = null;
        this.bounds = null;

        this.initialized = false;
        this.destroying = false;
    }

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

            this.renderer.domElement.style.display = "block";
            this.renderer.domElement.style.width = "100%";
            this.renderer.domElement.style.height = "100%";

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

    fitCamera(meshData) {
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

        for (const vertex of meshData.vertices) {
            const point = new THREE.Vector3(
                vertex[0],
                vertex[1],
                vertex[2]
            );

            min.min(point);
            max.max(point);
        }

        const size = max.clone().sub(min);

        const maxDimension = Math.max(
            size.x,
            size.y,
            size.z,
            0.1
        );

        this.bounds = {
            min,
            max,
            size,
            maxDimension
        };

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

    setupGround() {
        if (!this.bounds) {
            return;
        }

        const { min, maxDimension } = this.bounds;

        const groundY =
            min.y - maxDimension * 0.08;

        const gridSize = Math.max(
            maxDimension * 3,
            1
        );

        const divisions = 12;

        const grid = new THREE.GridHelper(
            gridSize,
            divisions,
            0x77715c,
            0x393b32
        );

        grid.position.y = groundY;

        this.scene.add(grid);
        this.grid = grid;
    }

    setupResizeObserver() {
        if (typeof ResizeObserver !== "undefined") {
            this.resizeObserver = new ResizeObserver(() => {
                this.resize();
            });

            this.resizeObserver.observe(this.container);
            return;
        }

        this.windowResizeHandler = () => {
            this.resize();
        };

        window.addEventListener(
            "resize",
            this.windowResizeHandler
        );
    }

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

        this.renderer.setSize(
            width,
            height,
            false
        );
    }

    setInclusionsVisible(visible) {
        if (!this.previewId) {
            return false;
        }

        return meshPreviewManager.setInclusionsVisible(
            this.previewId,
            visible
        );
    }

    setStoneVisible(visible) {
        if (!this.previewId) {
            return false;
        }

        return meshPreviewManager.setStoneVisible(
            this.previewId,
            visible
        );
    }

    setStoneOpacity(opacity) {
        if (!this.previewId) {
            return false;
        }

        return meshPreviewManager.setStoneOpacity(
            this.previewId,
            opacity
        );
    }

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

    destroy() {
        this.destroying = true;

        if (this.animationFrame !== null) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }

        this.resizeObserver?.disconnect();
        this.resizeObserver = null;

        if (this.windowResizeHandler) {
            window.removeEventListener(
                "resize",
                this.windowResizeHandler
            );

            this.windowResizeHandler = null;
        }

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
        this.bounds = null;
        this.initialized = false;

        this.destroying = false;
    }
}

export const inventory3DPreview =
    new Inventory3DPreview();

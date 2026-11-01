import * as THREE from "three";

import { OrbitControls } from
    "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";


class Inventory3DPreview {
    constructor() {
        this.container = null;
        this.previewId = null;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        this.stoneMesh = null;
        this.jadeMeshes = [];
        this.grid = null;

        this.resizeObserver = null;
        this.animationFrame = null;
        this.windowResizeHandler = null;

        this.initialized = false;
        this.destroying = false;

        this.stoneMaterial = null;
        this.bounds = null;
    }

    // ==========================================
    // 建立預覽
    // ==========================================

    mount(container, stone) {
        if (
            !container ||
            !stone?.geometry ||
            !stone?.id
        ) {
            return false;
        }

        this.destroy();

        this.container = container;
        this.previewId = `inventory-${stone.id}`;

        try {
            this.validateGeometry(stone.geometry);

            this.scene = new THREE.Scene();

            this.scene.background =
                new THREE.Color("#20231e");

            this.camera =
                new THREE.PerspectiveCamera(
                    42,
                    1,
                    0.01,
                    1000
                );

            this.renderer =
                new THREE.WebGLRenderer({
                    antialias: true,
                    alpha: false
                });

            this.renderer.setPixelRatio(
                Math.min(
                    window.devicePixelRatio || 1,
                    2
                )
            );

            this.renderer.outputColorSpace =
                THREE.SRGBColorSpace;

            this.renderer.toneMapping =
                THREE.ACESFilmicToneMapping;

            this.renderer.toneMappingExposure = 1.15;

            this.renderer.domElement.style.display =
                "block";

            this.renderer.domElement.style.width =
                "100%";

            this.renderer.domElement.style.height =
                "100%";

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
                const message =
                    document.createElement("div");

                message.className =
                    "inventory-preview-fallback";

                message.textContent =
                    "目前無法顯示 3D 模型，請稍後再試。";

                container.replaceChildren(message);
            }

            return false;
        }
    }


    // ==========================================
    // 幾何資料檢查
    // ==========================================

    validateGeometry(meshData) {
        if (
            !meshData ||
            !Array.isArray(meshData.vertices) ||
            !Array.isArray(meshData.faces) ||
            meshData.vertices.length < 4 ||
            meshData.faces.length < 4
        ) {
            throw new Error(
                "原石幾何資料不完整"
            );
        }

        for (const vertex of meshData.vertices) {
            if (
                !Array.isArray(vertex) ||
                vertex.length < 3 ||
                !vertex.slice(0, 3).every(Number.isFinite)
            ) {
                throw new Error(
                    "原石頂點資料格式錯誤"
                );
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
                throw new Error(
                    "原石面資料格式錯誤"
                );
            }
        }

        return true;
    }


    // ==========================================
    // 燈光
    // ==========================================

    setupLights() {
        const ambient =
            new THREE.AmbientLight(
                0xffffff,
                1.5
            );

        this.scene.add(ambient);


        const keyLight =
            new THREE.DirectionalLight(
                0xffe4b8,
                3
            );

        keyLight.position.set(
            5,
            7,
            5
        );

        this.scene.add(keyLight);


        const fillLight =
            new THREE.DirectionalLight(
                0x9db7c8,
                1.8
            );

        fillLight.position.set(
            -5,
            2,
            -4
        );

        this.scene.add(fillLight);


        const rimLight =
            new THREE.PointLight(
                0xd5b56c,
                18,
                20
            );

        rimLight.position.set(
            0,
            5,
            -5
        );

        this.scene.add(rimLight);
    }


    // ==========================================
    // 建立原石模型
    // ==========================================

    setupPreview(stone) {
        const meshData = stone.geometry;

        const geometry =
            new THREE.BufferGeometry();

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

        // 將模型移到原點，避免原始座標偏移。
        const center = new THREE.Vector3();

        geometry.boundingBox.getCenter(center);

        geometry.translate(
            -center.x,
            -center.y,
            -center.z
        );

        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        const isCutPiece = stone.status === "cut";

        this.stoneMaterial =
            new THREE.MeshStandardMaterial({
                color: 0x9a927d,
                roughness: 0.55,
                metalness: 0.05,
                flatShading: true,
                side: THREE.DoubleSide,
                transparent: isCutPiece,
                opacity: isCutPiece ? 0.24 : 1,
                depthWrite: !isCutPiece
            });

        this.stoneMesh = new THREE.Mesh(
            geometry,
            this.stoneMaterial
        );

        this.scene.add(this.stoneMesh);

        // 切割後以半透明外殼展示內部玉料，未切割原石維持完整外觀。
        const jadeColors = {
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

        const jadeMasses = Array.isArray(stone.jadeData?.masses)
            ? stone.jadeData.masses
            : [];

        for (const mass of jadeMasses) {
            const jadeData = mass?.geometry;

            if (
                !jadeData ||
                !Array.isArray(jadeData.vertices) ||
                !Array.isArray(jadeData.faces) ||
                jadeData.vertices.length < 4 ||
                jadeData.faces.length < 4
            ) {
                continue;
            }

            const jadeGeometry = new THREE.BufferGeometry();
            const jadePositions = jadeData.vertices.flat();
            const jadeIndices = jadeData.faces.flat();

            jadeGeometry.setAttribute(
                "position",
                new THREE.Float32BufferAttribute(jadePositions, 3)
            );

            jadeGeometry.setIndex(jadeIndices);

            // 玉料與原石共用原始世界座標，因此套用相同的置中位移。
            jadeGeometry.translate(
                -center.x,
                -center.y,
                -center.z
            );

            jadeGeometry.computeVertexNormals();
            jadeGeometry.computeBoundingSphere();

            const jadeMaterial = new THREE.MeshStandardMaterial({
                color: jadeColors[mass.jadeType] ?? 0x72a98a,
                roughness: 0.2,
                metalness: 0.03,
                side: THREE.DoubleSide
            });

            const jadeMesh = new THREE.Mesh(
                jadeGeometry,
                jadeMaterial
            );

            jadeMesh.name = mass.name ?? "內部玉料";
            jadeMesh.userData.jadeType = mass.jadeType ?? null;
            jadeMesh.userData.jadeRarity = mass.rarity ?? null;
            jadeMesh.castShadow = true;
            jadeMesh.receiveShadow = true;

            this.scene.add(jadeMesh);

            this.jadeMeshes ??= [];
            this.jadeMeshes.push(jadeMesh);
        }

        this.fitCamera(geometry);
    }


    // ==========================================
    // 相機調整
    // ==========================================

    fitCamera(geometry) {
        const box = geometry.boundingBox;

        if (!box) {
            throw new Error(
                "無法取得原石尺寸"
            );
        }

        const size = new THREE.Vector3();

        box.getSize(size);

        const maxDimension = Math.max(
            size.x,
            size.y,
            size.z,
            0.1
        );

        this.bounds = {
            size,
            maxDimension
        };

        const distance =
            maxDimension * 2.6;

        this.camera.position.set(
            distance,
            distance * 0.75,
            distance
        );

        this.camera.near = Math.max(
            maxDimension * 0.001,
            0.001
        );

        this.camera.far =
            maxDimension * 100;

        this.camera.updateProjectionMatrix();

        this.controls.target.set(
            0,
            0,
            0
        );

        this.controls.minDistance =
            maxDimension * 0.8;

        this.controls.maxDistance =
            maxDimension * 8;

        this.controls.update();
    }


    // ==========================================
    // 地面網格
    // ==========================================

    setupGround() {
        if (!this.bounds) {
            return;
        }

        const groundY =
            -this.bounds.size.y / 2 -
            this.bounds.maxDimension * 0.08;

        const gridSize = Math.max(
            this.bounds.maxDimension * 3,
            1
        );

        this.grid = new THREE.GridHelper(
            gridSize,
            12,
            0x77715c,
            0x393b32
        );

        this.grid.position.y = groundY;

        this.scene.add(this.grid);
    }


    // ==========================================
    // 畫面尺寸監聽
    // ==========================================

    setupResizeObserver() {
        if (
            typeof ResizeObserver !== "undefined"
        ) {
            this.resizeObserver =
                new ResizeObserver(() => {
                    this.resize();
                });

            this.resizeObserver.observe(
                this.container
            );

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

        const width =
            this.container.clientWidth;

        const height =
            this.container.clientHeight;

        if (
            width <= 0 ||
            height <= 0
        ) {
            return;
        }

        this.camera.aspect =
            width / height;

        this.camera.updateProjectionMatrix();

        this.renderer.setSize(
            width,
            height,
            false
        );
    }


    // ==========================================
    // 顯示控制
    // ==========================================

    setInclusionsVisible(visible) {
        // 目前版本尚未建立獨立的內部玉石模型。
        return true;
    }


    setStoneVisible(visible) {
        if (!this.stoneMesh) {
            return false;
        }

        this.stoneMesh.visible = Boolean(visible);

        return true;
    }


    setStoneOpacity(opacity) {
        if (!this.stoneMaterial) {
            return false;
        }

        const value = Math.max(
            0,
            Math.min(1, Number(opacity))
        );

        this.stoneMaterial.opacity = value;

        this.stoneMaterial.transparent =
            value < 1;

        this.stoneMaterial.depthWrite =
            value >= 1;

        this.stoneMaterial.needsUpdate = true;

        return true;
    }


    // ==========================================
    // 動畫
    // ==========================================

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
            requestAnimationFrame(
                () => this.animate()
            );

        this.controls?.update();

        this.renderer.render(
            this.scene,
            this.camera
        );
    }


    // ==========================================
    // 清理
    // ==========================================

    destroy() {
        this.destroying = true;

        if (this.animationFrame !== null) {
            cancelAnimationFrame(
                this.animationFrame
            );

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

        if (this.stoneMesh) {
            this.stoneMesh.geometry?.dispose();

            this.stoneMesh.removeFromParent();

            this.stoneMesh = null;
        }

        for (const jadeMesh of this.jadeMeshes ?? []) {
            jadeMesh.geometry?.dispose();
            jadeMesh.material?.dispose();
            jadeMesh.removeFromParent();
        }

        this.jadeMeshes = [];

        this.stoneMaterial?.dispose();

        this.stoneMaterial = null;

        if (this.grid) {
            this.grid.geometry?.dispose();

            const materials = Array.isArray(
                this.grid.material
            )
                ? this.grid.material
                : [this.grid.material];

            for (const material of materials) {
                material?.dispose();
            }

            this.grid.removeFromParent();

            this.grid = null;
        }

        if (this.renderer) {
            const canvas =
                this.renderer.domElement;

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

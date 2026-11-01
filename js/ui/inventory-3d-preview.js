
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
        this.previewGroup = null;
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
            !stone?.id
        ) {
            return false;
        }

        const isCutPiece = stone.status === "cut";

        // 原石需要 geometry。
        // 切割產物優先使用獨立玉石 geometry。
        const hasJade =
            Array.isArray(stone.jadeData?.masses) &&
            stone.jadeData.masses.some(mass =>
                mass?.geometry?.vertices?.length >= 4 &&
                mass?.geometry?.faces?.length >= 4
            );

        if (!isCutPiece && !stone.geometry) {
            return false;
        }

        if (isCutPiece && !hasJade && !stone.geometry) {
            return false;
        }

        this.destroy();

        this.container = container;
        this.previewId = `inventory-${stone.id}`;

        try {
            this.scene = new THREE.Scene();

            this.scene.background =
                new THREE.Color("#20231e");

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
            throw new Error("模型幾何資料不完整");
        }

        for (const vertex of meshData.vertices) {
            if (
                !Array.isArray(vertex) ||
                vertex.length !== 3 ||
                !vertex.every(Number.isFinite)
            ) {
                throw new Error("模型頂點資料格式錯誤");
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
                throw new Error("模型面資料格式錯誤");
            }
        }

        return true;
    }


    // ==========================================
    // 燈光
    // ==========================================

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


    // ==========================================
    // 建立幾何
    // 與切割工作台相同，依照 faces 展開頂點
    // ==========================================

    meshToGeometry(meshData) {
        this.validateGeometry(meshData);

        const positions = [];

        for (const face of meshData.faces) {
            for (const index of face) {
                const vertex = meshData.vertices[index];

                positions.push(
                    vertex[0],
                    vertex[1],
                    vertex[2]
                );
            }
        }

        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(
                positions,
                3
            )
        );

        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        return geometry;
    }


    // ==========================================
    // 玉石顏色
    // ==========================================

    getJadeColor(jadeType) {
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

        return jadeColors[jadeType] ?? 0x72a98a;
    }


    // ==========================================
    // 建立獨立玉石模型
    // ==========================================

    createJadeMesh(mass) {
        if (!mass?.geometry) {
            return null;
        }

        const geometry = this.meshToGeometry(
            mass.geometry
        );

        const material = new THREE.MeshStandardMaterial({
            color: this.getJadeColor(mass.jadeType),
            roughness: 0.2,
            metalness: 0.03,
            side: THREE.DoubleSide,
            transparent: false,
            opacity: 1
        });

        const mesh = new THREE.Mesh(
            geometry,
            material
        );

        mesh.name = mass.name ?? "獨立玉石";

        mesh.userData.jadeType =
            mass.jadeType ?? null;

        mesh.userData.jadeRarity =
            mass.rarity ?? null;

        mesh.userData.sourceMassId =
            mass.sourceMassId ?? mass.id ?? null;

        mesh.castShadow = true;
        mesh.receiveShadow = true;

        return mesh;
    }


    // ==========================================
    // 建立預覽模型
    // ==========================================

    setupPreview(stone) {
        const isCutPiece = stone.status === "cut";

        // ======================================
        // 已切割產物
        // 直接顯示獨立玉石，不顯示原石外殼
        // ======================================

        if (isCutPiece) {
            const masses = Array.isArray(
                stone.jadeData?.masses
            )
                ? stone.jadeData.masses
                : [];

            const validMasses = masses.filter(mass => {
                try {
                    this.validateGeometry(mass?.geometry);
                    return true;
                } catch {
                    console.warn(
                        "略過無效玉石資料：",
                        mass
                    );

                    return false;
                }
            });

            console.log(
                "背包獨立玉石數量：",
                validMasses.length,
                stone.id
            );

            // 沒有玉石資料時，不把原石外殼冒充成獨立玉石。
            if (validMasses.length === 0) {
                throw new Error(
                    "切割產物沒有可顯示的獨立玉石資料"
                );
            }

            this.previewGroup = new THREE.Group();

            for (const mass of validMasses) {
                const jadeMesh = this.createJadeMesh(mass);

                if (!jadeMesh) continue;

                this.previewGroup.add(jadeMesh);

                this.jadeMeshes.push(jadeMesh);
            }

            if (this.jadeMeshes.length === 0) {
                throw new Error("無法建立獨立玉石模型");
            }

            this.scene.add(this.previewGroup);

            // 計算所有玉石的共同範圍。
            // 保留同一切割產物內多塊玉石的相對位置。
            const combinedBounds = new THREE.Box3()
                .setFromObject(this.previewGroup);

            if (combinedBounds.isEmpty()) {
                throw new Error("無法取得玉石模型範圍");
            }

            const center = new THREE.Vector3();

            combinedBounds.getCenter(center);

            // 將整組玉石移至預覽中心。
            this.previewGroup.position.sub(center);

            // 重新計算置中後的整體範圍。
            combinedBounds.setFromObject(
                this.previewGroup
            );

            this.fitCamera(combinedBounds);

            return;
        }


        // ======================================
        // 未切割原石
        // 顯示完整、不透明的原石
        // ======================================

        const geometry = this.meshToGeometry(
            stone.geometry
        );

        this.stoneMaterial =
            new THREE.MeshStandardMaterial({
                color: 0x777b68,
                roughness: 0.78,
                metalness: 0.05,
                flatShading: true,
                transparent: false,
                opacity: 1,
                depthWrite: true
            });

        this.stoneMesh = new THREE.Mesh(
            geometry,
            this.stoneMaterial
        );

        this.stoneMesh.castShadow = true;
        this.stoneMesh.receiveShadow = true;

        this.scene.add(this.stoneMesh);

        // 未切割原石只顯示外殼。
        // 內部玉料不會透過外殼顯示。

        this.fitCamera(geometry.boundingBox);
    }


    // ==========================================
    // 相機調整
    // ==========================================

    fitCamera(bounds) {
        if (!bounds || bounds.isEmpty()) {
            throw new Error("無法取得模型尺寸");
        }

        const size = new THREE.Vector3();

        bounds.getSize(size);

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


    // ==========================================
    // 地面網格
    // ==========================================

    setupGround() {
        if (!this.bounds) return;

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

        if (width <= 0 || height <= 0) return;

        this.camera.aspect = width / height;

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
        for (const jadeMesh of this.jadeMeshes) {
            jadeMesh.visible = Boolean(visible);
        }

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

        // 原石外殼維持不透明。
        this.stoneMaterial.opacity = 1;
        this.stoneMaterial.transparent = false;
        this.stoneMaterial.depthWrite = true;

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

        this.animationFrame = requestAnimationFrame(
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

        if (this.stoneMesh) {
            this.stoneMesh.geometry?.dispose();

            this.stoneMesh.removeFromParent();

            this.stoneMesh = null;
        }

        for (const jadeMesh of this.jadeMeshes) {
            jadeMesh.geometry?.dispose();

            jadeMesh.material?.dispose();

            jadeMesh.removeFromParent();
        }

        this.jadeMeshes = [];

        this.previewGroup = null;

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

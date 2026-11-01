import * as THREE from "three";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";

import { cuttingSystem } from "../systems/cutting-system.js?version=6";
import { saveManager } from "../core/save-manager.js";
import { inventorySystem } from "../systems/inventory.js";
import { meshPlacementUtils } from "../systems/mesh-placement-utils.js";
import { meshGeometryUtils } from "../systems/mesh-geometry-utils.js";
import { geometryEngine } from "../systems/geometry-engine.js";

import {
    testIrregularStone,
    testCube
} from "../systems/cutting-test-data.js?version=2";


class CuttingUI {
    constructor() {
        this.initialized = false;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        this.originalGroup = null;
        this.resultGroup = null;
        this.previewGroup = null;

        this.gridHelper = null;
        this.floorMesh = null;

        this.currentMesh = null;
        this.currentStoneId = null;
        this.currentStone = null;

        this.isTestMode = false;

        this.currentResult = null;
        this.currentView = "original";

        this.axis = "x";
        this.cutPosition = 0;
        this.bladeThickness = 0.025;

        this.savedCurrentResult = false;

        this.animationFrame = null;
        this.resizeObserver = null;

        this.materials = {};
        this.elements = {};

        this.boundPageOpened = null;
    }


    // ==========================================
    // 初始化
    // ==========================================

    init() {
        if (this.initialized) return;

        this.cacheElements();

        if (!this.elements.viewer) {
            console.error("找不到切割工作台 3D 容器");
            return;
        }

        this.initialized = true;

        this.createStoneSelector();
        this.createScene();
        this.createMaterials();
        this.bindEvents();

        this.refreshStoneSelector();

        this.resizeObserver = new ResizeObserver(() => {
            this.resize();
        });

        this.resizeObserver.observe(this.elements.viewer);

        this.animate();

        console.log("3D 切割工作台初始化完成");
    }


    cacheElements() {
        const mapping = {
            viewer: "cutting-viewer",
            axis: "cut-axis",
            position: "cut-position",
            positionValue: "cut-position-value",
            positionLabel: "cut-position-label",
            thickness: "blade-thickness",
            thicknessValue: "blade-thickness-value",
            cutButton: "cut-button",
            resetButton: "reset-cut-button",
            message: "cutting-message",
            results: "cutting-results",

            originalVolume: "cut-original-volume",
            positiveVolume: "cut-positive-volume",
            negativeVolume: "cut-negative-volume",
            removedVolume: "cut-removed-volume",
            volumeDifference: "cut-volume-difference",

            viewOriginal: "cut-view-original",
            viewResults: "cut-view-results",
            testCube: "cut-test-cube"
        };

        for (const [key, id] of Object.entries(mapping)) {
            this.elements[key] = document.getElementById(id);
        }
    }


    // ==========================================
    // 原石選擇器
    // ==========================================

    createStoneSelector() {
        const viewer = this.elements.viewer;

        if (!viewer || !viewer.parentElement) return;

        const existing = document.getElementById(
            "cutting-stone-selector"
        );

        if (existing) {
            existing.remove();
        }

        const wrapper = document.createElement("div");

        wrapper.id = "cutting-stone-selector";

        wrapper.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 10px;
            margin-bottom: 14px;
            padding: 14px;
            border: 1px solid rgba(198,164,92,0.22);
            border-radius: 10px;
            background: rgba(30,34,28,0.95);
        `;

        const label = document.createElement("label");

        label.textContent = "選擇待切割原石";

        label.style.cssText = `
            color: #d5c59a;
            font-size: 13px;
            font-weight: 600;
        `;

        label.htmlFor = "cutting-stone-select";

        const select = document.createElement("select");

        select.id = "cutting-stone-select";

        select.style.cssText = `
            flex: 1;
            min-width: 180px;
            min-height: 40px;
            padding: 0 12px;
            border: 1px solid rgba(198,164,92,0.3);
            border-radius: 7px;
            background: #292d26;
            color: #eee6d2;
            font: inherit;
        `;

        const info = document.createElement("span");

        info.id = "cutting-stone-info";

        info.style.cssText = `
            width: 100%;
            color: #aaa58f;
            font-size: 11px;
            line-height: 1.6;
        `;

        wrapper.appendChild(label);
        wrapper.appendChild(select);
        wrapper.appendChild(info);

        viewer.parentElement.insertBefore(wrapper, viewer);

        this.elements.stoneSelect = select;
        this.elements.stoneInfo = info;
    }


    // ==========================================
    // 可切割物件判斷
    // ==========================================

    isValidGeometry(geometry, minimumVertices = 4) {
        if (
            !geometry ||
            !Array.isArray(geometry.vertices) ||
            !Array.isArray(geometry.faces) ||
            geometry.vertices.length < minimumVertices ||
            geometry.faces.length < 4
        ) {
            return false;
        }

        for (const vertex of geometry.vertices) {
            if (
                !Array.isArray(vertex) ||
                vertex.length !== 3 ||
                !vertex.every(Number.isFinite)
            ) {
                return false;
            }
        }

        for (const face of geometry.faces) {
            if (
                !Array.isArray(face) ||
                face.length !== 3 ||
                !face.every(index =>
                    Number.isInteger(index) &&
                    index >= 0 &&
                    index < geometry.vertices.length
                ) ||
                new Set(face).size !== 3
            ) {
                return false;
            }
        }

        return true;
    }


    isCuttableStone(stone) {
        if (
            !stone ||
            !stone.id ||
            stone.consumedByCut === true ||
            !this.isValidGeometry(stone.geometry)
        ) {
            return false;
        }

        if (stone.status === "uncut") {
            return true;
        }

        return (
            stone.status === "cut" &&
            Boolean(stone.sourceStoneId) &&
            Boolean(stone.cutSide)
        );
    }


    refreshStoneSelector() {
        const select = this.elements.stoneSelect;

        if (!select) return;

        const previousId = this.currentStoneId;

        const stones = inventorySystem.getCuttable()
            .filter(stone => this.isCuttableStone(stone));

        select.replaceChildren();

        const placeholder = document.createElement("option");

        placeholder.value = "";
        placeholder.textContent = "請選擇背包中的原石或切割產物";

        select.appendChild(placeholder);

        for (const stone of stones) {
            const option = document.createElement("option");

            option.value = stone.id;

            const rarityName =
                stone.rarityName ??
                stone.rarity ??
                "未知稀有度";

            const stoneName =
                stone.name ??
                "未命名原石";

            const cutLabel =
                stone.status === "cut"
                    ? "｜切割產物，可再次切割"
                    : "｜未切割原石";

            option.textContent =
                `${rarityName}｜${stoneName}${cutLabel}`;

            select.appendChild(option);
        }

        if (
            previousId &&
            stones.some(stone => stone.id === previousId)
        ) {
            select.value = previousId;
        } else {
            select.value = "";
        }

        if (stones.length === 0) {
            this.updateStoneInfo(
                "目前沒有可切割的背包原石或切割產物。可以使用測試素材進行測試。"
            );
        } else {
            this.updateStoneInfo(
                `目前有 ${stones.length} 件可切割素材，包含原石與切割產物。`
            );
        }
    }


    updateStoneInfo(message) {
        if (this.elements.stoneInfo) {
            this.elements.stoneInfo.textContent = message;
        }
    }


    getStoneGeometry(stone) {
        if (
            !stone ||
            !this.isValidGeometry(stone.geometry)
        ) {
            return null;
        }

        return {
            vertices: structuredClone(stone.geometry.vertices),
            faces: structuredClone(stone.geometry.faces)
        };
    }


    selectInventoryStone(stoneId) {
        if (!stoneId) return false;

        const stone = inventorySystem.getById(stoneId);

        if (!stone) {
            this.showMessage(
                "找不到指定原石，請重新整理選單。",
                true
            );

            return false;
        }

        if (!this.isCuttableStone(stone)) {
            this.showMessage(
                "此素材目前不符合再次切割條件。",
                true
            );

            return false;
        }

        const geometry = this.getStoneGeometry(stone);

        if (!geometry) {
            this.showMessage(
                "此原石缺少有效的 3D 幾何資料，暫時無法切割。",
                true
            );

            return false;
        }

        this.currentStone = stone;
        this.currentStoneId = stone.id;

        this.currentMesh = geometry;

        this.isTestMode = false;

        this.currentResult = null;
        this.savedCurrentResult = false;

        if (this.elements.results) {
            this.elements.results.hidden = true;
        }

        if (this.elements.cutButton) {
            this.elements.cutButton.disabled = false;
        }

        this.loadOriginalStone();

        const rarityName =
            stone.rarityName ??
            stone.rarity ??
            "未知稀有度";

        const isCutPiece = stone.status === "cut";

        this.showMessage(
            isCutPiece
                ? `已載入切割產物：${stone.name ?? "未命名素材"}，可以再次切割。`
                : `已載入 ${rarityName} 原石，可以開始調整切割參數。`
        );

        this.updateStoneInfo(
            isCutPiece
                ? `目前選擇：${stone.name ?? "未命名素材"}｜切割產物｜可再次切割`
                : `目前選擇：${stone.name ?? "未命名原石"}｜${rarityName}`
        );

        if (this.elements.stoneSelect) {
            this.elements.stoneSelect.value = stone.id;
        }

        return true;
    }


    // ==========================================
    // Three.js 場景
    // ==========================================

    createScene() {
        this.scene = new THREE.Scene();

        this.scene.background = new THREE.Color("#20231e");

        this.camera = new THREE.PerspectiveCamera(
            45,
            1,
            0.1,
            100
        );

        this.camera.position.set(4.5, 3.5, 5);

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false
        });

        this.renderer.setPixelRatio(
            Math.min(window.devicePixelRatio || 1, 2)
        );

        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        this.renderer.shadowMap.enabled = true;

        this.renderer.shadowMap.type =
            THREE.PCFSoftShadowMap;

        this.elements.viewer.appendChild(
            this.renderer.domElement
        );

        this.controls = new OrbitControls(
            this.camera,
            this.renderer.domElement
        );

        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.06;

        this.controls.minDistance = 2.5;
        this.controls.maxDistance = 12;

        this.controls.target.set(0, 0, 0);

        this.scene.add(
            new THREE.AmbientLight(0xffffff, 1.7)
        );

        const keyLight = new THREE.DirectionalLight(
            0xffe2a1,
            3
        );

        keyLight.position.set(4, 6, 5);
        keyLight.castShadow = true;

        this.scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(
            0x8da58a,
            1.4
        );

        fillLight.position.set(-5, 2, -3);

        this.scene.add(fillLight);

        const rimLight = new THREE.PointLight(
            0xc6a45c,
            20,
            12
        );

        rimLight.position.set(0, 3, -4);

        this.scene.add(rimLight);

        this.gridHelper = new THREE.GridHelper(
            8,
            16,
            0x6b694e,
            0x353a30
        );

        this.gridHelper.position.y = -1.55;

        this.scene.add(this.gridHelper);

        this.floorMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(20, 20),
            new THREE.MeshStandardMaterial({
                color: 0x20231e,
                roughness: 0.95
            })
        );

        this.floorMesh.rotation.x = -Math.PI / 2;
        this.floorMesh.position.y = -1.58;
        this.floorMesh.receiveShadow = true;

        this.scene.add(this.floorMesh);

        this.resize();
    }


    createMaterials() {
        this.materials.original =
            new THREE.MeshStandardMaterial({
                color: 0x777b68,
                roughness: 0.78,
                metalness: 0.05,
                flatShading: true
            });

        this.materials.positive =
            new THREE.MeshStandardMaterial({
                color: 0x879b72,
                roughness: 0.68,
                metalness: 0.06,
                flatShading: true
            });

        this.materials.negative =
            new THREE.MeshStandardMaterial({
                color: 0xb59a61,
                roughness: 0.65,
                metalness: 0.08,
                flatShading: true
            });

        this.materials.preview =
            new THREE.MeshBasicMaterial({
                color: 0xd5b56c,
                transparent: true,
                opacity: 0.2,
                side: THREE.DoubleSide,
                depthWrite: false
            });
    }


    meshToGeometry(meshData) {
        if (!this.isValidGeometry(meshData, 3)) {
            throw new Error("模型幾何資料格式錯誤");
        }

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
        geometry.computeBoundingSphere();

        return geometry;
    }


    createStoneMesh(meshData, material) {
        const stone = new THREE.Mesh(
            this.meshToGeometry(meshData),
            material
        );

        stone.castShadow = true;
        stone.receiveShadow = true;

        return stone;
    }


    getJadeColor(jadeType) {
        const colors = {
            agate: "#c47c62",
            jasper: "#a64f3d",
            quartz: "#d8d8dc",
            commercial_nephrite: "#91a98c",
            amethyst: "#9165c4",
            citrine: "#d6a83e",
            garnet: "#8c263d",
            lapis_lazuli: "#244a9b",
            turquoise: "#36a8a5",
            aquamarine: "#78c6d4",
            peridot: "#91b83e",
            spinel: "#bb536b",
            tourmaline: "#4b9973",
            jadeite: "#70a982",
            moonstone: "#b9c6d7",
            emerald: "#16834c",
            ruby: "#bd263e",
            sapphire: "#315eb5",
            precious_opal: "#9bb8c1",
            imperial_green_jadeite: "#087a3c",
            alexandrite: "#426e78",
            black_opal: "#30343d",
            pigeon_blood_ruby: "#a40d2b",
            jade_37: "#719e80"
        };

        return colors[jadeType] ?? "#3f9b70";
    }


    createJadeMesh(mass) {
        if (
            !mass?.geometry ||
            !this.isValidGeometry(mass.geometry)
        ) {
            throw new Error(
                `玉料「${mass?.name ?? "未命名"}」缺少有效幾何資料。`
            );
        }

        const material = new THREE.MeshStandardMaterial({
            color: this.getJadeColor(mass.jadeType),
            roughness: 0.2,
            metalness: 0.03,
            side: THREE.DoubleSide
        });

        const jade = new THREE.Mesh(
            this.meshToGeometry(mass.geometry),
            material
        );

        jade.name = mass.name ?? "內部玉石";

        jade.userData.jadeType = mass.jadeType ?? null;
        jade.userData.ownsMaterial = true;

        jade.castShadow = true;
        jade.receiveShadow = true;

        return jade;
    }


    clearGroup(group) {
        if (!group || !this.scene) return;

        this.scene.remove(group);

        group.traverse(object => {
            if (object.isMesh && object.geometry) {
                object.geometry.dispose();
            }

            if (
                object.isMesh &&
                object.material &&
                object.userData?.ownsMaterial
            ) {
                const materials = Array.isArray(object.material)
                    ? object.material
                    : [object.material];

                for (const material of materials) {
                    material.dispose();
                }
            }
        });
    }


    clearPreview() {
        if (!this.previewGroup) return;

        this.clearGroup(this.previewGroup);

        this.previewGroup = null;
    }


    loadOriginalStone() {
        this.clearGroup(this.originalGroup);
        this.clearGroup(this.resultGroup);
        this.clearPreview();

        this.originalGroup = new THREE.Group();
        this.resultGroup = null;

        this.originalGroup.add(
            this.createStoneMesh(
                this.currentMesh,
                this.materials.original
            )
        );

        this.scene.add(this.originalGroup);

        this.currentView = "original";

        this.resetCamera();

        this.updateViewButtons();
        this.updateCutPreview();
    }


    resetCamera() {
        if (!this.camera || !this.controls) return;

        this.camera.position.set(4.5, 3.5, 5);

        this.controls.target.set(0, 0, 0);

        this.controls.update();
    }


    // ==========================================
    // 切割平面
    // ==========================================

    getPlaneNormal() {
        if (this.axis === "x") {
            return [1, 0, 0];
        }

        if (this.axis === "y") {
            return [0, 1, 0];
        }

        return [0, 0, 1];
    }


    getCutPlane() {
        const point = [0, 0, 0];

        if (this.axis === "x") {
            point[0] = this.cutPosition;
        }

        if (this.axis === "y") {
            point[1] = this.cutPosition;
        }

        if (this.axis === "z") {
            point[2] = this.cutPosition;
        }

        return {
            point,
            normal: this.getPlaneNormal()
        };
    }


    updateCutPreview() {
        this.clearPreview();

        if (
            this.currentView !== "original" ||
            !this.currentMesh
        ) {
            return;
        }

        const plane = this.getCutPlane();

        const helper = new THREE.Group();

        const planeMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(3.2, 3.2),
            this.materials.preview
        );

        planeMesh.position.set(
            plane.point[0],
            plane.point[1],
            plane.point[2]
        );

        if (this.axis === "x") {
            planeMesh.rotation.y = Math.PI / 2;
        } else if (this.axis === "y") {
            planeMesh.rotation.x = -Math.PI / 2;
        }

        helper.add(planeMesh);

        this.previewGroup = helper;

        this.scene.add(helper);
    }


    // ==========================================
    // 事件
    // ==========================================

    bindEvents() {
        const bind = (element, eventName, callback) => {
            if (!element) return;

            element.addEventListener(
                eventName,
                callback
            );
        };

        bind(
            this.elements.stoneSelect,
            "change",
            event => {
                const stoneId = event.target.value;

                if (stoneId) {
                    this.selectInventoryStone(stoneId);
                }
            }
        );

        bind(
            this.elements.axis,
            "change",
            event => {
                this.axis = event.target.value;

                this.updatePositionLabel();
                this.updateCutPreview();
            }
        );

        bind(
            this.elements.position,
            "input",
            event => {
                this.cutPosition = Number(
                    event.target.value
                );

                if (this.elements.positionValue) {
                    this.elements.positionValue.textContent =
                        this.cutPosition.toFixed(2);
                }

                this.updateCutPreview();
            }
        );

        bind(
            this.elements.thickness,
            "input",
            event => {
                this.bladeThickness = Number(
                    event.target.value
                );

                if (this.elements.thicknessValue) {
                    this.elements.thicknessValue.textContent =
                        this.bladeThickness.toFixed(3);
                }
            }
        );

        bind(
            this.elements.cutButton,
            "click",
            () => {
                this.performCut();
            }
        );

        bind(
            this.elements.resetButton,
            "click",
            () => {
                this.resetWorkbench();
            }
        );

        bind(
            this.elements.viewOriginal,
            "click",
            () => {
                this.showOriginal();
            }
        );

        bind(
            this.elements.viewResults,
            "click",
            () => {
                this.showResults();
            }
        );

        bind(
            this.elements.testCube,
            "click",
            () => {
                this.loadTestStone();
            }
        );

        this.boundPageOpened = () => {
            requestAnimationFrame(() => {
                this.resize();
            });
        };

        document.addEventListener(
            "cutting:page-opened",
            this.boundPageOpened
        );
    }


    updatePositionLabel() {
        const labels = {
            x: "X 軸切割位置",
            y: "Y 軸切割位置",
            z: "Z 軸切割位置"
        };

        if (this.elements.positionLabel) {
            this.elements.positionLabel.textContent =
                labels[this.axis];
        }

        this.updateCutPreview();
    }


    // ==========================================
    // 測試素材
    // ==========================================

    loadTestStone(mesh = testCube, name = "標準立方體") {
        this.currentMesh = structuredClone(mesh);

        this.currentStone = null;
        this.currentStoneId = null;

        this.isTestMode = true;

        this.currentResult = null;
        this.savedCurrentResult = false;

        if (this.elements.stoneSelect) {
            this.elements.stoneSelect.value = "";
        }

        if (this.elements.results) {
            this.elements.results.hidden = true;
        }

        if (this.elements.cutButton) {
            this.elements.cutButton.disabled = false;
        }

        this.loadOriginalStone();

        this.showMessage(
            `目前使用測試素材：${name}。此模式不會修改背包。`
        );

        this.updateStoneInfo(
            `測試模式：${name}，切割結果不會加入背包。`
        );
    }


    // ==========================================
    // 內部玉石定位
    // ==========================================

    createStableJadePlacement(sourceStone, mass, index, hostBounds) {
        if (mass.placementApplied && mass.geometry) {
            return {
                geometry: structuredClone(mass.geometry),
                placement: mass.placement ?? null
            };
        }

        if (!this.isValidGeometry(mass.geometry)) {
            throw new Error(
                `玉料「${mass.name ?? index}」原始幾何資料無效。`
            );
        }

        const seedText = String(mass.id ?? index);

        let seed = 2166136261;

        for (let i = 0; i < seedText.length; i++) {
            seed ^= seedText.charCodeAt(i);
            seed = Math.imul(seed, 16777619);
        }

        const random = () => {
            seed += 0x6D2B79F5;

            let value = seed;

            value = Math.imul(
                value ^ (value >>> 15),
                value | 1
            );

            value ^= value + Math.imul(
                value ^ (value >>> 7),
                value | 61
            );

            return (
                (value ^ (value >>> 14)) >>> 0
            ) / 4294967296;
        };

        const volume = Math.max(
            0,
            Number(mass.volumePercent) || 0
        );

        const fitRatio = Math.min(
            0.42,
            Math.max(
                0.18,
                0.16 + Math.sqrt(volume / 100) * 0.42
            )
        );

        const normalizedPosition = [
            0.28 + random() * 0.44,
            0.28 + random() * 0.44,
            0.28 + random() * 0.44
        ];

        const rotation = {
            x: random() * Math.PI * 2,
            y: random() * Math.PI * 2,
            z: random() * Math.PI * 2
        };

        const placed = meshPlacementUtils.createPlacement(
            mass.geometry,
            hostBounds,
            {
                rotation,
                fitRatio,
                padding: 0.04,
                normalizedPosition
            }
        );

        if (
            !placed ||
            !this.isValidGeometry(placed.mesh)
        ) {
            throw new Error(
                `玉料「${mass.name ?? index}」定位後的幾何資料無效。`
            );
        }

        return {
            geometry: placed.mesh,
            placement: placed.placement ?? null
        };
    }


    // ==========================================
    // 玉料切割
    // ==========================================

    splitJadeData(sourceStone, cutResult) {
        const sourceData = sourceStone?.jadeData;

        if (
            !sourceData ||
            !Array.isArray(sourceData.masses)
        ) {
            return {
                positive: null,
                negative: null
            };
        }

        if (
            !sourceStone?.geometry ||
            !cutResult?.cutPlane ||
            !Array.isArray(cutResult.cutPlane.normal) ||
            !Array.isArray(cutResult.cutPlane.point)
        ) {
            throw new Error(
                "玉料切割缺少來源模型或切割平面資料。"
            );
        }

        if (
            !this.isValidGeometry(sourceStone.geometry)
        ) {
            throw new Error(
                "來源原石幾何資料無效，無法切割內部玉料。"
            );
        }

        const normal = cutResult.cutPlane.normal;
        const point = cutResult.cutPlane.point;

        if (
            normal.length !== 3 ||
            point.length !== 3 ||
            !normal.every(Number.isFinite) ||
            !point.every(Number.isFinite)
        ) {
            throw new Error("切割平面資料無效。");
        }

        const normalLength = Math.hypot(
            normal[0],
            normal[1],
            normal[2]
        );

        if (normalLength <= 1e-10) {
            throw new Error("切割平面法線長度無效。");
        }

        const unitNormal = normal.map(
            value => value / normalLength
        );

        const rawBladeThickness =
            Number(cutResult.bladeThickness);

        const bladeThickness =
            Number.isFinite(rawBladeThickness)
                ? Math.max(0, rawBladeThickness)
                : 0;

        const halfThickness = bladeThickness / 2;

        const hostBounds = meshGeometryUtils.getBounds(
            sourceStone.geometry
        );

        if (!hostBounds) {
            throw new Error("無法取得來源原石的幾何邊界。");
        }

        const positivePlane = {
            point: point.map((value, axis) =>
                value + unitNormal[axis] * halfThickness
            ),
            normal: [...unitNormal]
        };

        const negativePlane = {
            point: point.map((value, axis) =>
                value - unitNormal[axis] * halfThickness
            ),
            normal: unitNormal.map(value => -value)
        };

        const positiveMasses = [];
        const negativeMasses = [];
        const discardedMasses = [];

        const getVolume = geometry => {
            if (!this.isValidGeometry(geometry)) {
                throw new Error("玉料幾何資料無效，無法計算體積。");
            }

            const volume = cuttingSystem.calculateVolume(
                geometry
            );

            if (
                !Number.isFinite(volume) ||
                Math.abs(volume) <= 1e-10
            ) {
                throw new Error("玉料體積無效或接近零。");
            }

            return Math.abs(volume);
        };


        // ======================================
        // 保存切割後的玉石
        // ======================================

        const appendMass = (
            side,
            mass,
            geometry,
            originalVolume,
            placement,
            index
        ) => {
            if (!this.isValidGeometry(geometry)) {
                throw new Error(
                    `${side} 側玉料「${mass.name ?? index}」裁切後幾何資料無效。`
                );
            }

            const volume = getVolume(geometry);

            if (
                volume <= 1e-10 ||
                originalVolume <= 1e-10
            ) {
                throw new Error(
                    `${side} 側玉料「${mass.name ?? index}」體積無效。`
                );
            }

            const ratio = volume / originalVolume;

            if (
                !Number.isFinite(ratio) ||
                ratio <= 0 ||
                ratio > 1.0001
            ) {
                throw new Error(
                    `${side} 側玉料「${mass.name ?? index}」體積比例異常。`
                );
            }

            const record = {
                ...mass,

                id: `${mass.id ?? "jade"}-${side}-${index}`,

                sourceMassId:
                    mass.sourceMassId ??
                    mass.id ??
                    null,

                geometry: structuredClone(geometry),

                placementApplied: true,

                placement: placement ?? null,

                volumePercent:
                    (Number(mass.volumePercent) || 0) *
                    Math.min(1, ratio)
            };

            if (side === "positive") {
                positiveMasses.push(record);
            } else {
                negativeMasses.push(record);
            }

            return record;
        };


        // ======================================
        // 逐一處理原石內部玉料
        // ======================================

        for (let index = 0; index < sourceData.masses.length; index++) {
            const mass = sourceData.masses[index];

            if (!mass?.geometry) {
                throw new Error(
                    `第 ${index + 1} 筆玉料缺少幾何資料，已中止切割以避免資料遺失。`
                );
            }

            let placed;

            try {
                placed = this.createStableJadePlacement(
                    sourceStone,
                    mass,
                    index,
                    hostBounds
                );
            } catch (error) {
                throw new Error(
                    `玉料「${mass.name ?? index + 1}」定位失敗：${error.message}`
                );
            }

            const jadeGeometry = placed?.geometry;

            if (!this.isValidGeometry(jadeGeometry)) {
                throw new Error(
                    `玉料「${mass.name ?? index + 1}」定位後的幾何資料無效。`
                );
            }

            const originalVolume = getVolume(
                jadeGeometry
            );

            let minDistance = Infinity;
            let maxDistance = -Infinity;

            for (const vertex of jadeGeometry.vertices) {
                const distance =
                    (vertex[0] - point[0]) * unitNormal[0] +
                    (vertex[1] - point[1]) * unitNormal[1] +
                    (vertex[2] - point[2]) * unitNormal[2];

                minDistance = Math.min(
                    minDistance,
                    distance
                );

                maxDistance = Math.max(
                    maxDistance,
                    distance
                );
            }


            // 完全位於正側。

            if (minDistance >= halfThickness) {
                appendMass(
                    "positive",
                    mass,
                    jadeGeometry,
                    originalVolume,
                    placed.placement,
                    index
                );

                continue;
            }


            // 完全位於負側。

            if (maxDistance <= -halfThickness) {
                appendMass(
                    "negative",
                    mass,
                    jadeGeometry,
                    originalVolume,
                    placed.placement,
                    index
                );

                continue;
            }


            // 完全位於刀片移除範圍。

            if (
                minDistance >= -halfThickness &&
                maxDistance <= halfThickness
            ) {
                discardedMasses.push({
                    ...mass,
                    discardReason: "blade",
                    originalVolume
                });

                continue;
            }


            // 切割正側玉石。

            if (maxDistance > halfThickness) {
                try {
                    const positivePiece =
                        geometryEngine.clipMesh(
                            jadeGeometry,
                            positivePlane
                        );

                    appendMass(
                        "positive",
                        mass,
                        positivePiece,
                        originalVolume,
                        placed.placement,
                        index
                    );
                } catch (error) {
                    throw new Error(
                        `正側玉料「${mass.name ?? index + 1}」切割失敗：${error.message}`
                    );
                }
            }


            // 切割負側玉石。

            if (minDistance < -halfThickness) {
                try {
                    const negativePiece =
                        geometryEngine.clipMesh(
                            jadeGeometry,
                            negativePlane
                        );

                    appendMass(
                        "negative",
                        mass,
                        negativePiece,
                        originalVolume,
                        placed.placement,
                        index
                    );
                } catch (error) {
                    throw new Error(
                        `負側玉料「${mass.name ?? index + 1}」切割失敗：${error.message}`
                    );
                }
            }
        }


        // ======================================
        // 建立切割後兩側的玉料資料
        // ======================================

        const createSideData = (masses, suffix) => {
            if (masses.length === 0) {
                return null;
            }

            const totalJadeVolume = masses.reduce(
                (sum, mass) => {
                    return sum + (
                        Number(mass.volumePercent) || 0
                    );
                },
                0
            );

            return {
                ...sourceData,

                stoneId: `${sourceStone.id}-${suffix}`,

                totalJadeVolume,

                retainedVolume: totalJadeVolume,

                masses,

                discardedMasses: []
            };
        };

        const result = {
            positive: createSideData(
                positiveMasses,
                "positive"
            ),

            negative: createSideData(
                negativeMasses,
                "negative"
            )
        };

        console.log("玉石切割結果：", {
            sourceStone: sourceStone.id,

            positiveCount: positiveMasses.length,

            negativeCount: negativeMasses.length,

            discardedCount: discardedMasses.length,

            positiveVolume:
                result.positive?.totalJadeVolume ?? 0,

            negativeVolume:
                result.negative?.totalJadeVolume ?? 0
        });

        return result;
    }


    // ==========================================
    // 切割結果紀錄
    // ==========================================

    createInventoryRecord(mesh, side, result, sourceStone, jadeData) {
        if (!this.isValidGeometry(mesh)) {
            throw new Error(
                `${side} 側原石幾何資料無效，無法建立背包紀錄。`
            );
        }

        const now = Date.now();

        const sideName =
            side === "positive"
                ? "正側"
                : "負側";

        return {
            id:
                `cut-${now}-${side}-` +
                Math.random().toString(36).slice(2, 8),

            name:
                `${sourceStone.name ?? "原石"}（${sideName}）`,

            rarity: sourceStone.rarity ?? "common",

            rarityName:
                sourceStone.rarityName ??
                sourceStone.rarity ??
                "常見",

            status: "cut",

            obtainedAt: now,

            sourceStoneId: sourceStone.id,

            cutSide: side,

            geometry: {
                vertices: structuredClone(mesh.vertices),
                faces: structuredClone(mesh.faces)
            },

            cutData: {
                side,

                originalVolume: result.originalVolume,

                pieceVolume:
                    side === "positive"
                        ? result.positiveVolume
                        : result.negativeVolume,

                removedVolume: result.removedVolume,

                bladeThickness: result.bladeThickness,

                cutPlane: structuredClone(
                    result.cutPlane
                )
            },

            jadeData: jadeData ?? null
        };
    }


    // ==========================================
    // 原子化保存切割結果
    // ==========================================

    saveCutPieces(result, jadeSplit = null) {
        if (this.isTestMode) {
            return [];
        }

        if (this.savedCurrentResult) {
            throw new Error(
                "本次切割結果已經加入背包，請選擇其他原石。"
            );
        }

        if (!this.currentStoneId) {
            throw new Error(
                "沒有指定來源原石，無法儲存切割結果。"
            );
        }

        const saveData = saveManager.getData();

        if (
            !saveData ||
            !Array.isArray(saveData.inventory)
        ) {
            throw new Error(
                "無法取得背包存檔資料。"
            );
        }

        const originalStone = saveData.inventory.find(
            stone => stone.id === this.currentStoneId
        );

        if (!originalStone) {
            throw new Error(
                "來源原石已不存在，請重新整理工作台。"
            );
        }

        if (!this.isCuttableStone(originalStone)) {
            throw new Error(
                "來源素材目前不符合切割條件。"
            );
        }

        // 玉料資料必須在修改背包前完成。
        jadeSplit ??= this.splitJadeData(
            originalStone,
            result
        );

        const positiveRecord = this.createInventoryRecord(
            result.positivePiece,
            "positive",
            result,
            originalStone,
            jadeSplit?.positive ?? null
        );

        const negativeRecord = this.createInventoryRecord(
            result.negativePiece,
            "negative",
            result,
            originalStone,
            jadeSplit?.negative ?? null
        );

        const originalStatus = originalStone.status;
        const originalCutAt = originalStone.cutAt;

        const originalCutResultIds =
            Array.isArray(originalStone.cutResultIds)
                ? [...originalStone.cutResultIds]
                : null;

        const originalConsumedState =
            originalStone.consumedByCut;

        const originalInventory = [
            ...saveData.inventory
        ];

        const originalStatistics =
            saveData.statistics
                ? structuredClone(saveData.statistics)
                : null;

        try {
            originalStone.status = "cut";
            originalStone.cutAt = Date.now();

            const isCutPiece = Boolean(
                originalStone.sourceStoneId &&
                originalStone.cutSide
            );

            if (isCutPiece) {
                originalStone.consumedByCut = true;
            }

            const previousIds = Array.isArray(
                originalStone.cutResultIds
            )
                ? originalStone.cutResultIds
                : [];

            originalStone.cutResultIds = [
                ...new Set([
                    ...previousIds,
                    positiveRecord.id,
                    negativeRecord.id
                ])
            ];

            saveData.inventory.push(
                positiveRecord,
                negativeRecord
            );

            if (!saveData.statistics) {
                saveData.statistics = {
                    totalPulls: 0,
                    totalCuts: 0
                };
            }

            saveData.statistics.totalCuts =
                (Number(saveData.statistics.totalCuts) || 0) + 1;

            const saved = saveManager.save();

            if (!saved) {
                throw new Error("存檔管理器回報保存失敗。");
            }
        } catch (error) {
            saveData.inventory = originalInventory;

            originalStone.status = originalStatus;

            if (originalCutAt === undefined) {
                delete originalStone.cutAt;
            } else {
                originalStone.cutAt = originalCutAt;
            }

            if (originalCutResultIds === null) {
                delete originalStone.cutResultIds;
            } else {
                originalStone.cutResultIds =
                    originalCutResultIds;
            }

            if (originalConsumedState === undefined) {
                delete originalStone.consumedByCut;
            } else {
                originalStone.consumedByCut =
                    originalConsumedState;
            }

            if (originalStatistics === null) {
                delete saveData.statistics;
            } else {
                saveData.statistics = originalStatistics;
            }

            throw new Error(
                `切割結果保存失敗，已回復背包資料：${error.message}`
            );
        }

        this.savedCurrentResult = true;

        inventorySystem.notifyChanged();

        this.refreshStoneSelector();

        return [
            positiveRecord,
            negativeRecord
        ];
    }


    // ==========================================
    // 執行切割
    // ==========================================

    performCut() {
        if (!this.currentMesh) {
            this.showMessage(
                "目前沒有載入原石。",
                true
            );

            return;
        }

        if (this.savedCurrentResult) {
            this.showMessage(
                "本次切割已經完成，請選擇其他原石。",
                true
            );

            return;
        }

        if (!this.isTestMode) {
            const latestStone = inventorySystem.getById(
                this.currentStoneId
            );

            if (!this.isCuttableStone(latestStone)) {
                this.showMessage(
                    "來源素材已不存在、已消耗或不符合切割條件，請重新選擇。",
                    true
                );

                this.refreshStoneSelector();

                return;
            }

            this.currentStone = latestStone;
        }

        try {
            cuttingSystem.setBladeThickness(
                this.bladeThickness
            );

            const result = cuttingSystem.cutStone(
                this.currentMesh,
                this.getCutPlane()
            );

            if (
                !result ||
                !this.isValidGeometry(result.positivePiece) ||
                !this.isValidGeometry(result.negativePiece)
            ) {
                throw new Error(
                    "原石切割結果不完整，無法建立有效的兩側模型。"
                );
            }

            const jadeSplit = this.isTestMode
                ? {
                    positive: null,
                    negative: null
                }
                : this.splitJadeData(
                    this.currentStone,
                    result
                );

            // 先建立結果畫面，再執行存檔。
            this.displayResults(result, jadeSplit);

            if (this.elements.results) {
                this.elements.results.hidden = false;
            }

            this.currentResult = result;

            const savedRecords = this.saveCutPieces(
                result,
                jadeSplit
            );

            if (this.isTestMode) {
                this.showMessage(
                    "測試切割完成！本次結果沒有加入背包。"
                );
            } else {
                if (this.elements.cutButton) {
                    this.elements.cutButton.disabled = true;
                }

                this.showMessage(
                    `切割完成！正側與負側兩塊已加入背包。新增 ${savedRecords.length} 筆紀錄。`
                );
            }
        } catch (error) {
            console.error(
                "切割或存檔失敗：",
                error
            );

            this.currentResult = null;

            if (this.elements.results) {
                this.elements.results.hidden = true;
            }

            if (this.elements.cutButton) {
                this.elements.cutButton.disabled = false;
            }

            this.showMessage(
                `切割或存檔失敗：${error.message}`,
                true
            );
        }
    }


    // ==========================================
    // 顯示切割結果
    // ==========================================

    displayResults(result, jadeSplit = null) {
        this.clearGroup(this.originalGroup);
        this.clearGroup(this.resultGroup);

        this.clearPreview();

        this.originalGroup = null;

        this.resultGroup = new THREE.Group();

        const positive = this.createStoneMesh(
            result.positivePiece,
            this.materials.positive
        );

        const negative = this.createStoneMesh(
            result.negativePiece,
            this.materials.negative
        );

        positive.position.x = -1.35;
        negative.position.x = 1.35;

        for (const material of [
            this.materials.positive,
            this.materials.negative
        ]) {
            material.transparent = true;
            material.opacity = 0.28;
            material.depthWrite = false;
            material.needsUpdate = true;
        }

        const positiveMasses =
            jadeSplit?.positive?.masses ?? [];

        const negativeMasses =
            jadeSplit?.negative?.masses ?? [];

        for (const mass of positiveMasses) {
            const jade = this.createJadeMesh(mass);

            jade.position.x = -1.35;

            this.resultGroup.add(jade);
        }

        for (const mass of negativeMasses) {
            const jade = this.createJadeMesh(mass);

            jade.position.x = 1.35;

            this.resultGroup.add(jade);
        }

        this.resultGroup.add(
            positive,
            negative
        );

        this.scene.add(this.resultGroup);

        if (this.elements.originalVolume) {
            this.elements.originalVolume.textContent =
                result.originalVolume.toFixed(4);
        }

        if (this.elements.positiveVolume) {
            this.elements.positiveVolume.textContent =
                result.positiveVolume.toFixed(4);
        }

        if (this.elements.negativeVolume) {
            this.elements.negativeVolume.textContent =
                result.negativeVolume.toFixed(4);
        }

        if (this.elements.removedVolume) {
            this.elements.removedVolume.textContent =
                result.removedVolume.toFixed(4);
        }

        const total =
            result.positiveVolume +
            result.negativeVolume +
            result.removedVolume;

        const difference = Math.abs(
            result.originalVolume - total
        );

        if (this.elements.volumeDifference) {
            this.elements.volumeDifference.textContent =
                difference.toFixed(8);
        }

        this.currentView = "results";

        this.resetCamera();

        this.updateViewButtons();
    }


    // ==========================================
    // 檢視切換
    // ==========================================

    showOriginal() {
        if (!this.currentMesh) return;

        this.clearGroup(this.resultGroup);
        this.clearGroup(this.originalGroup);

        this.clearPreview();

        this.resultGroup = null;

        this.originalGroup = new THREE.Group();

        this.originalGroup.add(
            this.createStoneMesh(
                this.currentMesh,
                this.materials.original
            )
        );

        this.scene.add(this.originalGroup);

        this.currentView = "original";

        this.resetCamera();

        this.updateCutPreview();

        this.updateViewButtons();
    }


    showResults() {
        if (!this.currentResult || !this.resultGroup) {
            return;
        }

        this.clearGroup(this.originalGroup);

        this.clearPreview();

        this.originalGroup = null;

        this.scene.add(this.resultGroup);

        this.currentView = "results";

        this.resetCamera();

        this.updateViewButtons();
    }


    updateViewButtons() {
        if (this.elements.viewOriginal) {
            this.elements.viewOriginal.classList.toggle(
                "active",
                this.currentView === "original"
            );
        }

        if (this.elements.viewResults) {
            this.elements.viewResults.classList.toggle(
                "active",
                this.currentView === "results"
            );

            this.elements.viewResults.disabled =
                !this.currentResult;
        }
    }


    // ==========================================
    // 訊息
    // ==========================================

    showMessage(message, isError = false) {
        if (!this.elements.message) return;

        this.elements.message.textContent = message;

        this.elements.message.classList.toggle(
            "error",
            isError
        );
    }


    // ==========================================
    // 重設工作台
    // ==========================================

    resetWorkbench() {
        this.currentResult = null;

        this.savedCurrentResult = false;

        this.axis = "x";
        this.cutPosition = 0;
        this.bladeThickness = 0.025;

        if (this.elements.axis) {
            this.elements.axis.value = "x";
        }

        if (this.elements.position) {
            this.elements.position.value = "0";
        }

        if (this.elements.positionValue) {
            this.elements.positionValue.textContent = "0.00";
        }

        if (this.elements.thickness) {
            this.elements.thickness.value = "0.025";
        }

        if (this.elements.thicknessValue) {
            this.elements.thicknessValue.textContent = "0.025";
        }

        if (this.elements.results) {
            this.elements.results.hidden = true;
        }

        if (this.elements.cutButton) {
            this.elements.cutButton.disabled = false;
        }

        cuttingSystem.setBladeThickness(0.025);

        this.refreshStoneSelector();

        const stones = inventorySystem.getCuttable()
            .filter(stone => this.isCuttableStone(stone));

        if (stones.length > 0) {
            const nextStone = stones[0];

            const loaded = this.selectInventoryStone(
                nextStone.id
            );

            if (loaded) {
                this.showMessage(
                    "工作台已重設，已載入下一件可切割素材。"
                );

                return;
            }
        }

        this.loadTestStone(
            testIrregularStone,
            "不規則原石測試素材"
        );

        this.showMessage(
            "工作台已重設，目前沒有可切割的背包素材，已載入測試素材。"
        );
    }


    // ==========================================
    // 畫面尺寸
    // ==========================================

    resize() {
        if (!this.renderer || !this.camera) {
            return;
        }

        const width =
            this.elements.viewer.clientWidth;

        const height =
            this.elements.viewer.clientHeight;

        if (width <= 0 || height <= 0) {
            return;
        }

        this.camera.aspect = width / height;

        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
    }


    // ==========================================
    // 動畫
    // ==========================================

    animate() {
        if (!this.initialized) return;

        this.animationFrame = requestAnimationFrame(
            () => {
                this.animate();
            }
        );

        if (this.controls) {
            this.controls.update();
        }

        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(
                this.scene,
                this.camera
            );
        }
    }


    // ==========================================
    // 清理
    // ==========================================

    dispose() {
        if (this.animationFrame !== null) {
            cancelAnimationFrame(this.animationFrame);

            this.animationFrame = null;
        }

        if (this.resizeObserver) {
            this.resizeObserver.disconnect();

            this.resizeObserver = null;
        }

        if (this.boundPageOpened) {
            document.removeEventListener(
                "cutting:page-opened",
                this.boundPageOpened
            );

            this.boundPageOpened = null;
        }

        this.clearGroup(this.originalGroup);
        this.clearGroup(this.resultGroup);
        this.clearPreview();

        this.originalGroup = null;
        this.resultGroup = null;
        this.previewGroup = null;

        if (this.gridHelper) {
            this.scene?.remove(this.gridHelper);

            this.gridHelper.geometry.dispose();

            const materials = Array.isArray(
                this.gridHelper.material
            )
                ? this.gridHelper.material
                : [this.gridHelper.material];

            for (const material of materials) {
                material.dispose();
            }

            this.gridHelper = null;
        }

        if (this.floorMesh) {
            this.scene?.remove(this.floorMesh);

            this.floorMesh.geometry.dispose();
            this.floorMesh.material.dispose();

            this.floorMesh = null;
        }

        if (this.controls) {
            this.controls.dispose();

            this.controls = null;
        }

        if (this.renderer) {
            this.renderer.dispose();

            this.renderer.domElement.remove();

            this.renderer = null;
        }

        for (const material of Object.values(this.materials)) {
            if (material?.dispose) {
                material.dispose();
            }
        }

        this.materials = {};

        this.scene = null;
        this.camera = null;

        this.initialized = false;
    }
}


export const cuttingUI = new CuttingUI();

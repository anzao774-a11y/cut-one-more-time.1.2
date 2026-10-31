
import * as THREE from "three";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";

import { cuttingSystem } from "../systems/cutting-system.js?version=6";
import { saveManager } from "../core/save-manager.js";
import { eventBus } from "../core/event-bus.js";

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

        this.currentMesh = structuredClone(testIrregularStone);
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
    }

    init() {
        if (this.initialized) return;

        this.cacheElements();

        if (!this.elements.viewer) {
            console.error("找不到切割工作台 3D 容器");
            return;
        }

        this.initialized = true;

        this.createScene();
        this.createMaterials();
        this.bindEvents();

        this.loadOriginalStone();
        this.updateCutPreview();
        this.updatePositionLabel();

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

    createScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color("#20231e");

        this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
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
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.elements.viewer.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(
            this.camera,
            this.renderer.domElement
        );

        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.06;
        this.controls.minDistance = 2.5;
        this.controls.maxDistance = 12;
        this.controls.target.set(0, 0, 0);

        this.scene.add(new THREE.AmbientLight(0xffffff, 1.7));

        const keyLight = new THREE.DirectionalLight(0xffe2a1, 3);
        keyLight.position.set(4, 6, 5);
        keyLight.castShadow = true;
        this.scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0x8da58a, 1.4);
        fillLight.position.set(-5, 2, -3);
        this.scene.add(fillLight);

        const rimLight = new THREE.PointLight(0xc6a45c, 20, 12);
        rimLight.position.set(0, 3, -4);
        this.scene.add(rimLight);

        const grid = new THREE.GridHelper(8, 16, 0x6b694e, 0x353a30);
        grid.position.y = -1.55;
        this.scene.add(grid);

        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(20, 20),
            new THREE.MeshStandardMaterial({
                color: 0x20231e,
                roughness: 0.95
            })
        );

        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -1.58;
        floor.receiveShadow = true;
        this.scene.add(floor);

        this.resize();
    }

    createMaterials() {
        this.materials.original = new THREE.MeshStandardMaterial({
            color: 0x777b68,
            roughness: 0.78,
            metalness: 0.05,
            flatShading: true
        });

        this.materials.positive = new THREE.MeshStandardMaterial({
            color: 0x879b72,
            roughness: 0.68,
            metalness: 0.06,
            flatShading: true
        });

        this.materials.negative = new THREE.MeshStandardMaterial({
            color: 0xb59a61,
            roughness: 0.65,
            metalness: 0.08,
            flatShading: true
        });

        this.materials.preview = new THREE.MeshBasicMaterial({
            color: 0xd5b56c,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
            depthWrite: false
        });
    }

    meshToGeometry(meshData) {
        const positions = [];

        for (const face of meshData.faces) {
            for (const index of face) {
                const vertex = meshData.vertices[index];
                positions.push(vertex[0], vertex[1], vertex[2]);
            }
        }

        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(positions, 3)
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

    clearGroup(group) {
        if (!group) return;

        this.scene.remove(group);

        group.traverse(object => {
            if (object.isMesh && object.geometry) {
                object.geometry.dispose();
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
        this.camera.position.set(4.5, 3.5, 5);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }

    getPlaneNormal() {
        if (this.axis === "x") return [1, 0, 0];
        if (this.axis === "y") return [0, 1, 0];
        return [0, 0, 1];
    }

    getCutPlane() {
        const point = [0, 0, 0];

        if (this.axis === "x") point[0] = this.cutPosition;
        if (this.axis === "y") point[1] = this.cutPosition;
        if (this.axis === "z") point[2] = this.cutPosition;

        return {
            point,
            normal: this.getPlaneNormal()
        };
    }

    updateCutPreview() {
        this.clearPreview();

        if (this.currentView !== "original") return;

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

    bindEvents() {
        this.elements.axis.addEventListener("change", event => {
            this.axis = event.target.value;
            this.updatePositionLabel();
            this.updateCutPreview();
        });

        this.elements.position.addEventListener("input", event => {
            this.cutPosition = Number(event.target.value);

            this.elements.positionValue.textContent =
                this.cutPosition.toFixed(2);

            this.updateCutPreview();
        });

        this.elements.thickness.addEventListener("input", event => {
            this.bladeThickness = Number(event.target.value);

            this.elements.thicknessValue.textContent =
                this.bladeThickness.toFixed(3);
        });

        this.elements.cutButton.addEventListener("click", () => {
            this.performCut();
        });

        this.elements.resetButton.addEventListener("click", () => {
            this.resetWorkbench();
        });

        this.elements.viewOriginal.addEventListener("click", () => {
            this.showOriginal();
        });

        this.elements.viewResults.addEventListener("click", () => {
            this.showResults();
        });

        this.elements.testCube.addEventListener("click", () => {
            this.currentMesh = structuredClone(testCube);
            this.currentResult = null;
            this.savedCurrentResult = false;

            this.elements.results.hidden = true;
            this.elements.cutButton.disabled = false;

            this.loadOriginalStone();
            this.showMessage("已載入標準立方體測試素材。");
        });

        document.addEventListener("cutting:page-opened", () => {
            requestAnimationFrame(() => this.resize());
        });
    }

    updatePositionLabel() {
        const labels = {
            x: "X 軸切割位置",
            y: "Y 軸切割位置",
            z: "Z 軸切割位置"
        };

        this.elements.positionLabel.textContent = labels[this.axis];
        this.updateCutPreview();
    }

    createInventoryRecord(mesh, side, result) {
        const now = Date.now();

        return {
            id: `cut-${now}-${side}-${Math.random().toString(36).slice(2, 8)}`,
            name: side === "positive" ? "切割原石（正側）" : "切割原石（負側）",
            rarity: "common",
            status: "cut",
            obtainedAt: now,

            geometry: {
                vertices: structuredClone(mesh.vertices),
                faces: structuredClone(mesh.faces)
            },

            cutData: {
                side,
                originalVolume: result.originalVolume,
                pieceVolume: side === "positive"
                    ? result.positiveVolume
                    : result.negativeVolume,
                removedVolume: result.removedVolume,
                bladeThickness: result.bladeThickness,
                cutPlane: structuredClone(result.cutPlane)
            },

            jadeData: null
        };
    }

    saveCutPieces(result) {
        if (this.savedCurrentResult) {
            throw new Error("本次切割結果已經加入背包，請重設工作台後再切割。");
        }

        const saveData = saveManager.getData();

        if (!saveData || !Array.isArray(saveData.inventory)) {
            throw new Error("無法取得背包存檔資料，請檢查 saveManager。");
        }

        const positiveRecord = this.createInventoryRecord(
            result.positivePiece,
            "positive",
            result
        );

        const negativeRecord = this.createInventoryRecord(
            result.negativePiece,
            "negative",
            result
        );

        saveData.inventory.push(positiveRecord, negativeRecord);

        saveManager.save();

        eventBus.emit("inventory:changed", saveData.inventory);

        this.savedCurrentResult = true;

        return [positiveRecord, negativeRecord];
    }

    performCut() {
        if (this.savedCurrentResult) {
            this.showMessage(
                "本次切割已經存入背包，請重設工作台後再進行下一次切割。",
                true
            );
            return;
        }

        try {
            cuttingSystem.setBladeThickness(this.bladeThickness);

            const result = cuttingSystem.cutStone(
                this.currentMesh,
                this.getCutPlane()
            );

            this.currentResult = result;

            this.displayResults(result);
            this.elements.results.hidden = false;

            const savedRecords = this.saveCutPieces(result);

            this.elements.cutButton.disabled = true;

            this.showMessage(
                `切割完成！正側與負側兩塊原石已加入背包，目前新增 ${savedRecords.length} 筆紀錄。`
            );

        } catch (error) {
            console.error("切割或存檔失敗：", error);

            this.showMessage(
                `切割或存檔失敗：${error.message}`,
                true
            );
        }
    }

    displayResults(result) {
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

        this.resultGroup.add(positive, negative);
        this.scene.add(this.resultGroup);

        this.elements.originalVolume.textContent =
            result.originalVolume.toFixed(4);

        this.elements.positiveVolume.textContent =
            result.positiveVolume.toFixed(4);

        this.elements.negativeVolume.textContent =
            result.negativeVolume.toFixed(4);

        this.elements.removedVolume.textContent =
            result.removedVolume.toFixed(4);

        const total =
            result.positiveVolume +
            result.negativeVolume +
            result.removedVolume;

        const difference = Math.abs(
            result.originalVolume - total
        );

        this.elements.volumeDifference.textContent =
            difference.toFixed(8);

        this.currentView = "results";

        this.resetCamera();
        this.updateViewButtons();
    }

    showOriginal() {
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
        if (!this.currentResult || !this.resultGroup) return;

        this.clearGroup(this.originalGroup);
        this.clearPreview();

        this.originalGroup = null;

        this.scene.add(this.resultGroup);

        this.currentView = "results";

        this.resetCamera();
        this.updateViewButtons();
    }

    updateViewButtons() {
        this.elements.viewOriginal.classList.toggle(
            "active",
            this.currentView === "original"
        );

        this.elements.viewResults.classList.toggle(
            "active",
            this.currentView === "results"
        );

        this.elements.viewResults.disabled = !this.currentResult;
    }

    showMessage(message, isError = false) {
        this.elements.message.textContent = message;
        this.elements.message.classList.toggle("error", isError);
    }

    resetWorkbench() {
        this.currentMesh = structuredClone(testIrregularStone);
        this.currentResult = null;
        this.savedCurrentResult = false;

        this.axis = "x";
        this.cutPosition = 0;
        this.bladeThickness = 0.025;

        this.elements.axis.value = "x";
        this.elements.position.value = "0";
        this.elements.positionValue.textContent = "0.00";

        this.elements.thickness.value = "0.025";
        this.elements.thicknessValue.textContent = "0.025";

        this.elements.results.hidden = true;
        this.elements.cutButton.disabled = false;

        cuttingSystem.setBladeThickness(0.025);

        this.loadOriginalStone();
        this.updatePositionLabel();

        this.showMessage("工作台已重設，已恢復預設原石。");
    }

    resize() {
        if (!this.renderer || !this.camera) return;

        const width = this.elements.viewer.clientWidth;
        const height = this.elements.viewer.clientHeight;

        if (width <= 0 || height <= 0) return;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
    }

    animate() {
        this.animationFrame = requestAnimationFrame(() => {
            this.animate();
        });

        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

export const cuttingUI = new CuttingUI();

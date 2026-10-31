
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";

import { cuttingSystem } from "../systems/cutting-system.js?version=6";
import {
    testIrregularStone,
    testCube
} from "../systems/cutting-test-data.js?version=2";

class CuttingUI {
    constructor() {
        this.initialized = false;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;
        this.animationFrame = null;

        this.currentMesh = structuredClone(testIrregularStone);
        this.currentResult = null;
        this.currentView = "original";

        this.material = null;
        this.positiveMaterial = null;
        this.negativeMaterial = null;
        this.originalGroup = null;
        this.resultGroup = null;

        this.axis = "x";
        this.cutPosition = 0;
        this.bladeThickness = 0.025;

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
        this.animate();

        window.addEventListener("resize", () => this.resize());

        document.addEventListener("cutting:page-opened", () => {
            this.resize();
        });

        console.log("3D 切割工作台初始化完成");
    }

    cacheElements() {
        const ids = [
            "cutting-viewer",
            "cut-axis",
            "cut-position",
            "cut-position-value",
            "blade-thickness",
            "blade-thickness-value",
            "cut-button",
            "reset-cut-button",
            "cutting-message",
            "cutting-results",
            "cut-original-volume",
            "cut-positive-volume",
            "cut-negative-volume",
            "cut-removed-volume",
            "cut-volume-difference",
            "cut-view-original",
            "cut-view-results",
            "cut-test-cube"
        ];

        ids.forEach(id => {
            this.elements[id.replaceAll("-", "_")] =
                document.getElementById(id);
        });
    }

    createScene() {
        const viewer = this.elements.cutting_viewer;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color("#20231e");

        this.camera = new THREE.PerspectiveCamera(
            45,
            viewer.clientWidth / Math.max(viewer.clientHeight, 1),
            0.1,
            100
        );

        this.camera.position.set(4.5, 3.5, 5);

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false
        });

        this.renderer.setPixelRatio(
            Math.min(window.devicePixelRatio, 2)
        );

        this.renderer.setSize(
            viewer.clientWidth,
            viewer.clientHeight
        );

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        viewer.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(
            this.camera,
            this.renderer.domElement
        );

        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.06;
        this.controls.minDistance = 2.5;
        this.controls.maxDistance = 12;

        const ambient = new THREE.AmbientLight(
            0xffffff,
            1.7
        );

        this.scene.add(ambient);

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

        const grid = new THREE.GridHelper(
            8,
            16,
            0x6b694e,
            0x353a30
        );

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
    }

    createMaterials() {
        this.material = new THREE.MeshStandardMaterial({
            color: 0x777b68,
            roughness: 0.78,
            metalness: 0.05,
            flatShading: true
        });

        this.positiveMaterial = new THREE.MeshStandardMaterial({
            color: 0x879b72,
            roughness: 0.68,
            metalness: 0.06,
            flatShading: true
        });

        this.negativeMaterial = new THREE.MeshStandardMaterial({
            color: 0xb59a61,
            roughness: 0.65,
            metalness: 0.08,
            flatShading: true
        });
    }

    meshToGeometry(mesh) {
        const positions = [];

        for (const face of mesh.faces) {
            for (const index of face) {
                const vertex = mesh.vertices[index];

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
            new THREE.Float32BufferAttribute(positions, 3)
        );

        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();

        return geometry;
    }

    createStoneMesh(meshData, material) {
        const geometry = this.meshToGeometry(meshData);

        const mesh = new THREE.Mesh(
            geometry,
            material
        );

        mesh.castShadow = true;
        mesh.receiveShadow = true;

        return mesh;
    }

    clearGroup(group) {
        if (!group) return;

        group.traverse(object => {
            if (object.isMesh) {
                object.geometry.dispose();
            }
        });

        this.scene.remove(group);
    }

    loadOriginalStone() {
        this.clearGroup(this.originalGroup);
        this.clearGroup(this.resultGroup);

        this.originalGroup = new THREE.Group();
        this.resultGroup = null;

        const stone = this.createStoneMesh(
            this.currentMesh,
            this.material
        );

        this.originalGroup.add(stone);
        this.scene.add(this.originalGroup);

        this.currentView = "original";

        this.resetCamera();
        this.showMessage("原石已載入，可以調整切割位置。");
        this.updateViewButtons();
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
        this.clearGroup(this.previewGroup);

        const plane = this.getCutPlane();

        const helper = new THREE.Group();

        const planeGeometry = new THREE.PlaneGeometry(3.2, 3.2);

        const planeMaterial = new THREE.MeshBasicMaterial({
            color: 0xd5b56c,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        const planeMesh = new THREE.Mesh(
            planeGeometry,
            planeMaterial
        );

        planeMesh.position.set(
            plane.point[0],
            plane.point[1],
            plane.point[2]
        );

        if (this.axis === "x") {
            planeMesh.rotation.y = Math.PI / 2;
        } else if (this.axis === "y") {
            planeMesh.rotation.x = Math.PI / 2;
        }

        helper.add(planeMesh);
        this.previewGroup = helper;
        this.scene.add(helper);
    }

    bindEvents() {
        this.elements.cut_axis.addEventListener("change", event => {
            this.axis = event.target.value;
            this.updatePositionLabel();
            this.updateCutPreview();
        });

        this.elements.cut_position.addEventListener("input", event => {
            this.cutPosition = Number(event.target.value);

            this.elements.cut_position_value.textContent =
                this.cutPosition.toFixed(2);

            this.updateCutPreview();
        });

        this.elements.blade_thickness.addEventListener("input", event => {
            this.bladeThickness = Number(event.target.value);

            this.elements.blade_thickness_value.textContent =
                this.bladeThickness.toFixed(3);

            cuttingSystem.setBladeThickness(this.bladeThickness);
        });

        this.elements.cut_button.addEventListener("click", () => {
            this.performCut();
        });

        this.elements.reset_cut_button.addEventListener("click", () => {
            this.resetWorkbench();
        });

        this.elements.cut_view_original.addEventListener("click", () => {
            this.showOriginal();
        });

        this.elements.cut_view_results.addEventListener("click", () => {
            if (this.currentResult) this.showResults();
        });

        this.elements.cut_test_cube.addEventListener("click", () => {
            this.currentMesh = structuredClone(testCube);
            this.currentResult = null;
            this.hideResults();
            this.loadOriginalStone();
            this.showMessage("已載入標準立方體測試素材。");
        });
    }

    updatePositionLabel() {
        const labels = {
            x: "X 軸切割位置",
            y: "Y 軸切割位置",
            z: "Z 軸切割位置"
        };

        const label = document.getElementById("cut-position-label");

        if (label) {
            label.textContent = labels[this.axis];
        }

        this.updateCutPreview();
    }

    performCut() {
        try {
            cuttingSystem.setBladeThickness(this.bladeThickness);

            const result = cuttingSystem.cutStone(
                this.currentMesh,
                this.getCutPlane()
            );

            this.currentResult = result;

            this.displayResults(result);
            this.showResults();

            this.showMessage("切割完成，兩塊原石已成功分離。");
        } catch (error) {
            console.error("切割失敗：", error);
            this.showMessage(`切割失敗：${error.message}`, true);
        }
    }

    displayResults(result) {
        this.clearGroup(this.originalGroup);
        this.clearGroup(this.resultGroup);

        this.originalGroup = null;
        this.resultGroup = new THREE.Group();

        const positive = this.createStoneMesh(
            result.positivePiece,
            this.positiveMaterial
        );

        const negative = this.createStoneMesh(
            result.negativePiece,
            this.negativeMaterial
        );

        positive.position.x = -1.35;
        negative.position.x = 1.35;

        this.resultGroup.add(positive, negative);
        this.scene.add(this.resultGroup);

        this.elements.cut_original_volume.textContent =
            result.originalVolume.toFixed(4);

        this.elements.cut_positive_volume.textContent =
            result.positiveVolume.toFixed(4);

        this.elements.cut_negative_volume.textContent =
            result.negativeVolume.toFixed(4);

        this.elements.cut_removed_volume.textContent =
            result.removedVolume.toFixed(4);

        const total =
            result.positiveVolume +
            result.negativeVolume +
            result.removedVolume;

        const difference = Math.abs(
            result.originalVolume - total
        );

        this.elements.cut_volume_difference.textContent =
            difference.toFixed(8);

        this.currentView = "results";
        this.resetCamera();
        this.updateViewButtons();
    }

    showOriginal() {
        if (!this.currentMesh) return;

        this.clearGroup(this.resultGroup);
        this.clearGroup(this.originalGroup);

        this.resultGroup = null;
        this.originalGroup = new THREE.Group();

        this.originalGroup.add(
            this.createStoneMesh(this.currentMesh, this.material)
        );

        this.scene.add(this.originalGroup);

        this.currentView = "original";
        this.resetCamera();
        this.updateViewButtons();
    }

    showResults() {
        if (!this.currentResult) return;

        if (!this.resultGroup) {
            this.displayResults(this.currentResult);
            return;
        }

        this.clearGroup(this.originalGroup);
        this.originalGroup = null;

        this.scene.add(this.resultGroup);

        this.currentView = "results";
        this.resetCamera();
        this.updateViewButtons();
    }

    updateViewButtons() {
        this.elements.cut_view_original.classList.toggle(
            "active",
            this.currentView === "original"
        );

        this.elements.cut_view_results.classList.toggle(
            "active",
            this.currentView === "results"
        );

        this.elements.cut_view_results.disabled =
            !this.currentResult;
    }

    hideResults() {
        this.elements.cutting_results.hidden = true;
    }

    showMessage(message, isError = false) {
        const element = this.elements.cutting_message;

        element.textContent = message;
        element.classList.toggle("error", isError);
    }

    resetWorkbench() {
        this.currentMesh = structuredClone(testIrregularStone);
        this.currentResult = null;

        this.axis = "x";
        this.cutPosition = 0;
        this.bladeThickness = 0.025;

        this.elements.cut_axis.value = "x";
        this.elements.cut_position.value = "0";
        this.elements.cut_position_value.textContent = "0.00";
        this.elements.blade_thickness.value = "0.025";
        this.elements.blade_thickness_value.textContent = "0.025";

        cuttingSystem.setBladeThickness(0.025);

        this.hideResults();
        this.loadOriginalStone();
        this.updatePositionLabel();

        this.showMessage("工作台已重設，已恢復預設原石。");
    }

    resize() {
        if (!this.renderer || !this.camera) return;

        const viewer = this.elements.cutting_viewer;

        const width = viewer.clientWidth;
        const height = viewer.clientHeight;

        if (!width || !height) return;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
    }

    animate() {
        this.animationFrame = requestAnimationFrame(
            () => this.animate()
        );

        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

export const cuttingUI = new CuttingUI();

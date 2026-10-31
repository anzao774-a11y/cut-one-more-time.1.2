
import * as THREE from "three";
import { OrbitControls } from
    "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";

const RARITY_COLORS = {
    gypsy: 0x9b8065,
    common: 0x849b70,
    rare: 0x659bc0,
    epic: 0xa77bd2,
    legendary: 0xd8b45d
};

export class StonePreview {
    constructor(container) {
        this.container = container;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;
        this.mesh = null;
        this.resizeObserver = null;
        this.animationId = null;
        this.disposed = false;

        this.init();
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color("#20231e");

        this.camera = new THREE.PerspectiveCamera(
            42, 1, 0.1, 100
        );
        this.camera.position.set(3.2, 2.4, 3.8);

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false
        });

        this.renderer.setPixelRatio(
            Math.min(window.devicePixelRatio || 1, 1.5)
        );

        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.container.replaceChildren(this.renderer.domElement);

        this.controls = new OrbitControls(
            this.camera,
            this.renderer.domElement
        );

        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.07;
        this.controls.enablePan = false;
        this.controls.minDistance = 2;
        this.controls.maxDistance = 8;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 1.1;

        this.scene.add(
            new THREE.AmbientLight(0xffffff, 1.6)
        );

        const keyLight = new THREE.DirectionalLight(
            0xffe5b2, 2.5
        );
        keyLight.position.set(4, 5, 4);
        this.scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(
            0x8da5a0, 1.2
        );
        fillLight.position.set(-4, 1, -3);
        this.scene.add(fillLight);

        const rimLight = new THREE.PointLight(
            0xd5b56c, 12, 10
        );
        rimLight.position.set(0, 3, -3);
        this.scene.add(rimLight);

        this.resizeObserver = new ResizeObserver(
            () => this.resize()
        );
        this.resizeObserver.observe(this.container);

        this.resize();
        this.animate();
    }

    setStone(stone) {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
            this.mesh = null;
        }

        const geometryData = stone?.geometry;

        if (
            !geometryData ||
            !Array.isArray(geometryData.vertices) ||
            !Array.isArray(geometryData.faces) ||
            geometryData.vertices.length < 4 ||
            geometryData.faces.length < 4
        ) {
            this.showFallback();
            return false;
        }

        const positions = [];

        for (const face of geometryData.faces) {
            if (
                !Array.isArray(face) ||
                face.length !== 3
            ) {
                continue;
            }

            for (const index of face) {
                const vertex = geometryData.vertices[index];

                if (
                    !Array.isArray(vertex) ||
                    vertex.length !== 3 ||
                    !vertex.every(Number.isFinite)
                ) {
                    this.showFallback();
                    return false;
                }

                positions.push(
                    vertex[0],
                    vertex[1],
                    vertex[2]
                );
            }
        }

        if (positions.length < 36) {
            this.showFallback();
            return false;
        }

        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(
                positions, 3
            )
        );

        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        geometry.center();

        const color =
            RARITY_COLORS[stone.rarity] ?? 0x92917d;

        const material = new THREE.MeshStandardMaterial({
            color,
            roughness: 0.34,
            metalness: 0.08,
            flatShading: true
        });

        this.mesh = new THREE.Mesh(
            geometry,
            material
        );

        this.mesh.rotation.y = 0.35;

        this.scene.add(this.mesh);

        this.controls.target.set(0, 0, 0);
        this.camera.position.set(3.2, 2.4, 3.8);
        this.controls.update();

        return true;
    }

    showFallback() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
            this.mesh = null;
        }

        const geometry = new THREE.IcosahedronGeometry(
            1, 1
        );

        const material = new THREE.MeshStandardMaterial({
            color: 0x777b68,
            roughness: 0.55,
            flatShading: true
        });

        this.mesh = new THREE.Mesh(
            geometry,
            material
        );

        this.scene.add(this.mesh);
    }

    resize() {
        if (!this.renderer || this.disposed) return;

        const width = Math.max(
            1, this.container.clientWidth
        );

        const height = Math.max(
            1, this.container.clientHeight
        );

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
    }

    animate() {
        if (this.disposed) return;

        this.animationId = requestAnimationFrame(
            () => this.animate()
        );

        this.controls.update();
        this.renderer.render(
            this.scene,
            this.camera
        );
    }

    dispose() {
        if (this.disposed) return;

        this.disposed = true;

        cancelAnimationFrame(this.animationId);

        this.resizeObserver?.disconnect();
        this.controls?.dispose();

        if (this.mesh) {
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
            this.scene.remove(this.mesh);
        }

        this.renderer?.dispose();
        this.renderer?.domElement.remove();

        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;
    }
}

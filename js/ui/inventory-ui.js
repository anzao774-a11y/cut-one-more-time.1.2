
import * as THREE from "three";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";

import { inventorySystem } from "../systems/inventory.js";
import { eventBus } from "../core/event-bus.js";

const RARITY_NAMES = {
    gypsy: "吉普賽",
    common: "常見",
    rare: "稀有",
    epic: "史詩",
    legendary: "傳說"
};

const STATUS_NAMES = {
    uncut: "尚未切割",
    cut: "已切割"
};

const RARITY_COLORS = {
    gypsy: 0xaaa18d,
    common: 0x8fae79,
    rare: 0x79a9d2,
    epic: 0xbd8bd5,
    legendary: 0xe3bd70
};

function getElement(id) {
    return document.getElementById(id);
}

function formatNumber(value, digits = 1) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(digits) : "0";
}

function formatDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "未知";
    }

    return date.toLocaleString("zh-TW", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
}

class InventoryUI {
    constructor() {
        this.selectedStoneId = null;
        this.initialized = false;

        this.preview = {
            scene: null,
            camera: null,
            renderer: null,
            controls: null,
            mesh: null,
            animationFrame: null,
            resizeObserver: null,
            container: null,
            geometry: null,
            material: null
        };
    }

    init() {
        if (this.initialized) return;

        this.initialized = true;

        getElement("inventory-status")?.addEventListener(
            "change",
            () => this.render()
        );

        getElement("inventory-rarity")?.addEventListener(
            "change",
            () => this.render()
        );

        getElement("inventory-sort")?.addEventListener(
            "change",
            () => this.render()
        );

        getElement("inventory-list")?.addEventListener(
            "click",
            event => {
                const card = event.target.closest("[data-stone-id]");

                if (card) {
                    this.showDetail(card.dataset.stoneId);
                }
            }
        );

        getElement("inventory-detail-close")?.addEventListener(
            "click",
            () => this.closeDetail()
        );

        eventBus.on("inventory:changed", () => this.render());

        document.addEventListener(
            "inventory:page-opened",
            () => this.render()
        );

        this.render();
    }

    render() {
        this.renderSummary();
        this.renderList();
        this.refreshSelectedStone();
    }

    renderSummary() {
        const summary = inventorySystem.getSummary();

        const values = {
            "inventory-total": summary.total,
            "inventory-uncut": summary.uncut,
            "inventory-cut": summary.cut,
            "inventory-gypsy": summary.byRarity.gypsy,
            "inventory-common": summary.byRarity.common,
            "inventory-rare": summary.byRarity.rare,
            "inventory-epic": summary.byRarity.epic,
            "inventory-legendary": summary.byRarity.legendary
        };

        for (const [id, value] of Object.entries(values)) {
            const element = getElement(id);

            if (element) {
                element.textContent = String(value);
            }
        }
    }

    getFilters() {
        return {
            status: getElement("inventory-status")?.value ?? "all",
            rarity: getElement("inventory-rarity")?.value ?? "all",
            order: getElement("inventory-sort")?.value ?? "newest"
        };
    }

    renderList() {
        const container = getElement("inventory-list");
        if (!container) return;

        const stones = inventorySystem.getSorted(this.getFilters());

        const count = getElement("inventory-result-count");

        if (count) {
            count.textContent = `${stones.length} 塊原石`;
        }

        container.replaceChildren();

        if (stones.length === 0) {
            const empty = document.createElement("div");
            empty.className = "inventory-empty";

            const symbol = document.createElement("span");
            symbol.className = "inventory-empty-symbol";
            symbol.textContent = "◇";

            const title = document.createElement("strong");
            title.textContent = "目前沒有符合條件的原石";

            const description = document.createElement("p");
            description.textContent =
                "前往抽取原石，讓收藏室慢慢豐富起來。";

            empty.append(symbol, title, description);
            container.appendChild(empty);
            return;
        }

        for (const stone of stones) {
            container.appendChild(this.createStoneCard(stone));
        }
    }

    createStoneCard(stone) {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "inventory-card";
        button.dataset.stoneId = stone.id;
        button.dataset.rarity = stone.rarity;

        const visual = document.createElement("div");
        visual.className = "inventory-card-visual";

        const symbol = document.createElement("span");
        symbol.className = "inventory-stone-symbol";
        symbol.textContent = "◆";

        visual.appendChild(symbol);

        const rarity = document.createElement("span");
        rarity.className = "inventory-card-rarity";
        rarity.textContent = RARITY_NAMES[stone.rarity] ?? "未知稀有度";

        const title = document.createElement("strong");
        title.textContent = `${RARITY_NAMES[stone.rarity] ?? "未知"}原石`;

        const status = document.createElement("small");
        status.textContent = STATUS_NAMES[stone.status] ?? "狀態未知";

        const date = document.createElement("small");
        date.textContent = formatDate(stone.obtainedAt);

        button.append(
            visual,
            rarity,
            title,
            status,
            document.createElement("br"),
            date
        );

        return button;
    }

    showDetail(stoneId) {
        const stone = inventorySystem.getById(stoneId);

        if (!stone) {
            this.closeDetail();
            return;
        }

        this.selectedStoneId = stoneId;

        const panel = getElement("inventory-detail");
        if (!panel) return;

        panel.hidden = false;

        getElement("inventory-detail-title").textContent =
            `${RARITY_NAMES[stone.rarity] ?? "未知"}原石`;

        getElement("detail-rarity").textContent =
            RARITY_NAMES[stone.rarity] ?? "未知";

        getElement("detail-status").textContent =
            STATUS_NAMES[stone.status] ?? "狀態未知";

        getElement("detail-date").textContent =
            formatDate(stone.obtainedAt);

        this.renderJadeData(stone.jadeData);
        this.renderStonePreview(stone);

        panel.scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });
    }

    renderStonePreview(stone) {
        const panel = getElement("inventory-detail");

        if (!panel) return;

        let section = getElement("inventory-stone-preview-section");

        if (!section) {
            section = document.createElement("section");
            section.id = "inventory-stone-preview-section";
            section.className = "inventory-stone-preview-section";

            const heading = document.createElement("div");
            heading.className = "inventory-preview-heading";

            const title = document.createElement("h4");
            title.textContent = "原石 3D 外觀";

            const hint = document.createElement("span");
            hint.textContent = "拖曳旋轉・滾輪縮放";

            heading.append(title, hint);

            const container = document.createElement("div");
            container.id = "inventory-stone-preview";
            container.className = "inventory-stone-preview";

            section.append(heading, container);

            const meta = panel.querySelector(".inventory-detail-meta");

            if (meta) {
                meta.after(section);
            } else {
                panel.prepend(section);
            }
        }

        const container = getElement("inventory-stone-preview");

        if (!container) return;

        this.destroyPreview();

        const geometryData = stone.geometry;

        if (
            !geometryData ||
            !Array.isArray(geometryData.vertices) ||
            !Array.isArray(geometryData.faces) ||
            geometryData.vertices.length < 4 ||
            geometryData.faces.length < 4
        ) {
            container.replaceChildren();

            const message = document.createElement("div");
            message.className = "inventory-preview-fallback";
            message.textContent =
                "這塊原石沒有 3D 幾何資料。可能是舊存檔中的原石。";

            container.appendChild(message);
            return;
        }

        this.createPreviewScene(container, stone);
    }

    createPreviewScene(container, stone) {
        const preview = this.preview;

        preview.container = container;

        try {
            preview.scene = new THREE.Scene();
            preview.scene.background = new THREE.Color("#20231e");

            preview.camera = new THREE.PerspectiveCamera(
                42,
                1,
                0.1,
                100
            );

            preview.camera.position.set(3.2, 2.4, 3.6);

            preview.renderer = new THREE.WebGLRenderer({
                antialias: true,
                alpha: false
            });

            preview.renderer.setPixelRatio(
                Math.min(window.devicePixelRatio || 1, 2)
            );

            preview.renderer.outputColorSpace = THREE.SRGBColorSpace;

            container.replaceChildren(preview.renderer.domElement);

            preview.controls = new OrbitControls(
                preview.camera,
                preview.renderer.domElement
            );

            preview.controls.enableDamping = true;
            preview.controls.dampingFactor = 0.06;
            preview.controls.enablePan = false;
            preview.controls.minDistance = 1.8;
            preview.controls.maxDistance = 8;
            preview.controls.autoRotate = true;
            preview.controls.autoRotateSpeed = 1.2;

            preview.scene.add(
                new THREE.AmbientLight(0xffffff, 1.8)
            );

            const keyLight = new THREE.DirectionalLight(
                0xffe2b0,
                3
            );

            keyLight.position.set(4, 5, 5);
            preview.scene.add(keyLight);

            const fillLight = new THREE.DirectionalLight(
                0x9db7a0,
                1.5
            );

            fillLight.position.set(-4, 1, -3);
            preview.scene.add(fillLight);

            const rimLight = new THREE.PointLight(
                0xd5b56c,
                16,
                10
            );

            rimLight.position.set(0, 3, -3);
            preview.scene.add(rimLight);

            preview.geometry = this.createPreviewGeometry(
                stone.geometry
            );

            const color =
                RARITY_COLORS[stone.rarity] ?? 0xaaa18d;

            preview.material = new THREE.MeshStandardMaterial({
                color,
                roughness: 0.48,
                metalness: 0.08,
                flatShading: true
            });

            preview.mesh = new THREE.Mesh(
                preview.geometry,
                preview.material
            );

            preview.mesh.castShadow = true;
            preview.mesh.receiveShadow = true;

            preview.scene.add(preview.mesh);

            const grid = new THREE.GridHelper(
                5,
                10,
                0x6b694e,
                0x353a30
            );

            grid.position.y = -1.2;
            preview.scene.add(grid);

            preview.resizeObserver = new ResizeObserver(() => {
                this.resizePreview();
            });

            preview.resizeObserver.observe(container);

            this.resizePreview();

            const animate = () => {
                if (!preview.renderer) return;

                preview.animationFrame =
                    requestAnimationFrame(animate);

                preview.controls?.update();

                preview.renderer.render(
                    preview.scene,
                    preview.camera
                );
            };

            animate();

        } catch (error) {
            console.error("原石 3D 預覽建立失敗：", error);

            this.destroyPreview();

            container.replaceChildren();

            const message = document.createElement("div");
            message.className = "inventory-preview-fallback";
            message.textContent =
                "3D 預覽暫時無法建立，請重新開啟原石資訊。";

            container.appendChild(message);
        }
    }

    createPreviewGeometry(meshData) {
        const vertices = meshData.vertices;
        const faces = meshData.faces;

        const positions = [];
        const indices = [];

        for (const vertex of vertices) {
            if (
                !Array.isArray(vertex) ||
                vertex.length < 3 ||
                !vertex.slice(0, 3).every(Number.isFinite)
            ) {
                throw new Error("原石頂點資料格式錯誤");
            }

            positions.push(
                vertex[0],
                vertex[1],
                vertex[2]
            );
        }

        for (const face of faces) {
            if (
                !Array.isArray(face) ||
                face.length !== 3 ||
                !face.every(
                    index =>
                        Number.isInteger(index) &&
                        index >= 0 &&
                        index < vertices.length
                )
            ) {
                throw new Error("原石面資料格式錯誤");
            }

            indices.push(face[0], face[1], face[2]);
        }

        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(positions, 3)
        );

        geometry.setIndex(indices);

        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        const center = geometry.boundingBox.getCenter(
            new THREE.Vector3()
        );

        geometry.translate(
            -center.x,
            -center.y,
            -center.z
        );

        const size = geometry.boundingBox.getSize(
            new THREE.Vector3()
        );

        const maxDimension = Math.max(
            size.x,
            size.y,
            size.z,
            0.001
        );

        const scale = 1.8 / maxDimension;

        geometry.scale(scale, scale, scale);

        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();

        return geometry;
    }

    resizePreview() {
        const preview = this.preview;

        if (
            !preview.renderer ||
            !preview.camera ||
            !preview.container
        ) {
            return;
        }

        const width = preview.container.clientWidth;
        const height = preview.container.clientHeight;

        if (width <= 0 || height <= 0) return;

        preview.camera.aspect = width / height;
        preview.camera.updateProjectionMatrix();

        preview.renderer.setSize(width, height);
    }

    destroyPreview() {
        const preview = this.preview;

        if (preview.animationFrame !== null) {
            cancelAnimationFrame(preview.animationFrame);
            preview.animationFrame = null;
        }

        preview.resizeObserver?.disconnect();
        preview.resizeObserver = null;

        preview.controls?.dispose();
        preview.controls = null;

        preview.geometry?.dispose();
        preview.geometry = null;

        preview.material?.dispose();
        preview.material = null;

        if (preview.renderer) {
            preview.renderer.dispose();

            if (preview.renderer.domElement.parentNode) {
                preview.renderer.domElement.parentNode.removeChild(
                    preview.renderer.domElement
                );
            }
        }

        preview.renderer = null;
        preview.scene = null;
        preview.camera = null;
        preview.mesh = null;
        preview.container = null;
    }

    renderJadeData(jadeData) {
        const container = getElement("inventory-jade-list");
        const totalElement = getElement("detail-jade-volume");

        if (!container) return;

        container.replaceChildren();

        if (!jadeData) {
            if (totalElement) {
                totalElement.textContent = "尚無資料";
            }

            const empty = document.createElement("div");
            empty.className = "inventory-detail-empty";
            empty.textContent = "這塊原石沒有內部玉石資料。";

            container.appendChild(empty);
            return;
        }

        if (totalElement) {
            totalElement.textContent =
                `總量 ${formatNumber(jadeData.totalJadeVolume)}%`;
        }

        const masses = Array.isArray(jadeData.masses)
            ? jadeData.masses
            : [];

        if (masses.length === 0) {
            const empty = document.createElement("div");
            empty.className = "inventory-detail-empty";
            empty.textContent = "目前沒有符合保留條件的玉石質量。";

            container.appendChild(empty);
            return;
        }

        for (const mass of masses) {
            container.appendChild(this.createJadeItem(mass));
        }

        if (
            Array.isArray(jadeData.discardedMasses) &&
            jadeData.discardedMasses.length > 0
        ) {
            const note = document.createElement("div");
            note.className = "inventory-detail-empty";
            note.textContent =
                `另有 ${jadeData.discardedMasses.length} 個低於 5% 的獨立質量未列入保留清單。`;

            container.appendChild(note);
        }
    }

    createJadeItem(mass) {
        const item = document.createElement("div");
        item.className = "inventory-jade-item";

        const top = document.createElement("div");
        top.className = "inventory-jade-item-top";

        const name = document.createElement("strong");
        name.textContent = mass.name ?? "未知玉石";

        const volume = document.createElement("span");
        volume.textContent = `${formatNumber(mass.volumePercent)}%`;

        top.append(name, volume);

        const bar = document.createElement("div");
        bar.className = "inventory-jade-bar";

        const fill = document.createElement("div");
        fill.className = "inventory-jade-bar-fill";

        const width = Math.min(
            100,
            Math.max(0, Number(mass.volumePercent) || 0)
        );

        fill.style.width = `${width}%`;
        bar.appendChild(fill);

        const note = document.createElement("div");
        note.className = "inventory-jade-note";

        const rarityName =
            RARITY_NAMES[mass.rarity] ??
            (mass.rarity === "special" ? "特殊" : "未知");

        note.textContent =
            `${rarityName}級・抽中 ${mass.drawCount ?? 1} 次・基礎指數 ${mass.baseIndex ?? 0}`;

        item.append(top, bar, note);

        return item;
    }

    refreshSelectedStone() {
        if (!this.selectedStoneId) return;

        const stone = inventorySystem.getById(this.selectedStoneId);

        if (!stone) {
            this.closeDetail();
            return;
        }

        this.updateDetailWithoutScroll(stone);
    }

    updateDetailWithoutScroll(stone) {
        const panel = getElement("inventory-detail");
        if (!panel) return;

        panel.hidden = false;

        getElement("inventory-detail-title").textContent =
            `${RARITY_NAMES[stone.rarity] ?? "未知"}原石`;

        getElement("detail-rarity").textContent =
            RARITY_NAMES[stone.rarity] ?? "未知";

        getElement("detail-status").textContent =
            STATUS_NAMES[stone.status] ?? "狀態未知";

        getElement("detail-date").textContent =
            formatDate(stone.obtainedAt);

        this.renderJadeData(stone.jadeData);

        const previewContainer = getElement(
            "inventory-stone-preview"
        );

        if (!previewContainer) {
            this.renderStonePreview(stone);
        }
    }

    closeDetail() {
        this.selectedStoneId = null;

        this.destroyPreview();

        const panel = getElement("inventory-detail");

        if (panel) {
            panel.hidden = true;
        }
    }
}

export const inventoryUI = new InventoryUI();

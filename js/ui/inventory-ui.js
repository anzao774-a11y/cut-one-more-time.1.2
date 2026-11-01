import { inventorySystem } from "../systems/inventory.js";
import { eventBus } from "../core/event-bus.js";
import { inventory3DPreview } from "./inventory-3d-preview.js";
import { cuttingUI } from "./cutting-ui.js";
import { saveManager } from "../core/save-manager.js";

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

function getElement(id) {
    return document.getElementById(id);
}

function formatNumber(value, digits = 1) {
    const number = Number(value);

    return Number.isFinite(number)
        ? number.toFixed(digits)
        : "0";
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


// ==========================================
// 幾何資料檢查
// ==========================================

function hasValidGeometry(geometry) {
    if (
        !geometry ||
        !Array.isArray(geometry.vertices) ||
        !Array.isArray(geometry.faces) ||
        geometry.vertices.length < 4 ||
        geometry.faces.length < 4
    ) {
        return false;
    }

    return geometry.vertices.every(vertex =>
        Array.isArray(vertex) &&
        vertex.length === 3 &&
        vertex.every(Number.isFinite)
    ) && geometry.faces.every(face =>
        Array.isArray(face) &&
        face.length === 3 &&
        face.every(index =>
            Number.isInteger(index) &&
            index >= 0 &&
            index < geometry.vertices.length
        )
    );
}


// ==========================================
// 玉料資料檢查
// ==========================================

function hasValidJadeMasses(jadeData) {
    if (!Array.isArray(jadeData?.masses)) {
        return false;
    }

    return jadeData.masses.some(mass =>
        hasValidGeometry(mass?.geometry)
    );
}


class InventoryUI {
    constructor() {
        this.selectedStoneId = null;
        this.initialized = false;

        this.previewStoneId = null;
        this.previewGeometryRef = null;
        this.previewJadeDataRef = null;
    }


    // ==========================================
    // 初始化
    // ==========================================

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
                const card = event.target.closest(
                    "[data-stone-id]"
                );

                if (card) {
                    this.showDetail(card.dataset.stoneId);
                }
            }
        );

        getElement("inventory-detail-close")?.addEventListener(
            "click",
            () => this.closeDetail()
        );

        eventBus.on(
            "inventory:changed",
            () => this.render()
        );

        document.addEventListener(
            "inventory:page-opened",
            () => this.render()
        );

        this.render();
    }


    // ==========================================
    // 更新背包
    // ==========================================

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
            status:
                getElement("inventory-status")?.value ?? "all",

            rarity:
                getElement("inventory-rarity")?.value ?? "all",

            order:
                getElement("inventory-sort")?.value ?? "newest"
        };
    }


    renderList() {
        const container = getElement("inventory-list");

        if (!container) return;

        const stones = inventorySystem.getSorted(
            this.getFilters()
        );

        const count = getElement(
            "inventory-result-count"
        );

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
                "目前收藏清單中沒有符合條件的項目。";

            empty.append(symbol, title, description);

            container.appendChild(empty);

            return;
        }

        for (const stone of stones) {
            container.appendChild(
                this.createStoneCard(stone)
            );
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

        rarity.textContent =
            RARITY_NAMES[stone.rarity] ?? "未知稀有度";

        const title = document.createElement("strong");

        title.textContent =
            `${RARITY_NAMES[stone.rarity] ?? "未知"}原石`;

        const status = document.createElement("small");

        status.textContent =
            stone.consumedByCut
                ? "已作為切割素材使用"
                : STATUS_NAMES[stone.status] ?? "狀態未知";

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


    // ==========================================
    // 開啟詳細資料
    // ==========================================

    showDetail(stoneId) {
        const stone = inventorySystem.getById(stoneId);

        if (!stone) {
            this.closeDetail();
            return;
        }

        // 修復舊切割紀錄的玉料資料。
        this.recoverCutJadeData(stone);

        inventory3DPreview.destroy();

        this.resetPreviewReferences();

        this.selectedStoneId = stoneId;

        const panel = getElement("inventory-detail");

        if (!panel) return;

        panel.hidden = false;

        const title = getElement("inventory-detail-title");

        if (title) {
            title.textContent =
                `${RARITY_NAMES[stone.rarity] ?? "未知"}原石`;
        }

        const rarity = getElement("detail-rarity");

        if (rarity) {
            rarity.textContent =
                RARITY_NAMES[stone.rarity] ?? "未知";
        }

        const status = getElement("detail-status");

        if (status) {
            status.textContent =
                stone.consumedByCut
                    ? "已作為切割素材使用"
                    : STATUS_NAMES[stone.status] ?? "狀態未知";
        }

        const date = getElement("detail-date");

        if (date) {
            date.textContent = formatDate(stone.obtainedAt);
        }

        this.renderJadeData(stone.jadeData);

        this.renderStonePreview(stone);

        panel.scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });
    }


    // ==========================================
    // 修復舊切割紀錄的玉料資料
    // ==========================================

    recoverCutJadeData(stone) {
        if (
            stone?.status !== "cut" ||
            !stone.sourceStoneId ||
            !stone.cutData?.cutPlane
        ) {
            return false;
        }

        // 已經有有效玉石資料，不需要重新計算。
        if (hasValidJadeMasses(stone.jadeData)) {
            return false;
        }

        const sourceStone = inventorySystem.getById(
            stone.sourceStoneId
        );

        if (
            !sourceStone?.geometry ||
            !hasValidJadeMasses(sourceStone.jadeData)
        ) {
            console.warn(
                "無法補回玉料：來源原石沒有有效玉料資料。",
                stone.id
            );

            return false;
        }

        const previousJadeData = stone.jadeData;

        try {
            const savedThickness =
                Number(stone.cutData.bladeThickness);

            const bladeThickness =
                Number.isFinite(savedThickness) &&
                savedThickness >= 0
                    ? savedThickness
                    : 0.025;

            const split = cuttingUI.splitJadeData(
                sourceStone,
                {
                    cutPlane: stone.cutData.cutPlane,
                    bladeThickness
                }
            );

            const recovered = split?.[stone.cutSide];

            if (!hasValidJadeMasses(recovered)) {
                console.warn(
                    "補回完成，但此切割側沒有有效玉石。",
                    stone.id,
                    stone.cutSide
                );

                return false;
            }

            stone.jadeData = recovered;

            const saved = saveManager.save();

            if (!saved) {
                // 存檔失敗時，還原原本的玉料資料。
                if (previousJadeData === undefined) {
                    delete stone.jadeData;
                } else {
                    stone.jadeData = previousJadeData;
                }

                console.warn(
                    "玉料資料補回存檔失敗，已還原原本資料。",
                    stone.id
                );

                return false;
            }

            console.log(
                "成功補回切割產物玉料：",
                stone.id,
                recovered.masses.length
            );

            return true;

        } catch (error) {
            if (previousJadeData === undefined) {
                delete stone.jadeData;
            } else {
                stone.jadeData = previousJadeData;
            }

            console.warn(
                "舊切割紀錄的玉料資料補回失敗：",
                error
            );

            return false;
        }
    }


    // ==========================================
    // 預覽資料紀錄
    // ==========================================

    resetPreviewReferences() {
        this.previewStoneId = null;
        this.previewGeometryRef = null;
        this.previewJadeDataRef = null;
    }


    // ==========================================
    // 3D 預覽
    // ==========================================

    renderStonePreview(stone) {
        const panel = getElement("inventory-detail");

        if (!panel) return;

        let section = getElement(
            "inventory-stone-preview-section"
        );

        if (!section) {
            section = document.createElement("section");

            section.id =
                "inventory-stone-preview-section";

            section.className =
                "inventory-stone-preview-section";

            const heading = document.createElement("div");

            heading.className =
                "inventory-preview-heading";

            const title = document.createElement("h4");

            title.textContent =
                stone.status === "cut"
                    ? "獨立玉石 3D 外觀"
                    : "原石 3D 外觀";

            const hint = document.createElement("span");

            hint.textContent = "拖曳旋轉・滾輪縮放";

            heading.append(title, hint);

            const container = document.createElement("div");

            container.id = "inventory-stone-preview";

            container.className =
                "inventory-stone-preview";

            section.append(heading, container);

            const meta = panel.querySelector(
                ".inventory-detail-meta"
            );

            if (meta) {
                meta.after(section);
            } else {
                panel.prepend(section);
            }

        } else {
            const title = section.querySelector("h4");

            if (title) {
                title.textContent =
                    stone.status === "cut"
                        ? "獨立玉石 3D 外觀"
                        : "原石 3D 外觀";
            }
        }

        const container = getElement(
            "inventory-stone-preview"
        );

        if (!container) return;

        const isCutPiece = stone.status === "cut";

        const validStoneGeometry =
            hasValidGeometry(stone.geometry);

        const validJadeData =
            hasValidJadeMasses(stone.jadeData);

        // 原石需要原石幾何。
        // 切割產物只需要有效的獨立玉石幾何。
        const canPreview = isCutPiece
            ? validJadeData
            : validStoneGeometry;

        if (!canPreview) {
            inventory3DPreview.destroy();

            this.resetPreviewReferences();

            container.replaceChildren();

            const message = document.createElement("div");

            message.className =
                "inventory-preview-fallback";

            message.textContent = isCutPiece
                ? "目前沒有可顯示的獨立玉石資料。"
                : "這塊原石沒有有效的 3D 幾何資料，可能來自舊存檔。";

            container.appendChild(message);

            return;
        }

        const success = inventory3DPreview.mount(
            container,
            stone
        );

        if (success) {
            this.previewStoneId = stone.id;

            this.previewGeometryRef = stone.geometry;

            this.previewJadeDataRef =
                stone.jadeData ?? null;

        } else {
            this.resetPreviewReferences();
        }

        if (!success && !container.firstChild) {
            const message = document.createElement("div");

            message.className =
                "inventory-preview-fallback";

            message.textContent =
                "目前無法顯示 3D 模型，請稍後再試。";

            container.appendChild(message);
        }
    }


    // ==========================================
    // 玉石資料清單
    // ==========================================

    renderJadeData(jadeData) {
        const container = getElement(
            "inventory-jade-list"
        );

        const totalElement = getElement(
            "detail-jade-volume"
        );

        if (!container) return;

        container.replaceChildren();

        if (!jadeData) {
            if (totalElement) {
                totalElement.textContent = "尚無資料";
            }

            const empty = document.createElement("div");

            empty.className =
                "inventory-detail-empty";

            empty.textContent =
                "這塊原石沒有內部玉石資料。";

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

        const validMasses = masses.filter(mass =>
            hasValidGeometry(mass?.geometry)
        );

        if (validMasses.length === 0) {
            const empty = document.createElement("div");

            empty.className =
                "inventory-detail-empty";

            empty.textContent =
                "目前沒有符合保留條件的玉石質量。";

            container.appendChild(empty);

            return;
        }

        for (const mass of validMasses) {
            container.appendChild(
                this.createJadeItem(mass)
            );
        }

        if (
            Array.isArray(jadeData.discardedMasses) &&
            jadeData.discardedMasses.length > 0
        ) {
            const note = document.createElement("div");

            note.className =
                "inventory-detail-empty";

            note.textContent =
                `另有 ${jadeData.discardedMasses.length} 個低於 5% 的獨立質量未列入保留清單。`;

            container.appendChild(note);
        }
    }


    // ==========================================
    // 單筆玉石資料
    // ==========================================

    createJadeItem(mass) {
        const item = document.createElement("div");

        item.className = "inventory-jade-item";

        const top = document.createElement("div");

        top.className = "inventory-jade-item-top";

        const name = document.createElement("strong");

        name.textContent = mass.name ?? "未知玉石";

        const volume = document.createElement("span");

        volume.textContent =
            `${formatNumber(mass.volumePercent)}%`;

        top.append(name, volume);

        const bar = document.createElement("div");

        bar.className = "inventory-jade-bar";

        const fill = document.createElement("div");

        fill.className = "inventory-jade-bar-fill";

        const width = Math.min(
            100,
            Math.max(
                0,
                Number(mass.volumePercent) || 0
            )
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


    // ==========================================
    // 更新目前選取的石頭
    // ==========================================

    refreshSelectedStone() {
        if (!this.selectedStoneId) return;

        const stone = inventorySystem.getById(
            this.selectedStoneId
        );

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

        const title = getElement("inventory-detail-title");

        if (title) {
            title.textContent =
                `${RARITY_NAMES[stone.rarity] ?? "未知"}原石`;
        }

        const rarity = getElement("detail-rarity");

        if (rarity) {
            rarity.textContent =
                RARITY_NAMES[stone.rarity] ?? "未知";
        }

        const status = getElement("detail-status");

        if (status) {
            status.textContent =
                stone.consumedByCut
                    ? "已作為切割素材使用"
                    : STATUS_NAMES[stone.status] ?? "狀態未知";
        }

        const date = getElement("detail-date");

        if (date) {
            date.textContent = formatDate(stone.obtainedAt);
        }

        this.renderJadeData(stone.jadeData);

        const previewContainer = getElement(
            "inventory-stone-preview"
        );

        if (!previewContainer) {
            this.renderStonePreview(stone);
            return;
        }

        const geometryChanged =
            this.previewGeometryRef !== stone.geometry;

        const jadeDataChanged =
            this.previewJadeDataRef !== (stone.jadeData ?? null);

        const stoneChanged =
            this.previewStoneId !== stone.id;

        if (
            geometryChanged ||
            jadeDataChanged ||
            stoneChanged
        ) {
            this.renderStonePreview(stone);
        }
    }


    // ==========================================
    // 關閉詳細資料
    // ==========================================

    closeDetail() {
        this.selectedStoneId = null;

        inventory3DPreview.destroy();

        this.resetPreviewReferences();

        const panel = getElement("inventory-detail");

        if (panel) {
            panel.hidden = true;
        }
    }
}


export const inventoryUI = new InventoryUI();

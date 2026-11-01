
import { inventorySystem } from "../systems/inventory.js";
import { eventBus } from "../core/event-bus.js";
import { inventory3DPreview } from "./inventory-3d-preview.js";

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

class InventoryUI {
    constructor() {
        this.selectedStoneId = null;
        this.initialized = false;
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

        const stones = inventorySystem.getSorted(
            this.getFilters()
        );

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
            STATUS_NAMES[stone.status] ?? "狀態未知";

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

        // 切換物品前先清理上一個 3D 預覽。
        inventory3DPreview.destroy();

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

    /**
     * 建立 3D 預覽容器並交由新控制器管理。
     */
    renderStonePreview(stone) {
        const panel = getElement("inventory-detail");

        if (!panel) return;

        let section = getElement(
            "inventory-stone-preview-section"
        );

        if (!section) {
            section = document.createElement("section");

            section.id = "inventory-stone-preview-section";
            section.className =
                "inventory-stone-preview-section";

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

            const meta = panel.querySelector(
                ".inventory-detail-meta"
            );

            if (meta) {
                meta.after(section);
            } else {
                panel.prepend(section);
            }
        }

        const container = getElement(
            "inventory-stone-preview"
        );

        if (!container) return;

        if (
            !stone.geometry ||
            !Array.isArray(stone.geometry.vertices) ||
            !Array.isArray(stone.geometry.faces) ||
            stone.geometry.vertices.length < 4 ||
            stone.geometry.faces.length < 4
        ) {
            container.replaceChildren();

            const message = document.createElement("div");

            message.className =
                "inventory-preview-fallback";

            message.textContent =
                "這塊原石沒有 3D 幾何資料，可能來自舊存檔。";

            container.appendChild(message);

            return;
        }

        const success = inventory3DPreview.mount(
            container,
            stone
        );

        if (!success && !container.firstChild) {
            const message = document.createElement("div");

            message.className =
                "inventory-preview-fallback";

            message.textContent =
                "目前無法顯示 3D 模型，請稍後再試。";

            container.appendChild(message);
        }
    }

    /**
     * 顯示內部玉石資料。
     */
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

        if (masses.length === 0) {
            const empty = document.createElement("div");

            empty.className = "inventory-detail-empty";
            empty.textContent =
                "目前沒有符合保留條件的玉石質量。";

            container.appendChild(empty);

            return;
        }

        for (const mass of masses) {
            container.appendChild(
                this.createJadeItem(mass)
            );
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

    /**
     * 背包資料更新時，刷新目前選取的物品。
     */
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

        getElement("inventory-detail-title").textContent =
            `${RARITY_NAMES[stone.rarity] ?? "未知"}原石`;

        getElement("detail-rarity").textContent =
            RARITY_NAMES[stone.rarity] ?? "未知";

        getElement("detail-status").textContent =
            STATUS_NAMES[stone.status] ?? "狀態未知";

        getElement("detail-date").textContent =
            formatDate(stone.obtainedAt);

        this.renderJadeData(stone.jadeData);

        // 若目前預覽容器不存在，才重新建立。
        const previewContainer = getElement(
            "inventory-stone-preview"
        );

        if (!previewContainer) {
            this.renderStonePreview(stone);
        }
    }

    /**
     * 關閉詳情並釋放 3D 預覽。
     */
    closeDetail() {
        this.selectedStoneId = null;

        inventory3DPreview.destroy();

        const panel = getElement("inventory-detail");

        if (panel) {
            panel.hidden = true;
        }
    }
}

export const inventoryUI = new InventoryUI();

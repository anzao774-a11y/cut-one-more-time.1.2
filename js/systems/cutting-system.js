import { inventorySystem } from "../systems/inventory.js";
import { inventoryUI } from "./inventory-ui.js";
import { cuttingUI } from "./cutting-ui.js";
import { navigation } from "./navigation.js";
import { eventBus } from "../core/event-bus.js";


class CuttingInventoryBridge {
    constructor() {
        this.initialized = false;
        this.originalMethods = {};
        this.inventoryChangedHandler = null;
    }

    init() {
        if (this.initialized) return;

        this.initialized = true;

        this.patchStoneSelector();
        this.patchWorkbenchReset();
        this.patchInventoryDetail();

        this.inventoryChangedHandler = () => {
            cuttingUI.refreshStoneSelector();
        };

        eventBus.on(
            "inventory:changed",
            this.inventoryChangedHandler
        );

        cuttingUI.refreshStoneSelector();

        console.log("背包與切割工作台連接完成");
    }


    // ==========================================
    // 工作台素材選單
    // ==========================================

    patchStoneSelector() {
        if (this.originalMethods.refreshStoneSelector) {
            return;
        }

        this.originalMethods.refreshStoneSelector =
            cuttingUI.refreshStoneSelector.bind(cuttingUI);

        cuttingUI.refreshStoneSelector = () => {
            const select = cuttingUI.elements.stoneSelect;

            if (!select) return;

            const previousId = cuttingUI.currentStoneId;
            const stones = inventorySystem.getCuttable();

            select.replaceChildren();

            const placeholder =
                document.createElement("option");

            placeholder.value = "";
            placeholder.textContent = "請選擇背包中的原石";

            select.appendChild(placeholder);

            for (const stone of stones) {
                const option =
                    document.createElement("option");

                option.value = stone.id;

                const rarity =
                    stone.rarityName ??
                    stone.rarity ??
                    "未知稀有度";

                const name =
                    stone.name ??
                    "未命名原石";

                const pieceLabel =
                    stone.status === "cut"
                        ? "（切割產物）"
                        : "（未切割）";

                option.textContent =
                    `${rarity}｜${name}${pieceLabel}`;

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

            cuttingUI.updateStoneInfo(
                stones.length > 0
                    ? `目前有 ${stones.length} 件可以切割的素材。`
                    : "目前沒有可以切割的背包素材。"
            );
        };
    }


    // ==========================================
    // 工作台重設
    // ==========================================

    patchWorkbenchReset() {
        if (this.originalMethods.resetWorkbench) {
            return;
        }

        this.originalMethods.resetWorkbench =
            cuttingUI.resetWorkbench.bind(cuttingUI);

        cuttingUI.resetWorkbench = () => {
            this.originalMethods.resetWorkbench();

            // 原本 resetWorkbench 會優先載入未切割原石。
            // 若沒有未切割原石，才嘗試載入可繼續切割的產物。
            if (!cuttingUI.isTestMode) {
                return;
            }

            const stones = inventorySystem.getCuttable();

            const nextStone = stones.find(
                stone => stone.status === "cut"
            );

            if (!nextStone) {
                return;
            }

            const loaded = cuttingUI.selectInventoryStone(
                nextStone.id
            );

            if (!loaded) {
                return;
            }

            cuttingUI.updateStoneInfo(
                `目前選擇：${nextStone.name ?? "未命名素材"}｜切割產物`
            );

            cuttingUI.showMessage(
                "工作台已載入背包中的切割產物，可以繼續切割。"
            );
        };
    }


    // ==========================================
    // 背包詳細資料按鈕
    // ==========================================

    patchInventoryDetail() {
        if (this.originalMethods.showDetail) {
            return;
        }

        this.originalMethods.showDetail =
            inventoryUI.showDetail.bind(inventoryUI);

        inventoryUI.showDetail = stoneId => {
            this.originalMethods.showDetail(stoneId);

            this.renderWorkbenchButton(stoneId);
        };
    }


    // ==========================================
    // 送往切割工作台按鈕
    // ==========================================

    renderWorkbenchButton(stoneId) {
        const panel =
            document.getElementById("inventory-detail");

        if (!panel) return;

        const stone = inventorySystem.getById(stoneId);

        if (!stone) return;

        let button = document.getElementById(
            "send-stone-to-cutting"
        );

        if (!button) {
            button = document.createElement("button");

            button.id = "send-stone-to-cutting";
            button.type = "button";

            button.style.cssText = `
                display: block;
                width: 100%;
                margin-top: 14px;
                padding: 12px 16px;
                border: 1px solid rgba(198,164,92,0.5);
                border-radius: 8px;
                background: #34392d;
                color: #e8d7a7;
                font: inherit;
                font-weight: 600;
                cursor: pointer;
            `;

            const previewSection = panel.querySelector(
                "#inventory-stone-preview-section"
            );

            if (previewSection) {
                previewSection.after(button);
            } else {
                panel.appendChild(button);
            }
        }

        const canCut = inventorySystem.isCuttable(stone);

        button.disabled = !canCut;

        button.textContent = canCut
            ? "送往切割工作台"
            : stone.consumedByCut
                ? "此素材已完成再次切割"
                : "目前無法切割此素材";

        button.style.opacity = canCut ? "1" : "0.55";
        button.style.cursor = canCut ? "pointer" : "not-allowed";

        button.onclick = () => {
            if (!inventorySystem.isCuttable(stone)) {
                cuttingUI.showMessage(
                    "此素材已經被消耗，或缺少有效的幾何資料。",
                    true
                );

                return;
            }

            navigation.navigate("cutting");

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const loaded =
                        cuttingUI.selectInventoryStone(stoneId);

                    if (loaded) {
                        cuttingUI.showMessage(
                            `已從背包載入「${stone.name ?? "原石"}」，可以開始切割。`
                        );
                    } else {
                        cuttingUI.showMessage(
                            "素材載入失敗，請確認素材資料是否有效。",
                            true
                        );
                    }
                });
            });
        };
    }
}


export const cuttingInventoryBridge =
    new CuttingInventoryBridge();

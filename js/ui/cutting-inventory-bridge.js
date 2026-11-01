// js/ui/cutting-inventory-bridge.js

import { inventorySystem } from "../systems/inventory.js";
import { inventoryUI } from "./inventory-ui.js";
import { cuttingUI } from "./cutting-ui.js";
import { navigation } from "./navigation.js";
import { eventBus } from "../core/event-bus.js";


class CuttingInventoryBridge {
    constructor() {
        this.initialized = false;
        this.originalShowDetail = null;
        this.inventoryChangedHandler = null;
    }


    // ==========================================
    // 初始化
    // ==========================================

    init() {
        if (this.initialized) return;

        this.initialized = true;

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
    // 背包詳細資料
    // ==========================================

    patchInventoryDetail() {
        if (this.originalShowDetail) return;

        this.originalShowDetail =
            inventoryUI.showDetail.bind(inventoryUI);

        inventoryUI.showDetail = stoneId => {
            this.originalShowDetail(stoneId);

            this.renderWorkbenchButton(stoneId);
        };
    }


    // ==========================================
    // 建立送往工作台按鈕
    // ==========================================

    renderWorkbenchButton(stoneId) {
        const panel = document.getElementById(
            "inventory-detail"
        );

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


        // ------------------------------
        // 更新按鈕狀態
        // ------------------------------

        const canCut = inventorySystem.isCuttable(stone);

        button.disabled = !canCut;

        button.style.opacity = canCut
            ? "1"
            : "0.45";

        button.style.cursor = canCut
            ? "pointer"
            : "not-allowed";

        button.textContent = canCut
            ? (
                stone.status === "cut"
                    ? "再次切割此產物"
                    : "送往切割工作台"
            )
            : "目前無法再次切割";


        // ------------------------------
        // 綁定按鈕事件
        // ------------------------------

        button.onclick = () => {
            const latestStone = inventorySystem.getById(
                stoneId
            );

            if (
                !latestStone ||
                !inventorySystem.isCuttable(latestStone)
            ) {
                cuttingUI.showMessage(
                    "此素材已經無法切割，請重新選擇。",
                    true
                );

                this.renderWorkbenchButton(stoneId);

                return;
            }

            // 先切換至工作台頁面。
            navigation.navigate("cutting");

            // 等待頁面顯示與尺寸更新完成。
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const loaded =
                        cuttingUI.selectInventoryStone(
                            stoneId
                        );

                    if (loaded) {
                        const label =
                            latestStone.name ?? "未命名原石";

                        cuttingUI.showMessage(
                            latestStone.status === "cut"
                                ? `已載入切割產物「${label}」，可以再次切割。`
                                : `已載入「${label}」，可以開始切割。`
                        );
                    } else {
                        cuttingUI.showMessage(
                            "無法載入指定素材，請重新整理背包後再試。",
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

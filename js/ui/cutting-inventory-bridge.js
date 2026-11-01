
import { inventorySystem } from "../systems/inventory.js";
import { inventoryUI } from "./inventory-ui.js";
import { cuttingUI } from "./cutting-ui.js";
import { navigation } from "./navigation.js";
import { saveManager } from "../core/save-manager.js";
import { eventBus } from "../core/event-bus.js";


class CuttingInventoryBridge {
    constructor() {
        this.initialized = false;
        this.originalMethods = {};
    }

    init() {
        if (this.initialized) return;

        this.initialized = true;

        this.patchStoneSelector();
        this.patchStoneSelection();
        this.patchCutting();
        this.patchWorkbenchReset();
        this.patchInventoryDetail();

        eventBus.on("inventory:changed", () => {
            cuttingUI.refreshStoneSelector();
        });

        cuttingUI.refreshStoneSelector();

        console.log("背包與切割工作台連接完成");
    }


    // ==========================================
    // 工作台原石選單
    // ==========================================

    patchStoneSelector() {
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
                    ? `目前有 ${stones.length} 塊可以繼續切割的原石。`
                    : "目前沒有可以切割的背包原石。"
            );
        };
    }


    // ==========================================
    // 允許選取切割產物
    // ==========================================

    patchStoneSelection() {
        this.originalMethods.selectInventoryStone =
            cuttingUI.selectInventoryStone.bind(cuttingUI);

        cuttingUI.selectInventoryStone = stoneId => {
            const stone = inventorySystem.getById(stoneId);

            if (!stone) {
                return this.originalMethods
                    .selectInventoryStone(stoneId);
            }

            if (stone.status !== "cut") {
                return this.originalMethods
                    .selectInventoryStone(stoneId);
            }

            const originalStatus = stone.status;

            try {
                // 暫時開放原本已切割的產物供選取。
                stone.status = "uncut";

                return this.originalMethods
                    .selectInventoryStone(stoneId);

            } finally {
                // 選取完成後恢復背包中的真實狀態。
                stone.status = originalStatus;
            }
        };
    }


    // ==========================================
    // 切割與存檔
    // ==========================================

    patchCutting() {
        this.originalMethods.saveCutPieces =
            cuttingUI.saveCutPieces.bind(cuttingUI);

        cuttingUI.saveCutPieces = (...args) => {
            const result = args[0];

            const sourceStone =
                inventorySystem.getById(
                    cuttingUI.currentStoneId
                );

            const previousIds = [
                ...(sourceStone?.cutResultIds ?? [])
            ];

            // 保留原本的所有參數，包含預先計算的 jadeSplit。
            const records =
                this.originalMethods.saveCutPieces(...args);

            if (sourceStone && previousIds.length > 0) {
                const currentIds =
                    sourceStone.cutResultIds ?? [];

                sourceStone.cutResultIds = [
                    ...new Set([
                        ...previousIds,
                        ...currentIds
                    ])
                ];

                saveManager.save();
            }

            return records;
        };


        this.originalMethods.performCut =
            cuttingUI.performCut.bind(cuttingUI);

        cuttingUI.performCut = () => {
            if (
                cuttingUI.isTestMode ||
                !cuttingUI.currentStoneId
            ) {
                return this.originalMethods.performCut();
            }

            const stone = inventorySystem.getById(
                cuttingUI.currentStoneId
            );

            if (!stone || stone.status !== "cut") {
                return this.originalMethods.performCut();
            }

            const originalStatus = stone.status;
            const wasAlreadySaved =
                cuttingUI.savedCurrentResult;

            try {
                // 暫時開放切割產物進入原本的切割流程。
                stone.status = "uncut";

                return this.originalMethods.performCut();

            } finally {
                const cutSucceeded =
                    !wasAlreadySaved &&
                    cuttingUI.savedCurrentResult === true;

                /*
                 * 成功時由原本的 saveCutPieces
                 * 負責設定狀態與保存結果。
                 *
                 * 失敗或提早中止時，恢復原始狀態，
                 * 避免把未成功切割的石頭錯誤標記。
                 */
                if (!cutSucceeded) {
                    stone.status = originalStatus;
                }

                saveManager.save();

                inventorySystem.notifyChanged();
            }
        };
    }


    // ==========================================
    // 重設工作台
    // ==========================================

    patchWorkbenchReset() {
        this.originalMethods.resetWorkbench =
            cuttingUI.resetWorkbench.bind(cuttingUI);

        cuttingUI.resetWorkbench = () => {
            this.originalMethods.resetWorkbench();

            if (cuttingUI.isTestMode) {
                const stones =
                    inventorySystem.getCuttable();

                const nextStone = stones.find(
                    stone => stone.status === "cut"
                );

                if (nextStone) {
                    cuttingUI.selectInventoryStone(
                        nextStone.id
                    );

                    cuttingUI.updateStoneInfo(
                        "已載入切割產物，可以繼續切割。"
                    );

                    cuttingUI.showMessage(
                        "已載入背包中的切割產物。"
                    );
                }
            }
        };
    }


    // ==========================================
    // 背包詳細資料按鈕
    // ==========================================

    patchInventoryDetail() {
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

            button.textContent = "送往切割工作台";

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

        button.onclick = () => {
            navigation.navigate("cutting");

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const loaded =
                        cuttingUI.selectInventoryStone(stoneId);

                    if (loaded) {
                        cuttingUI.showMessage(
                            `已從背包載入「${stone.name ?? "原石"}」，可以開始切割。`
                        );
                    }
                });
            });
        };
    }
}


export const cuttingInventoryBridge =
    new CuttingInventoryBridge();

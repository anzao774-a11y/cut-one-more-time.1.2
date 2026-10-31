
import { saveManager } from "./core/save-manager.js";
import { eventBus } from "./core/event-bus.js";

import { navigation } from "./ui/navigation.js";
import { gachaUI } from "./ui/gacha-ui.js";
import { settingsUI } from "./ui/settings-ui.js";
import { inventoryUI } from "./ui/inventory-ui.js";

function updateGoldDisplay(gold) {
    const element = document.getElementById("gold-balance");

    if (element) {
        element.textContent = Number(gold).toLocaleString("en-US");
    }
}

function initializeGame() {
    const saveData = saveManager.load();

    // 確保舊存檔也有抽卡保底資料。
    saveData.gachaPity ??= {
        epic: 0,
        legendary: 0
    };

    // 確保背包資料存在。
    saveData.inventory ??= [];

    // 確保統計資料存在。
    saveData.statistics ??= {
        totalPulls: 0,
        totalCuts: 0
    };

    saveManager.save();

    updateGoldDisplay(saveData.gold);

    eventBus.on("gold:changed", updateGoldDisplay);

    navigation.init();
    gachaUI.init();
    settingsUI.init();
    inventoryUI.init();

    console.log("再切一刀就好：原石背包系統初始化完成");
}

initializeGame();

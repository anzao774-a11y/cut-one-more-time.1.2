
import { saveManager } from "./core/save-manager.js";
import { eventBus } from "./core/event-bus.js";

import { navigation } from "./ui/navigation.js";
import { gachaUI } from "./ui/gacha-ui.js";
import { settingsUI } from "./ui/settings-ui.js";
import { inventoryUI } from "./ui/inventory-ui.js";
import { cuttingUI } from "./ui/cutting-ui.js";
import { cuttingInventoryBridge } from "./ui/cutting-inventory-bridge.js";

import { audioSystem } from "./systems/audio-system.js";
import { workshopProgression } from "./systems/workshop-progression.js";

function updateGoldDisplay(gold) {
    const element = document.getElementById("gold-balance");

    if (element) {
        element.textContent =
            Number(gold).toLocaleString("en-US");
    }
}

function initializeAudio() {
    const unlockAudio = () => {
        audioSystem.unlock();

        document.removeEventListener(
            "pointerdown",
            unlockAudio
        );

        document.removeEventListener(
            "keydown",
            unlockAudio
        );
    };

    document.addEventListener(
        "pointerdown",
        unlockAudio
    );

    document.addEventListener(
        "keydown",
        unlockAudio
    );
}

function initializeGame() {
    const saveData = saveManager.load();

    saveData.gachaPity ??= {
        epic: 0,
        legendary: 0
    };

    saveData.inventory ??= [];

    saveData.statistics ??= {
        totalPulls: 0,
        totalCuts: 0,
        totalJadeFound: 0,
        totalJadeSold: 0,
        totalCrafts: 0,
        totalGoldEarned: 0,
        totalGoldSpent: 0
    };

    workshopProgression.getDailyEvent();
    workshopProgression.checkAchievements();

    saveManager.save();

    updateGoldDisplay(saveData.gold);

    eventBus.on(
        "gold:changed",
        updateGoldDisplay
    );

    initializeAudio();

    navigation.init();

    gachaUI.init();

    settingsUI.init();

    inventoryUI.init();

    cuttingUI.init();

    cuttingInventoryBridge.init();

    console.log(
        "再切一刀就好：核心系統初始化完成"
    );
}

initializeGame();


import { saveManager } from "./core/save-manager.js";
import { eventBus } from "./core/event-bus.js";
import { navigation } from "./ui/navigation.js";

function updateGoldDisplay(gold) {
    const element = document.getElementById("gold-balance");

    if (element) {
        element.textContent = gold.toLocaleString("en-US");
    }
}

function initializeGame() {
    const saveData = saveManager.load();

    updateGoldDisplay(saveData.gold);

    eventBus.on("gold:changed", updateGoldDisplay);

    navigation.init();

    console.log("再切一刀就好：遊戲初始化完成");
}

initializeGame();

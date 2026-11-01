// js/main.js

import { saveManager } from "./core/save-manager.js";
import { eventBus } from "./core/event-bus.js";

import { navigation } from "./ui/navigation.js";
import { gachaUI } from "./ui/gacha-ui.js";
import { settingsUI } from "./ui/settings-ui.js";
import { inventoryUI } from "./ui/inventory-ui.js";
import { cuttingUI } from "./ui/cutting-ui.js";

// 切割視覺強化模組
import "./ui/cutting-result-visuals.js";

import { cuttingInventoryBridge } from "./ui/cutting-inventory-bridge.js";
import { workshopUI } from "./ui/workshop-ui.js";

import { audioSystem } from "./systems/audio-system.js";
import { workshopProgression } from "./systems/workshop-progression.js";


// ==========================================
// 金幣顯示
// ==========================================

function updateGoldDisplay(gold) {
    const element = document.getElementById("gold-balance");

    if (!element) return;

    const amount = Number(gold);

    element.textContent = (
        Number.isFinite(amount) ? amount : 0
    ).toLocaleString("en-US");
}


// ==========================================
// 安全初始化
// ==========================================

function initializeSafely(name, callback) {
    try {
        callback();

        console.log(`[初始化成功] ${name}`);

        return true;

    } catch (error) {
        console.error(
            `[初始化失敗] ${name}`,
            error
        );

        return false;
    }
}


// ==========================================
// 音效初始化
// ==========================================

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


// ==========================================
// 存檔資料初始化
// ==========================================

function initializeSaveData() {
    const saveData = saveManager.load();

    if (
        !saveData ||
        typeof saveData !== "object"
    ) {
        throw new Error("無法取得有效的遊戲存檔資料。");
    }

    // ------------------------------
    // 原石與物品資料
    // ------------------------------

    const arrayFields = [
        "inventory",
        "collection",
        "products",
        "museum",
        "dex",
        "achievements"
    ];

    for (const field of arrayFields) {
        if (!Array.isArray(saveData[field])) {
            saveData[field] = [];
        }
    }


    // ------------------------------
    // 抽取保底資料
    // ------------------------------

    saveData.gachaPity ??= {
        epic: 0,
        legendary: 0
    };


    // ------------------------------
    // 玩家資料
    // ------------------------------

    saveData.player ??= {
        level: 1,
        exp: 0,
        totalExp: 0
    };


    // ------------------------------
    // 小黑貓資料
    // ------------------------------

    saveData.cat ??= {
        affection: 0,
        normalFeedCount: 0,
        premiumGiftCount: 0,
        lastNormalFeed: null,
        lastPremiumGift: null
    };


    // ------------------------------
    // 市場資料
    // ------------------------------

    saveData.market ??= {
        lastRefresh: null,
        dailyEvent: null,
        transactionCount: 0
    };


    // ------------------------------
    // 統計資料
    // ------------------------------

    saveData.statistics ??= {
        totalPulls: 0,
        totalCuts: 0,
        totalJadeFound: 0,
        totalJadeSold: 0,
        totalCrafts: 0,
        totalGoldEarned: 0,
        totalGoldSpent: 0
    };

    const statisticDefaults = {
        totalPulls: 0,
        totalCuts: 0,
        totalJadeFound: 0,
        totalJadeSold: 0,
        totalCrafts: 0,
        totalGoldEarned: 0,
        totalGoldSpent: 0
    };

    for (const [key, value] of Object.entries(statisticDefaults)) {
        if (!Number.isFinite(Number(saveData.statistics[key]))) {
            saveData.statistics[key] = value;
        }
    }


    // ------------------------------
    // 金幣資料
    // ------------------------------

    if (!Number.isFinite(Number(saveData.gold))) {
        saveData.gold = 0;
    }

    return saveData;
}


// ==========================================
// 全域事件初始化
// ==========================================

function initializeGlobalEvents(saveData) {
    updateGoldDisplay(saveData.gold);

    eventBus.on(
        "gold:changed",
        updateGoldDisplay
    );
}


// ==========================================
// 工坊進度初始化
// ==========================================

function initializeProgression() {
    workshopProgression.getDailyEvent();

    workshopProgression.checkAchievements();
}


// ==========================================
// 存檔初始化
// ==========================================

function initializeSave() {
    const saved = saveManager.save();

    if (!saved) {
        throw new Error(
            "遊戲存檔無法寫入瀏覽器，請檢查儲存空間或瀏覽器設定。"
        );
    }
}


// ==========================================
// 遊戲啟動錯誤提示
// ==========================================

function showStartupError(message) {
    const existing = document.getElementById(
        "game-startup-error"
    );

    if (existing) return;

    const container = document.createElement("div");

    container.id = "game-startup-error";

    container.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(23, 25, 22, 0.97);
        color: #f0d7b0;
        font-family: sans-serif;
        text-align: center;
    `;

    const content = document.createElement("div");

    content.style.cssText = `
        width: 100%;
        max-width: 440px;
        padding: 28px;
        border: 1px solid rgba(198, 164, 92, 0.4);
        border-radius: 12px;
        background: #252923;
    `;

    const title = document.createElement("h2");

    title.textContent = "工坊啟動失敗";

    const description = document.createElement("p");

    description.textContent = message;

    const reloadButton = document.createElement("button");

    reloadButton.type = "button";
    reloadButton.textContent = "重新整理";

    reloadButton.style.cssText = `
        margin-top: 16px;
        padding: 10px 24px;
        border: none;
        border-radius: 6px;
        background: #c6a45c;
        color: #171916;
        font-size: 15px;
        cursor: pointer;
    `;

    reloadButton.addEventListener("click", () => {
        window.location.reload();
    });

    content.append(
        title,
        description,
        reloadButton
    );

    container.appendChild(content);

    document.body.appendChild(container);
}


// ==========================================
// 遊戲初始化
// ==========================================

function initializeGame() {
    console.log("================================");
    console.log("再切一刀就好：開始初始化");
    console.log("================================");


    // ------------------------------
    // 1. 載入存檔
    // ------------------------------

    let saveData;

    try {
        saveData = initializeSaveData();

    } catch (error) {
        console.error(
            "遊戲存檔載入失敗：",
            error
        );

        showStartupError(
            "無法載入遊戲資料，請重新整理頁面。"
        );

        return;
    }


    // ------------------------------
    // 2. 保存初始化資料
    // ------------------------------

    initializeSafely(
        "存檔保存",
        initializeSave
    );


    // ------------------------------
    // 3. 全域事件
    // ------------------------------

    initializeSafely(
        "全域事件",
        () => initializeGlobalEvents(saveData)
    );


    // ------------------------------
    // 4. 工坊進度
    // ------------------------------

    initializeSafely(
        "工坊進度",
        initializeProgression
    );


    // ------------------------------
    // 5. 音效系統
    // ------------------------------

    initializeSafely(
        "音效系統",
        initializeAudio
    );


    // ------------------------------
    // 6. 頁面導覽
    // ------------------------------

    initializeSafely(
        "頁面導覽",
        () => navigation.init()
    );


    // ------------------------------
    // 7. 原石抽取
    // ------------------------------

    initializeSafely(
        "原石抽取",
        () => gachaUI.init()
    );


    // ------------------------------
    // 8. 工坊設定
    // ------------------------------

    initializeSafely(
        "工坊設定",
        () => settingsUI.init()
    );


    // ------------------------------
    // 9. 原石背包
    // ------------------------------

    initializeSafely(
        "原石背包",
        () => inventoryUI.init()
    );


    // ------------------------------
    // 10. 切割工作台
    // ------------------------------

    const cuttingInitialized = initializeSafely(
        "切割工作台",
        () => cuttingUI.init()
    );


    // ------------------------------
    // 11. 背包與切割工作台連接
    // ------------------------------

    initializeSafely(
        "背包與切割工作台連接",
        () => cuttingInventoryBridge.init()
    );


    // ------------------------------
    // 12. 工坊其他功能
    // ------------------------------

    initializeSafely(
        "工坊其他功能",
        () => workshopUI.init()
    );


    // ------------------------------
    // 13. 完成初始化
    // ------------------------------

    console.log("================================");

    if (cuttingInitialized) {
        console.log(
            "切割工作台初始化成功。"
        );
    } else {
        console.warn(
            "切割工作台初始化失敗，其他系統仍會繼續運作。"
        );
    }

    console.log(
        "再切一刀就好：初始化流程結束"
    );

    console.log("================================");
}


// ==========================================
// 啟動入口
// ==========================================

function startGame() {
    initializeSafely(
        "遊戲啟動",
        initializeGame
    );
}


if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        startGame,
        { once: true }
    );
} else {
    startGame();
}

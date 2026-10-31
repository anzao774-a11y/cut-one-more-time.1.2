
// js/systems/gacha.js

import { GAME_CONFIG } from "../config/game-config.js";
import { saveManager } from "../core/save-manager.js";
import { eventBus } from "../core/event-bus.js";
import { jadeGenerator } from "./jade-generator.js";

import {
    stoneGeometryGenerator
} from "./stone-geometry-generator.js";


// =====================================
// 稀有度設定
// =====================================

const RARITIES = [
    { id: "gypsy", name: "吉普賽", weight: 55, level: 1 },
    { id: "common", name: "常見", weight: 27, level: 2 },
    { id: "rare", name: "稀有", weight: 13, level: 3 },
    { id: "epic", name: "史詩", weight: 4.5, level: 4 },
    { id: "legendary", name: "傳說", weight: 0.5, level: 5 }
];


// =====================================
// ID 與種子
// =====================================

function createId() {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }

    return `stone-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createSeed() {
    if (globalThis.crypto?.getRandomValues) {
        const values = new Uint32Array(1);
        globalThis.crypto.getRandomValues(values);
        return values[0];
    }

    return Math.floor(Math.random() * 4294967296);
}


// =====================================
// 保底資料
// =====================================

function getPity(data) {
    if (!data.gachaPity) {
        data.gachaPity = {
            epic: 0,
            legendary: 0
        };
    }

    return data.gachaPity;
}


// =====================================
// 抽卡機率
// =====================================

function weightedRarity() {
    const roll = Math.random() * 100;
    let total = 0;

    for (const rarity of RARITIES) {
        total += rarity.weight;

        if (roll < total) {
            return rarity;
        }
    }

    return RARITIES[0];
}

function pickRarity(pity, forceEpic = false) {
    // 傳說保底優先於史詩保底。
    if (
        pity.legendary >=
        GAME_CONFIG.gacha.legendaryPity - 1
    ) {
        return RARITIES[4];
    }

    // 史詩保底或十連抽第十抽保證。
    if (
        forceEpic ||
        pity.epic >= GAME_CONFIG.gacha.epicPity - 1
    ) {
        const roll = Math.random();

        return roll < 0.1
            ? RARITIES[4]
            : RARITIES[3];
    }

    return weightedRarity();
}


// =====================================
// 建立原石
// =====================================

function createStone(rarity) {
    const id = createId();

    // 每塊原石都擁有自己的固定種子。
    const shapeSeed = createSeed();
    const textureSeed = createSeed();

    // 抽卡時立即生成原石幾何。
    const generatedGeometry =
        stoneGeometryGenerator.generate(
            rarity.id,
            shapeSeed
        );

    const stone = {
        id,

        rarity: rarity.id,
        rarityName: rarity.name,
        level: rarity.level,

        obtainedAt: new Date().toISOString(),

        status: "uncut",

        // 原石外觀生成資訊。
        appearance: {
            shapeSeed,
            textureSeed,
            generatorVersion: 1
        },

        // 原石三維模型。
        geometry: {
            vertices: generatedGeometry.vertices,
            faces: generatedGeometry.faces,
            metadata: generatedGeometry.metadata
        }
    };

    // 抽到原石時，立即生成內部玉石資料。
    stone.jadeData = jadeGenerator.generate(stone);

    return stone;
}


// =====================================
// 抽卡系統
// =====================================

class GachaSystem {
    pull(count) {
        if (count !== 1 && count !== 10) {
            return {
                success: false,
                message: "抽取數量不正確。"
            };
        }

        const cost = count === 1
            ? GAME_CONFIG.gacha.singleCost
            : GAME_CONFIG.gacha.tenPullCost;

        const original = saveManager.getData();
        const snapshot = structuredClone(original);

        if (original.gold < cost) {
            return {
                success: false,
                message: "金幣不足，無法抽取原石。"
            };
        }

        const data = original;
        const pity = getPity(data);

        data.gold -= cost;

        const results = [];

        for (let index = 0; index < count; index++) {
            // 十連抽第十抽檢查是否已有史詩或傳說。
            const hasEpicOrHigher = results.some(
                item => item.level >= 4
            );

            const forceEpic =
                count === 10 &&
                index === 9 &&
                !hasEpicOrHigher;

            const rarity = pickRarity(
                pity,
                forceEpic
            );

            const stone = createStone(rarity);

            results.push(stone);

            data.statistics ??= {
                totalPulls: 0,
                totalCuts: 0
            };

            data.statistics.totalPulls += 1;

            // 史詩或傳說會重置史詩保底。
            if (rarity.level >= 4) {
                pity.epic = 0;
            } else {
                pity.epic += 1;
            }

            // 只有傳說會重置傳說保底。
            if (rarity.level === 5) {
                pity.legendary = 0;
            } else {
                pity.legendary += 1;
            }
        }

        // 存入背包。
        data.inventory ??= [];
        data.inventory.push(...results);

        // 儲存失敗時還原整份存檔。
        if (!saveManager.save()) {
            saveManager.data = snapshot;

            return {
                success: false,
                message: "存檔失敗，抽取沒有完成。"
            };
        }

        // 通知其他介面更新。
        eventBus.emit("gold:changed", data.gold);

        eventBus.emit(
            "inventory:changed",
            data.inventory
        );

        return {
            success: true,
            cost,
            results,
            pity: structuredClone(pity)
        };
    }
}

export const gachaSystem = new GachaSystem();

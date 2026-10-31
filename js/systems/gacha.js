
import { GAME_CONFIG } from "../config/game-config.js";
import { saveManager } from "../core/save-manager.js";
import { eventBus } from "../core/event-bus.js";

const RARITIES = [
    { id: "gypsy", name: "吉普賽", weight: 55, level: 1 },
    { id: "common", name: "常見", weight: 27, level: 2 },
    { id: "rare", name: "稀有", weight: 13, level: 3 },
    { id: "epic", name: "史詩", weight: 4.5, level: 4 },
    { id: "legendary", name: "傳說", weight: 0.5, level: 5 }
];

function createId() {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }

    return `stone-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getPity(data) {
    if (!data.gachaPity) {
        data.gachaPity = {
            epic: 0,
            legendary: 0
        };
    }

    return data.gachaPity;
}

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
    if (pity.legendary >= GAME_CONFIG.gacha.legendaryPity - 1) {
        return RARITIES[4];
    }

    if (
        forceEpic ||
        pity.epic >= GAME_CONFIG.gacha.epicPity - 1
    ) {
        const roll = Math.random();

        return roll < 0.1 ? RARITIES[4] : RARITIES[3];
    }

    return weightedRarity();
}

function createStone(rarity) {
    return {
        id: createId(),
        rarity: rarity.id,
        rarityName: rarity.name,
        obtainedAt: new Date().toISOString(),
        status: "uncut"
    };
}

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
            const firstNine = count === 10 && index < 9;

            const hasEpicOrHigher = results.some(
                item => item.level >= 4
            );

            const forceEpic = count === 10 &&
                index === 9 &&
                !hasEpicOrHigher;

            const rarity = pickRarity(pity, forceEpic);
            const stone = createStone(rarity);

            stone.level = rarity.level;
            results.push(stone);

            data.statistics ??= {
                totalPulls: 0,
                totalCuts: 0
            };

            data.statistics.totalPulls += 1;

            if (rarity.level >= 4) {
                pity.epic = 0;
            } else {
                pity.epic += 1;
            }

            if (rarity.level === 5) {
                pity.legendary = 0;
            } else {
                pity.legendary += 1;
            }

            // 前九抽照常依照機率抽取。
            // 第十抽才檢查十連抽史詩保證。
            void firstNine;
        }

        data.inventory ??= [];
        data.inventory.push(...results);

        if (!saveManager.save()) {
            saveManager.data = snapshot;

            return {
                success: false,
                message: "存檔失敗，抽取沒有完成。"
            };
        }

        eventBus.emit("gold:changed", data.gold);
        eventBus.emit("inventory:changed", data.inventory);

        return {
            success: true,
            cost,
            results,
            pity: structuredClone(pity)
        };
    }
}

export const gachaSystem = new GachaSystem();

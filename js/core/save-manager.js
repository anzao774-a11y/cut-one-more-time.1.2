
import { GAME_CONFIG } from "../config/game-config.js";

const DEFAULT_SAVE = {
    version: 1,
    gold: GAME_CONFIG.initialGold,
    inventory: [],
    collection: [],
    gachaPity: {
        epic: 0,
        legendary: 0
    },
    statistics: {
        totalPulls: 0,
        totalCuts: 0
    }
};

class SaveManager {
    constructor() {
        this.data = structuredClone(DEFAULT_SAVE);
    }

    load() {
        try {
            const raw = localStorage.getItem(GAME_CONFIG.saveKey);

            if (!raw) {
                this.data = structuredClone(DEFAULT_SAVE);
                this.save();
                return this.data;
            }

            const parsed = JSON.parse(raw);

            if (!parsed || typeof parsed !== "object") {
                throw new Error("存檔格式錯誤");
            }

            this.data = {
                ...structuredClone(DEFAULT_SAVE),
                ...parsed,

                gachaPity: {
                    ...DEFAULT_SAVE.gachaPity,
                    ...(parsed.gachaPity ?? {})
                },

                statistics: {
                    ...DEFAULT_SAVE.statistics,
                    ...(parsed.statistics ?? {})
                },

                inventory: Array.isArray(parsed.inventory)
                    ? parsed.inventory
                    : [],

                collection: Array.isArray(parsed.collection)
                    ? parsed.collection
                    : []
            };

            return this.data;
        } catch (error) {
            console.error("讀取存檔失敗：", error);

            this.data = structuredClone(DEFAULT_SAVE);
            this.save();

            return this.data;
        }
    }

    save() {
        try {
            localStorage.setItem(
                GAME_CONFIG.saveKey,
                JSON.stringify(this.data)
            );

            return true;
        } catch (error) {
            console.error("儲存存檔失敗：", error);
            return false;
        }
    }

    getData() {
        return this.data;
    }

    update(patch) {
        this.data = {
            ...this.data,
            ...patch
        };

        return this.save();
    }

    reset() {
        const previousData = this.data;

        this.data = structuredClone(DEFAULT_SAVE);

        if (this.save()) {
            return true;
        }

        this.data = previousData;
        return false;
    }
}

export const saveManager = new SaveManager();

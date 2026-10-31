
import { GAME_CONFIG } from "../config/game-config.js";

const DEFAULT_SAVE = {
    version: 1,
    gold: GAME_CONFIG.initialGold,
    inventory: [],
    collection: [],
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
                ...parsed
            };

            return this.data;
        } catch (error) {
            console.error("讀取存檔失敗：", error);
            this.data = structuredClone(DEFAULT_SAVE);
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
}

export const saveManager = new SaveManager();

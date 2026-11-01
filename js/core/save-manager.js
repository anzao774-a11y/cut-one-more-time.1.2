
import { GAME_CONFIG } from "../config/game-config.js";

const DEFAULT_SAVE = {
    version: 2,
    gold: GAME_CONFIG.initialGold,

    inventory: [],
    collection: [],
    products: [],
    museum: [],

    dex: [],
    achievements: [],

    player: {
        level: 1,
        exp: 0,
        totalExp: 0
    },

    cat: {
        affection: 0,
        normalFeedCount: 0,
        premiumGiftCount: 0,
        lastNormalFeed: null,
        lastPremiumGift: null
    },

    market: {
        lastRefresh: null,
        dailyEvent: null,
        transactionCount: 0
    },

    statistics: {
        totalPulls: 0,
        totalCuts: 0,
        totalJadeFound: 0,
        totalJadeSold: 0,
        totalCrafts: 0,
        totalGoldEarned: 0,
        totalGoldSpent: 0
    },

    gachaPity: {
        epic: 0,
        legendary: 0
    }
};

function mergeSave(parsed) {
    const data = {
        ...structuredClone(DEFAULT_SAVE),
        ...parsed
    };

    data.player = {
        ...DEFAULT_SAVE.player,
        ...(parsed.player ?? {})
    };

    data.cat = {
        ...DEFAULT_SAVE.cat,
        ...(parsed.cat ?? {})
    };

    data.market = {
        ...DEFAULT_SAVE.market,
        ...(parsed.market ?? {})
    };

    data.statistics = {
        ...DEFAULT_SAVE.statistics,
        ...(parsed.statistics ?? {})
    };

    data.gachaPity = {
        ...DEFAULT_SAVE.gachaPity,
        ...(parsed.gachaPity ?? {})
    };

    const arrayFields = [
        "inventory",
        "collection",
        "products",
        "museum",
        "dex",
        "achievements"
    ];

    for (const field of arrayFields) {
        data[field] = Array.isArray(parsed[field])
            ? parsed[field]
            : [];
    }

    data.version = 2;

    return data;
}

class SaveManager {
    constructor() {
        this.data = structuredClone(DEFAULT_SAVE);
    }

    load() {
        try {
            const raw = localStorage.getItem(
                GAME_CONFIG.saveKey
            );

            if (!raw) {
                this.data = structuredClone(DEFAULT_SAVE);
                this.save();
                return this.data;
            }

            const parsed = JSON.parse(raw);

            if (!parsed || typeof parsed !== "object") {
                throw new Error("存檔格式錯誤");
            }

            this.data = mergeSave(parsed);

            this.save();

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

    exportBackup() {
        return JSON.stringify(
            this.data,
            null,
            2
        );
    }

    importBackup(json) {
        try {
            const parsed = JSON.parse(json);

            if (
                !parsed ||
                typeof parsed !== "object" ||
                !Array.isArray(parsed.inventory)
            ) {
                throw new Error("備份檔案格式錯誤");
            }

            const previous = this.data;

            this.data = mergeSave(parsed);

            if (!this.save()) {
                this.data = previous;

                return {
                    success: false,
                    message: "備份匯入失敗，原存檔已保留。"
                };
            }

            return {
                success: true,
                message: "備份匯入成功。"
            };

        } catch (error) {
            return {
                success: false,
                message: error.message
            };
        }
    }
}

export const saveManager = new SaveManager();

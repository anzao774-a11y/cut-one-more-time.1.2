
import { GAME_CONFIG } from "../config/game-config.js";

import {
    jadeGeometryGenerator
} from "../systems/jade-geometry-generator.js";


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


// =====================================
// 存檔合併
// =====================================

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


// =====================================
// 玉料幾何資料檢查
// =====================================

function hasValidGeometry(geometry) {
    if (
        !geometry ||
        !Array.isArray(geometry.vertices) ||
        !Array.isArray(geometry.faces) ||
        geometry.vertices.length < 4 ||
        geometry.faces.length < 4
    ) {
        return false;
    }

    try {
        jadeGeometryGenerator.validate(geometry);
        return true;
    } catch {
        return false;
    }
}


// =====================================
// 舊版玉料幾何資料遷移
// =====================================

function repairMassGeometry(mass) {
    if (!mass || typeof mass !== "object") {
        return false;
    }

    // 已經有有效幾何資料，不重複生成。
    if (hasValidGeometry(mass.geometry)) {
        return false;
    }

    // 已定位過的玉料不能直接重建。
    // 否則可能遺失原本的切割位置與形狀。
    if (mass.placementApplied === true) {
        console.warn(
            "略過已定位但缺少幾何資料的玉料：",
            mass.id
        );

        return false;
    }

    if (
        !mass.id ||
        !mass.jadeType ||
        !mass.rarity
    ) {
        console.warn(
            "玉料缺少生成所需的識別資料：",
            mass
        );

        return false;
    }

    try {
        const geometry = jadeGeometryGenerator.generate(
            mass.jadeType,
            mass.rarity,
            mass.id
        );

        if (!hasValidGeometry(geometry)) {
            throw new Error("重新生成的幾何資料未通過驗證。");
        }

        mass.geometry = geometry;

        return true;

    } catch (error) {
        console.error(
            "玉料幾何資料修復失敗：",
            mass.id,
            error
        );

        return false;
    }
}


// =====================================
// 原石玉料資料遷移
// =====================================

function repairLegacyJadeGeometry(data) {
    const result = {
        repaired: 0,
        failed: 0,
        skipped: 0
    };

    if (!Array.isArray(data.inventory)) {
        return result;
    }

    for (const stone of data.inventory) {
        // 只處理尚未切割的原石。
        // 已切割產物的幾何位置不能直接重建。
        if (stone.status !== "uncut") {
            continue;
        }

        const jadeData = stone.jadeData;

        if (!jadeData) {
            continue;
        }

        const massGroups = [
            jadeData.masses,
            jadeData.discardedMasses
        ];

        for (const masses of massGroups) {
            if (!Array.isArray(masses)) {
                continue;
            }

            for (const mass of masses) {
                if (hasValidGeometry(mass?.geometry)) {
                    continue;
                }

                if (
                    !mass?.id ||
                    !mass?.jadeType ||
                    !mass?.rarity ||
                    mass.placementApplied === true
                ) {
                    result.skipped++;
                    continue;
                }

                if (repairMassGeometry(mass)) {
                    result.repaired++;
                } else {
                    result.failed++;
                }
            }
        }
    }

    if (
        result.repaired > 0 ||
        result.failed > 0 ||
        result.skipped > 0
    ) {
        console.log(
            "========== 玉料幾何資料遷移 =========="
        );

        console.log(
            "成功補回：",
            result.repaired
        );

        console.log(
            "修復失敗：",
            result.failed
        );

        console.log(
            "略過資料：",
            result.skipped
        );

        console.log(
            "===================================="
        );
    }

    return result;
}


// =====================================
// 存檔管理器
// =====================================

class SaveManager {
    constructor() {
        this.data = structuredClone(DEFAULT_SAVE);
    }


    // =================================
    // 載入存檔
    // =================================

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

            if (
                !parsed ||
                typeof parsed !== "object"
            ) {
                throw new Error("存檔格式錯誤");
            }

            // 合併預設資料。
            this.data = mergeSave(parsed);

            // 自動修復舊版原石缺少的玉料幾何資料。
            const repairResult =
                repairLegacyJadeGeometry(this.data);

            // 保存遷移結果。
            const saved = this.save();

            if (!saved) {
                console.error(
                    "玉料幾何資料已在記憶體中補回，" +
                    "但存檔寫入失敗。"
                );
            }

            return this.data;

        } catch (error) {
            console.error(
                "讀取存檔失敗：",
                error
            );

            // 不要因為個別玉料幾何修復失敗，
            // 就直接重置整份玩家存檔。
            if (this.data?.inventory?.length > 0) {
                return this.data;
            }

            this.data = structuredClone(DEFAULT_SAVE);

            this.save();

            return this.data;
        }
    }


    // =================================
    // 保存存檔
    // =================================

    save() {
        try {
            localStorage.setItem(
                GAME_CONFIG.saveKey,
                JSON.stringify(this.data)
            );

            return true;

        } catch (error) {
            console.error(
                "儲存存檔失敗：",
                error
            );

            return false;
        }
    }


    // =================================
    // 取得存檔
    // =================================

    getData() {
        return this.data;
    }


    // =================================
    // 更新存檔
    // =================================

    update(patch) {
        this.data = {
            ...this.data,
            ...patch
        };

        return this.save();
    }


    // =================================
    // 重置存檔
    // =================================

    reset() {
        const previousData = this.data;

        this.data = structuredClone(DEFAULT_SAVE);

        if (this.save()) {
            return true;
        }

        this.data = previousData;

        return false;
    }


    // =================================
    // 匯出備份
    // =================================

    exportBackup() {
        return JSON.stringify(
            this.data,
            null,
            2
        );
    }


    // =================================
    // 匯入備份
    // =================================

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

            // 匯入舊版備份時也執行玉料幾何遷移。
            repairLegacyJadeGeometry(this.data);

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

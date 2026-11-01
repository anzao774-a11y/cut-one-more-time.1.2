
import { saveManager } from "../core/save-manager.js";
import { eventBus } from "../core/event-bus.js";

const JADE_RARITY_VALUE = {
    common: 10,
    uncommon: 20,
    rare: 45,
    epic: 100,
    legendary: 250,
    mythic: 500
};

const ACHIEVEMENTS = [
    {
        id: "first_pull",
        name: "賭徒的第一步",
        description: "第一次抽取原石",
        reward: 300
    },
    {
        id: "first_cut",
        name: "再切一刀",
        description: "第一次完成切割",
        reward: 500
    },
    {
        id: "first_jade",
        name: "初見玉石",
        description: "第一次發現玉石",
        reward: 800
    },
    {
        id: "first_craft",
        name: "巧手工匠",
        description: "第一次完成玉石加工",
        reward: 1000
    },
    {
        id: "first_museum",
        name: "私人收藏家",
        description: "第一次將物品放入博物館",
        reward: 1200
    },
    {
        id: "jade_collector_10",
        name: "玉石收藏家",
        description: "發現十種不同玉石",
        reward: 3000
    }
];

const DAILY_EVENTS = [
    {
        id: "jade_boom",
        name: "玉石行情上漲",
        description: "今日玉石收購價格提高 30%。",
        sellMultiplier: 1.3
    },
    {
        id: "market_down",
        name: "市場低迷",
        description: "今日玉石收購價格降低 15%。",
        sellMultiplier: 0.85
    },
    {
        id: "normal_day",
        name: "平穩交易日",
        description: "今日市場沒有特殊變化。",
        sellMultiplier: 1
    }
];

const CAT_WISHES = [
    {
        id: "gold",
        name: "財運降臨",
        description: "小黑貓替你帶來了一筆金幣。",
        reward: 3000
    },
    {
        id: "experience",
        name: "靈感啟發",
        description: "小黑貓讓你獲得了新的靈感。",
        reward: 1200,
        exp: true
    },
    {
        id: "lucky",
        name: "幸運眷顧",
        description: "小黑貓替你帶來了好運。",
        reward: 5000
    }
];

function todayKey() {
    const now = new Date();

    return [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0")
    ].join("-");
}

function randomItem(array) {
    return array[
        Math.floor(Math.random() * array.length)
    ];
}

function createId(prefix = "item") {
    return globalThis.crypto?.randomUUID?.()
        ?? `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

class WorkshopProgression {
    get data() {
        return saveManager.getData();
    }

    save() {
        const success = saveManager.save();

        if (success) {
            eventBus.emit("workshop:changed", this.data);
        }

        return success;
    }

    // =====================================
    // 玩家等級
    // =====================================

    getExpRequired(level) {
        return 100 + Math.max(0, level - 1) * 75;
    }

    getLevelProgress() {
        const player = this.data.player;

        return {
            level: player.level,
            exp: player.exp,
            required: this.getExpRequired(player.level),
            totalExp: player.totalExp
        };
    }

    gainExp(amount) {
        const player = this.data.player;

        const gained = Math.max(0, Math.floor(amount));

        player.exp += gained;
        player.totalExp += gained;

        let levelUps = 0;

        while (
            player.exp >= this.getExpRequired(player.level)
        ) {
            player.exp -= this.getExpRequired(player.level);
            player.level += 1;
            levelUps += 1;
        }

        this.save();

        return {
            gained,
            level: player.level,
            levelUps
        };
    }

    // =====================================
    // 玉石估價
    // =====================================

    getJadeValue(mass) {
        if (!mass) return 0;

        const rarityMultiplier =
            JADE_RARITY_VALUE[mass.rarity] ?? 10;

        const volume = Math.max(
            0,
            Number(mass.volumePercent) || 0
        );

        const baseValue =
            rarityMultiplier * volume;

        const qualityMultiplier =
            Math.max(
                0.5,
                Number(mass.qualityMultiplier) || 1
            );

        return Math.max(
            1,
            Math.round(baseValue * qualityMultiplier)
        );
    }

    getStoneJadeValue(stone) {
        const masses = stone?.jadeData?.masses;

        if (!Array.isArray(masses)) {
            return 0;
        }

        return masses.reduce(
            (sum, mass) => sum + this.getJadeValue(mass),
            0
        );
    }

    // =====================================
    // 圖鑑
    // =====================================

    discoverJades(stone) {
        const masses = stone?.jadeData?.masses;

        if (!Array.isArray(masses)) {
            return [];
        }

        const discovered = [];

        for (const mass of masses) {
            const type = mass.jadeType ?? mass.id;

            if (!type) continue;

            const exists = this.data.dex.some(
                entry => entry.jadeType === type
            );

            if (exists) continue;

            const entry = {
                id: createId("dex"),
                jadeType: type,
                name: mass.name ?? "未知玉石",
                rarity: mass.rarity ?? "common",
                discoveredAt: new Date().toISOString(),
                discoveredFrom: stone.id
            };

            this.data.dex.push(entry);
            discovered.push(entry);
        }

        if (discovered.length > 0) {
            this.data.statistics.totalJadeFound +=
                discovered.length;

            this.checkAchievements();
            this.save();
        }

        return discovered;
    }

    getDex() {
        return [...this.data.dex];
    }

    // =====================================
    // 成就
    // =====================================

    unlockAchievement(id) {
        const definition = ACHIEVEMENTS.find(
            item => item.id === id
        );

        if (!definition) return null;

        const alreadyUnlocked = this.data.achievements.some(
            item => item.id === id
        );

        if (alreadyUnlocked) return null;

        const achievement = {
            ...definition,
            unlockedAt: new Date().toISOString()
        };

        this.data.achievements.push(achievement);

        this.data.gold += definition.reward;

        this.data.statistics.totalGoldEarned +=
            definition.reward;

        this.save();

        eventBus.emit(
            "achievement:unlocked",
            achievement
        );

        eventBus.emit("gold:changed", this.data.gold);

        return achievement;
    }

    checkAchievements() {
        const stats = this.data.statistics;

        if (stats.totalPulls >= 1) {
            this.unlockAchievement("first_pull");
        }

        if (stats.totalCuts >= 1) {
            this.unlockAchievement("first_cut");
        }

        if (this.data.dex.length >= 1) {
            this.unlockAchievement("first_jade");
        }

        if (stats.totalCrafts >= 1) {
            this.unlockAchievement("first_craft");
        }

        if (this.data.museum.length >= 1) {
            this.unlockAchievement("first_museum");
        }

        if (this.data.dex.length >= 10) {
            this.unlockAchievement("jade_collector_10");
        }
    }

    getAchievements() {
        return ACHIEVEMENTS.map(definition => ({
            ...definition,
            unlocked: this.data.achievements.some(
                item => item.id === definition.id
            )
        }));
    }

    // =====================================
    // 玉石出售
    // =====================================

    sellJade(stoneId, massId) {
        const stone = this.data.inventory.find(
            item => item.id === stoneId
        );

        if (!stone?.jadeData?.masses) {
            return {
                success: false,
                message: "找不到玉石資料。"
            };
        }

        const index = stone.jadeData.masses.findIndex(
            mass => mass.id === massId
        );

        if (index < 0) {
            return {
                success: false,
                message: "找不到指定玉石。"
            };
        }

        const [mass] = stone.jadeData.masses.splice(index, 1);

        const baseValue = this.getJadeValue(mass);

        const event = this.getDailyEvent();

        const value = Math.max(
            1,
            Math.round(
                baseValue * event.sellMultiplier
            )
        );

        this.data.gold += value;

        this.data.statistics.totalJadeSold += 1;
        this.data.statistics.totalGoldEarned += value;

        this.save();

        eventBus.emit("gold:changed", this.data.gold);
        eventBus.emit("inventory:changed", this.data.inventory);

        return {
            success: true,
            value,
            message: `成功出售 ${mass.name}，獲得 ${value.toLocaleString()} G。`
        };
    }

    // =====================================
    // 玉石加工
    // =====================================

    craftJade(stoneId, massId, productType) {
        const stone = this.data.inventory.find(
            item => item.id === stoneId
        );

        const mass = stone?.jadeData?.masses?.find(
            item => item.id === massId
        );

        if (!mass) {
            return {
                success: false,
                message: "找不到可加工的玉石。"
            };
        }

        const recipes = {
            pendant: {
                name: "玉石吊墜",
                cost: 300,
                multiplier: 1.6
            },
            ring: {
                name: "玉石戒指",
                cost: 450,
                multiplier: 1.8
            },
            earrings: {
                name: "玉石耳環",
                cost: 500,
                multiplier: 2
            },
            bracelet: {
                name: "玉石手鐲",
                cost: 1000,
                multiplier: 2.5
            }
        };

        const recipe = recipes[productType];

        if (!recipe) {
            return {
                success: false,
                message: "未知的加工配方。"
            };
        }

        if (this.data.gold < recipe.cost) {
            return {
                success: false,
                message: "金幣不足，無法支付加工費。"
            };
        }

        const originalValue = this.getJadeValue(mass);

        const product = {
            id: createId("product"),
            name: `${mass.name}${recipe.name}`,
            type: productType,

            jadeType: mass.jadeType,
            rarity: mass.rarity,

            quality: 1,
            value: Math.round(
                originalValue * recipe.multiplier
            ),

            geometry: structuredClone(mass.geometry),

            sourceStoneId: stoneId,
            createdAt: new Date().toISOString(),

            museum: false
        };

        this.data.gold -= recipe.cost;

        this.data.statistics.totalGoldSpent +=
            recipe.cost;

        stone.jadeData.masses =
            stone.jadeData.masses.filter(
                item => item.id !== massId
            );

        this.data.products.push(product);

        this.data.statistics.totalCrafts += 1;

        this.gainExp(50);

        this.checkAchievements();

        this.save();

        eventBus.emit("gold:changed", this.data.gold);
        eventBus.emit("inventory:changed", this.data.inventory);

        return {
            success: true,
            product,
            message: `成功製作 ${product.name}。`
        };
    }

    polishProduct(productId) {
        const product = this.data.products.find(
            item => item.id === productId
        );

        if (!product) {
            return {
                success: false,
                message: "找不到加工成品。"
            };
        }

        const cost = 200 + product.quality * 150;

        if (this.data.gold < cost) {
            return {
                success: false,
                message: "金幣不足，無法打磨。"
            };
        }

        this.data.gold -= cost;

        this.data.statistics.totalGoldSpent += cost;

        product.quality += 1;

        product.value = Math.round(
            product.value * 1.25
        );

        product.polishedAt = new Date().toISOString();

        this.gainExp(30);
        this.save();

        eventBus.emit("gold:changed", this.data.gold);

        return {
            success: true,
            product,
            message: "打磨完成，成品價值提高。"
        };
    }

    // =====================================
    // 成品出售
    // =====================================

    sellProduct(productId) {
        const index = this.data.products.findIndex(
            item => item.id === productId
        );

        if (index < 0) {
            return {
                success: false,
                message: "找不到指定成品。"
            };
        }

        const product = this.data.products[index];

        if (product.museum) {
            return {
                success: false,
                message: "博物館展示中的物品不能出售。"
            };
        }

        const event = this.getDailyEvent();

        const value = Math.max(
            1,
            Math.round(
                product.value * event.sellMultiplier
            )
        );

        this.data.products.splice(index, 1);

        this.data.gold += value;

        this.data.statistics.totalGoldEarned += value;

        this.save();

        eventBus.emit("gold:changed", this.data.gold);

        return {
            success: true,
            value,
            message: `成品售出，獲得 ${value.toLocaleString()} G。`
        };
    }

    // =====================================
    // 博物館
    // =====================================

    exhibitProduct(productId) {
        const product = this.data.products.find(
            item => item.id === productId
        );

        if (!product) {
            return {
                success: false,
                message: "找不到收藏品。"
            };
        }

        if (product.museum) {
            return {
                success: false,
                message: "收藏品已經在博物館展示。"
            };
        }

        product.museum = true;

        this.data.museum.push({
            productId,
            exhibitedAt: new Date().toISOString()
        });

        this.checkAchievements();
        this.save();

        return {
            success: true,
            message: `${product.name} 已放入博物館。`
        };
    }

    removeExhibit(productId) {
        const product = this.data.products.find(
            item => item.id === productId
        );

        if (!product) return false;

        product.museum = false;

        this.data.museum = this.data.museum.filter(
            item => item.productId !== productId
        );

        this.save();

        return true;
    }

    // =====================================
    // 每日市場
    // =====================================

    getDailyEvent() {
        const today = todayKey();

        if (this.data.market.lastRefresh !== today) {
            const event = randomItem(DAILY_EVENTS);

            this.data.market.lastRefresh = today;

            this.data.market.dailyEvent = event;

            this.save();
        }

        return this.data.market.dailyEvent
            ?? DAILY_EVENTS[2];
    }

    // =====================================
    // 小黑貓
    // =====================================

    feedCat(type = "normal") {
        const cat = this.data.cat;
        const today = todayKey();

        if (type === "normal") {
            if (cat.lastNormalFeed === today) {
                return {
                    success: false,
                    message: "小黑貓今天已經吃過罐頭了。"
                };
            }

            const cost = 100;

            if (this.data.gold < cost) {
                return {
                    success: false,
                    message: "金幣不足，買不起罐頭。"
                };
            }

            this.data.gold -= cost;

            cat.lastNormalFeed = today;
            cat.normalFeedCount += 1;
            cat.affection += 1;

            this.save();

            eventBus.emit("gold:changed", this.data.gold);

            return {
                success: true,
                message: "小黑貓吃完罐頭，心情很好。"
            };
        }

        if (type === "premium") {
            if (cat.lastPremiumGift === today) {
                return {
                    success: false,
                    message: "今天已經送過珍貴禮物了。"
                };
            }

            const cost = 2000;

            if (this.data.gold < cost) {
                return {
                    success: false,
                    message: "金幣不足，無法購買超高級罐頭。"
                };
            }

            this.data.gold -= cost;

            cat.lastPremiumGift = today;
            cat.premiumGiftCount += 1;
            cat.affection += 10;

            const wish = randomItem(CAT_WISHES);

            if (wish.exp) {
                this.gainExp(wish.reward);
            } else {
                this.data.gold += wish.reward;

                this.data.statistics.totalGoldEarned +=
                    wish.reward;
            }

            this.save();

            eventBus.emit("gold:changed", this.data.gold);

            return {
                success: true,
                wish,
                message: `小黑貓收下了禮物。${wish.description}`
            };
        }

        return {
            success: false,
            message: "未知的餵食方式。"
        };
    }

    // =====================================
    // 阿姨評價
    // =====================================

    getAuntReview(jades = []) {
        const rareCount = jades.filter(
            jade => ["epic", "legendary", "mythic"].includes(
                jade.rarity
            )
        ).length;

        const totalCount = jades.length;

        const auntOne = rareCount > 0
            ? [
                "哼，這次總算不是完全沒救。",
                "運氣不錯嘛，別太得意。",
                "這塊還算有點價值。"
            ]
            : [
                "就這？",
                "你確定這不是路邊撿的？",
                "我看你還是早點收手吧。"
            ];

        const auntTwo = [
            "爛。",
            "對對對，真的爛。",
            "我也覺得不怎麼樣。"
        ];

        const auntThree = rareCount >= 2
            ? [
                "這次的成果值得好好保存。",
                "難得看到不錯的料子。",
                "今天的運氣確實很好。"
            ]
            : [
                "還有很大的進步空間。",
                "下次再仔細挑選吧。",
                "先別急著高興。"
            ];

        return {
            auntOne: randomItem(auntOne),
            auntTwo: randomItem(auntTwo),
            auntThree: randomItem(auntThree),

            rareCount,
            totalCount
        };
    }
}

export const workshopProgression =
    new WorkshopProgression();

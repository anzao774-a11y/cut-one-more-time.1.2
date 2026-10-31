
export const GAME_CONFIG = {
    name: "再切一刀就好",
    subtitle: "哪有賭徒天天輸",

    initialGold: 10000,

    gacha: {
        singleCost: 500,
        tenPullCost: 4500,

        rarities: {
            gypsy: 55,
            common: 27,
            rare: 13,
            epic: 4.5,
            legendary: 0.5
        },

        epicPity: 10,
        legendaryPity: 30
    },

    cheat: {
        code: "37bibobi",
        reward: 10000
    },

    scrapBuybackRate: 0.2,

    saveKey: "cutOneMoreTime_new_save"
};

export const PAGE_NAMES = {
    home: "工坊",
    gacha: "抽取原石",
    cutting: "切割工作台",
    inventory: "原石背包",
    dex: "玉石圖鑑",
    market: "交易市場",
    settings: "工坊設定"
};

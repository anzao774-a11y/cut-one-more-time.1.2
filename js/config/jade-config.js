
export const JADE_TYPES = {
    // 吉普賽：4 種
    agate: {
        id: "agate",
        name: "瑪瑙",
        rarity: "gypsy",
        baseIndex: 80
    },
    jasper: {
        id: "jasper",
        name: "碧玉",
        rarity: "gypsy",
        baseIndex: 90
    },
    quartz: {
        id: "quartz",
        name: "石英",
        rarity: "gypsy",
        baseIndex: 100
    },
    commercial_nephrite: {
        id: "commercial_nephrite",
        name: "商業級軟玉",
        rarity: "gypsy",
        baseIndex: 150
    },

    // 常見：5 種
    amethyst: {
        id: "amethyst",
        name: "紫水晶",
        rarity: "common",
        baseIndex: 180
    },
    citrine: {
        id: "citrine",
        name: "黃水晶",
        rarity: "common",
        baseIndex: 180
    },
    garnet: {
        id: "garnet",
        name: "石榴石",
        rarity: "common",
        baseIndex: 220
    },
    lapis_lazuli: {
        id: "lapis_lazuli",
        name: "青金石",
        rarity: "common",
        baseIndex: 220
    },
    turquoise: {
        id: "turquoise",
        name: "綠松石",
        rarity: "common",
        baseIndex: 250
    },

    // 稀有：6 種
    aquamarine: {
        id: "aquamarine",
        name: "海藍寶",
        rarity: "rare",
        baseIndex: 450
    },
    peridot: {
        id: "peridot",
        name: "橄欖石",
        rarity: "rare",
        baseIndex: 400
    },
    spinel: {
        id: "spinel",
        name: "尖晶石",
        rarity: "rare",
        baseIndex: 650
    },
    tourmaline: {
        id: "tourmaline",
        name: "碧璽",
        rarity: "rare",
        baseIndex: 700
    },
    jadeite: {
        id: "jadeite",
        name: "翡翠（一般級）",
        rarity: "rare",
        baseIndex: 750
    },
    moonstone: {
        id: "moonstone",
        name: "月光石",
        rarity: "rare",
        baseIndex: 500
    },

    // 史詩：4 種
    emerald: {
        id: "emerald",
        name: "祖母綠",
        rarity: "epic",
        baseIndex: 1500
    },
    ruby: {
        id: "ruby",
        name: "紅寶石",
        rarity: "epic",
        baseIndex: 1800
    },
    sapphire: {
        id: "sapphire",
        name: "藍寶石",
        rarity: "epic",
        baseIndex: 1500
    },
    precious_opal: {
        id: "precious_opal",
        name: "珍貴蛋白石",
        rarity: "epic",
        baseIndex: 1700
    },

    // 傳說：4 種
    imperial_green_jadeite: {
        id: "imperial_green_jadeite",
        name: "帝王綠翡翠",
        rarity: "legendary",
        baseIndex: 5000
    },
    alexandrite: {
        id: "alexandrite",
        name: "亞歷山大變石",
        rarity: "legendary",
        baseIndex: 6000
    },
    black_opal: {
        id: "black_opal",
        name: "黑蛋白石",
        rarity: "legendary",
        baseIndex: 7000
    },
    pigeon_blood_ruby: {
        id: "pigeon_blood_ruby",
        name: "鴿血紅寶石",
        rarity: "legendary",
        baseIndex: 8000
    },

    // 特殊：遊戲原創
    jade_37: {
        id: "jade_37",
        name: "37玉",
        rarity: "special",
        baseIndex: 37000,
        special: true
    }
};

export const JADE_GENERATION_CONFIG = {
    gypsy: {
        drawCount: 1,
        volume: [10, 20],
        distribution: {
            gypsy: 90,
            common: 10
        }
    },

    common: {
        drawCount: 2,
        volume: [15, 25],
        distribution: {
            gypsy: 70,
            common: 20,
            rare: 10
        },
        guaranteedTier: "common"
    },

    rare: {
        drawCount: 3,
        volume: [20, 30],
        distribution: {
            gypsy: 40,
            common: 30,
            rare: 20,
            epic: 10
        },
        guaranteedTier: "rare"
    },

    epic: {
        drawCount: 4,
        volume: [30, 40],
        distribution: {
            gypsy: 30,
            common: 20,
            rare: 20,
            epic: 20,
            legendary: 10
        },
        guaranteedTier: "epic"
    },

    legendary: {
        drawCount: 5,
        volume: [50, 60],
        distribution: {
            gypsy: 20,
            common: 20,
            rare: 20,
            epic: 20,
            legendary: 15,
            jade_37: 5
        },
        guaranteedTier: "legendary",
        specialChance: 5
    }
};

export const JADE_RARITY_LEVEL = {
    gypsy: 1,
    common: 2,
    rare: 3,
    epic: 4,
    legendary: 5,
    special: 6
};

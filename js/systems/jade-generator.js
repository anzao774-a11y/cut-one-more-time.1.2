
import {
    JADE_TYPES,
    JADE_GENERATION_CONFIG,
    JADE_RARITY_LEVEL
} from "../config/jade-config.js";

const RARITY_ORDER = [
    "gypsy",
    "common",
    "rare",
    "epic",
    "legendary"
];

function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

function createId() {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }

    return `jade-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function weightedPick(distribution) {
    const entries = Object.entries(distribution);
    const total = entries.reduce(
        (sum, [, weight]) => sum + weight,
        0
    );

    let roll = Math.random() * total;

    for (const [key, weight] of entries) {
        roll -= weight;

        if (roll < 0) {
            return key;
        }
    }

    return entries[entries.length - 1][0];
}

function pickJadeRarity(distribution, guaranteedTier) {
    const selected = weightedPick(distribution);

    if (!guaranteedTier) {
        return selected;
    }

    const selectedLevel = JADE_RARITY_LEVEL[selected] ?? 0;
    const guaranteedLevel = JADE_RARITY_LEVEL[guaranteedTier];

    if (selectedLevel >= guaranteedLevel) {
        return selected;
    }

    // 未達保證稀有度時，從保證等級以上重新抽取。
    const eligible = Object.entries(distribution).filter(
        ([key]) =>
            (JADE_RARITY_LEVEL[key] ?? 0) >= guaranteedLevel &&
            key !== "jade_37"
    );

    const eligibleTotal = eligible.reduce(
        (sum, [, weight]) => sum + weight,
        0
    );

    if (eligibleTotal <= 0) {
        return guaranteedTier;
    }

    return weightedPick(
        Object.fromEntries(eligible)
    );
}

function getSpeciesByRarity(rarity) {
    return Object.values(JADE_TYPES).filter(
        jade => jade.rarity === rarity
    );
}

function pickSpecies(rarity) {
    const species = getSpeciesByRarity(rarity);

    if (species.length === 0) {
        throw new Error(`找不到玉石種類：${rarity}`);
    }

    return species[
        Math.floor(Math.random() * species.length)
    ];
}

function allocateVolumes(draws, totalVolume) {
    if (draws.length === 0) return [];

    // 同一種類的多次抽中，先合併成同一個質量。
    const grouped = new Map();

    for (const jade of draws) {
        const current = grouped.get(jade.id);

        if (current) {
            current.drawCount += 1;
        } else {
            grouped.set(jade.id, {
                ...jade,
                drawCount: 1
            });
        }
    }

    const groups = [...grouped.values()];

    // 以抽中次數為基礎，加入隨機權重。
    const weights = groups.map(
        group => group.drawCount * randomBetween(0.7, 1.3)
    );

    const totalWeight = weights.reduce(
        (sum, weight) => sum + weight,
        0
    );

    return groups.map((group, index) => {
        const volume = totalVolume *
            weights[index] / totalWeight;

        return {
            id: createId(),
            jadeType: group.id,
            name: group.name,
            rarity: group.rarity,
            baseIndex: group.baseIndex,
            drawCount: group.drawCount,
            volumePercent: volume,
            connected: true
        };
    });
}

function applyFragmentThreshold(masses, totalStoneVolume) {
    const retained = [];
    const discarded = [];

    for (const mass of masses) {
        if (mass.volumePercent < 5) {
            discarded.push({
                ...mass,
                discardReason: "低於原石總體積的 5%"
            });
        } else {
            retained.push(mass);
        }
    }

    return {
        retained,
        discarded,
        retainedVolume: retained.reduce(
            (sum, mass) => sum + mass.volumePercent,
            0
        ),
        discardedVolume: discarded.reduce(
            (sum, mass) => sum + mass.volumePercent,
            0
        ),
        originalVolume: totalStoneVolume
    };
}

class JadeGenerator {
    generate(stone) {
        const config = JADE_GENERATION_CONFIG[stone.rarity];

        if (!config) {
            throw new Error(
                `未知的原石稀有度：${stone.rarity}`
            );
        }

        const draws = [];

        for (let index = 0; index < config.drawCount; index++) {
            const isFinalDraw = index === config.drawCount - 1;

            const hasGuaranteedTier = draws.some(
                jade =>
                    (JADE_RARITY_LEVEL[jade.rarity] ?? 0) >=
                    JADE_RARITY_LEVEL[config.guaranteedTier]
            );

            let selectedRarity;

            // 傳說原石每次種類抽取都有獨立的 5% 特殊玉機率。
            if (
                stone.rarity === "legendary" &&
                Math.random() < config.specialChance / 100
            ) {
                selectedRarity = "jade_37";
            } else {
                const guarantee = isFinalDraw &&
                    config.guaranteedTier &&
                    !hasGuaranteedTier
                    ? config.guaranteedTier
                    : null;

                selectedRarity = pickJadeRarity(
                    config.distribution,
                    guarantee
                );
            }

            if (selectedRarity === "jade_37") {
                draws.push(JADE_TYPES.jade_37);
            } else {
                draws.push(pickSpecies(selectedRarity));
            }
        }

        const totalVolume = randomBetween(
            config.volume[0],
            config.volume[1]
        );

        const masses = allocateVolumes(draws, totalVolume);

        const fragmentResult = applyFragmentThreshold(
            masses,
            100
        );

        return {
            stoneId: stone.id,
            stoneRarity: stone.rarity,
            generatedAt: new Date().toISOString(),

            drawCount: config.drawCount,
            totalJadeVolume: totalVolume,

            draws: draws.map(jade => ({
                jadeType: jade.id,
                name: jade.name,
                rarity: jade.rarity
            })),

            masses: fragmentResult.retained,
            discardedMasses: fragmentResult.discarded,

            retainedVolume: fragmentResult.retainedVolume,
            discardedVolume: fragmentResult.discardedVolume,

            generationVersion: 1
        };
    }
}

export const jadeGenerator = new JadeGenerator();


import {
    JADE_TYPES,
    JADE_GENERATION_CONFIG,
    JADE_RARITY_LEVEL
} from "../config/jade-config.js";

import {
    jadeGeometryGenerator
} from "./jade-geometry-generator.js";

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

    if (total <= 0) {
        throw new Error("玉石機率設定無效。");
    }

    let roll = Math.random() * total;

    for (const [key, weight] of entries) {
        roll -= weight;

        if (roll < 0) {
            return key;
        }
    }

    return entries[entries.length - 1][0];
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

function hasGuaranteedJade(draws, guaranteedTier) {
    if (!guaranteedTier) {
        return false;
    }

    const requiredLevel = JADE_RARITY_LEVEL[guaranteedTier];

    return draws.some(jade => {
        if (jade.id === "jade_37") {
            return false;
        }

        const currentLevel =
            JADE_RARITY_LEVEL[jade.rarity] ?? 0;

        return currentLevel >= requiredLevel;
    });
}

function pickRarity(distribution, guaranteedTier) {
    if (!guaranteedTier) {
        return weightedPick(distribution);
    }

    const requiredLevel = JADE_RARITY_LEVEL[guaranteedTier];

    const eligible = Object.entries(distribution).filter(
        ([rarity]) => {
            if (rarity === "jade_37") {
                return false;
            }

            return (
                (JADE_RARITY_LEVEL[rarity] ?? 0) >= requiredLevel
            );
        }
    );

    if (eligible.length === 0) {
        throw new Error(
            `找不到符合保底條件的玉石稀有度：${guaranteedTier}`
        );
    }

    return weightedPick(
        Object.fromEntries(eligible)
    );
}

function allocateVolumes(draws, totalVolume) {
    if (draws.length === 0) {
        return [];
    }

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

    const weights = groups.map(
        group => group.drawCount * randomBetween(0.7, 1.3)
    );

    const totalWeight = weights.reduce(
        (sum, weight) => sum + weight,
        0
    );

    return groups.map((group, index) => {
        const volume =
            totalVolume * weights[index] / totalWeight;

        const id = createId();

        const geometry = jadeGeometryGenerator.generate(
            group.id,
            group.rarity,
            id
        );

        return {
            id,
            jadeType: group.id,
            name: group.name,
            rarity: group.rarity,
            baseIndex: group.baseIndex,
            drawCount: group.drawCount,
            volumePercent: volume,
            geometry
        };
    });
}

function applyFragmentThreshold(masses) {
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
        )
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
            const isFinalDraw =
                index === config.drawCount - 1;

            const alreadyGuaranteed = hasGuaranteedJade(
                draws,
                config.guaranteedTier
            );

            const shouldGuarantee =
                isFinalDraw &&
                config.guaranteedTier &&
                !alreadyGuaranteed;

            const selectedRarity = pickRarity(
                config.distribution,
                shouldGuarantee
                    ? config.guaranteedTier
                    : null
            );

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

        const masses = allocateVolumes(
            draws,
            totalVolume
        );

        const fragmentResult = applyFragmentThreshold(
            masses
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

            generationVersion: 3
        };
    }
}

export const jadeGenerator = new JadeGenerator();


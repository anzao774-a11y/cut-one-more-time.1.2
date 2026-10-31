
import { saveManager } from "../core/save-manager.js";
import { eventBus } from "../core/event-bus.js";

const RARITY_ORDER = {
    gypsy: 1,
    common: 2,
    rare: 3,
    epic: 4,
    legendary: 5
};

class InventorySystem {
    getAll() {
        const data = saveManager.getData();

        if (!Array.isArray(data.inventory)) {
            return [];
        }

        return [...data.inventory];
    }

    getUncut() {
        return this.getAll().filter(
            stone => stone.status === "uncut"
        );
    }

    getCut() {
        return this.getAll().filter(
            stone => stone.status === "cut"
        );
    }

    getById(stoneId) {
        if (!stoneId) {
            return null;
        }

        return this.getAll().find(
            stone => stone.id === stoneId
        ) ?? null;
    }

    getByRarity(rarity) {
        return this.getAll().filter(
            stone => stone.rarity === rarity
        );
    }

    getUncutByRarity(rarity) {
        return this.getUncut().filter(
            stone => stone.rarity === rarity
        );
    }

    getSorted(options = {}) {
        const {
            status = "all",
            rarity = "all",
            order = "newest"
        } = options;

        let stones = this.getAll();

        if (status !== "all") {
            stones = stones.filter(
                stone => stone.status === status
            );
        }

        if (rarity !== "all") {
            stones = stones.filter(
                stone => stone.rarity === rarity
            );
        }

        switch (order) {
            case "oldest":
                stones.sort(
                    (a, b) =>
                        new Date(a.obtainedAt) -
                        new Date(b.obtainedAt)
                );
                break;

            case "rarity":
                stones.sort(
                    (a, b) =>
                        (RARITY_ORDER[b.rarity] ?? 0) -
                        (RARITY_ORDER[a.rarity] ?? 0)
                );
                break;

            case "newest":
            default:
                stones.sort(
                    (a, b) =>
                        new Date(b.obtainedAt) -
                        new Date(a.obtainedAt)
                );
                break;
        }

        return stones;
    }

    getJadeData(stoneId) {
        const stone = this.getById(stoneId);

        if (!stone) {
            return null;
        }

        return stone.jadeData ?? null;
    }

    getSummary() {
        const stones = this.getAll();

        const summary = {
            total: stones.length,
            uncut: 0,
            cut: 0,
            byRarity: {
                gypsy: 0,
                common: 0,
                rare: 0,
                epic: 0,
                legendary: 0
            }
        };

        for (const stone of stones) {
            if (stone.status === "uncut") {
                summary.uncut += 1;
            }

            if (stone.status === "cut") {
                summary.cut += 1;
            }

            if (
                Object.prototype.hasOwnProperty.call(
                    summary.byRarity,
                    stone.rarity
                )
            ) {
                summary.byRarity[stone.rarity] += 1;
            }
        }

        return summary;
    }

    hasStone(stoneId) {
        return this.getById(stoneId) !== null;
    }

    notifyChanged() {
        const inventory = this.getAll();

        eventBus.emit("inventory:changed", inventory);
    }
}

export const inventorySystem = new InventorySystem();


import { saveManager } from "./save-manager.js";
import { eventBus } from "./event-bus.js";

class TransactionManager {
    spendGold(amount) {
        if (!Number.isFinite(amount) || amount <= 0) {
            return false;
        }

        const data = saveManager.getData();

        if (data.gold < amount) {
            eventBus.emit("transaction:failed", {
                reason: "金幣不足"
            });
            return false;
        }

        const previousGold = data.gold;
        data.gold -= amount;

        if (!saveManager.save()) {
            data.gold = previousGold;
            return false;
        }

        eventBus.emit("gold:changed", data.gold);
        return true;
    }

    earnGold(amount) {
        if (!Number.isFinite(amount) || amount <= 0) {
            return false;
        }

        const data = saveManager.getData();
        const previousGold = data.gold;

        data.gold += amount;

        if (!saveManager.save()) {
            data.gold = previousGold;
            return false;
        }

        eventBus.emit("gold:changed", data.gold);
        return true;
    }
}

export const transactionManager = new TransactionManager();

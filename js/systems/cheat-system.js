
import { GAME_CONFIG } from "../config/game-config.js";
import { transactionManager } from "../core/transaction-manager.js";

class CheatSystem {
    constructor() {
        this.processing = false;
    }

    redeem(input) {
        if (this.processing) {
            return {
                success: false,
                message: "請稍候再試。"
            };
        }

        const code = String(input ?? "").trim().toLowerCase();
        const correctCode = GAME_CONFIG.cheat.code.toLowerCase();

        if (!code || code !== correctCode) {
            return {
                success: false,
                message: "代碼錯誤，請重新確認。"
            };
        }

        this.processing = true;

        try {
            const success = transactionManager.earnGold(
                GAME_CONFIG.cheat.reward
            );

            if (!success) {
                return {
                    success: false,
                    message: "金幣儲存失敗，請稍後重試。"
                };
            }

            return {
                success: true,
                message: `兌換成功！獲得 ${GAME_CONFIG.cheat.reward.toLocaleString()} G。`
            };
        } finally {
            this.processing = false;
        }
    }
}

export const cheatSystem = new CheatSystem();


import { GAME_CONFIG } from "../config/game-config.js";
import { transactionManager } from "../core/transaction-manager.js";
import { saveManager } from "../core/save-manager.js";

class CheatSystem {
    constructor() {
        this.processing = false;
    }

    redeem(input, confirmedReset = false) {
        if (this.processing) {
            return {
                success: false,
                message: "請稍候再試。"
            };
        }

        const code = String(input ?? "").trim().toLowerCase();
        const codes = GAME_CONFIG.cheat.codes;

        if (!code) {
            return {
                success: false,
                message: "請輸入作弊碼。"
            };
        }

        if (code === codes.reset.code.toLowerCase()) {
            if (!confirmedReset) {
                return {
                    success: false,
                    confirmationRequired: true,
                    message: "即將恢復原廠設定。"
                };
            }

            return this.resetAll();
        }

        let reward = null;
        let rewardName = "";

        if (code === codes.girlfriend.code.toLowerCase()) {
            reward = codes.girlfriend.reward;
            rewardName = "專屬補給";
        } else if (code === codes.godmode.code.toLowerCase()) {
            reward = codes.godmode.reward;
            rewardName = "終極作弊碼";
        }

        if (reward === null) {
            return {
                success: false,
                message: "代碼錯誤，請重新確認。"
            };
        }

        this.processing = true;

        try {
            const success = transactionManager.earnGold(reward);

            if (!success) {
                return {
                    success: false,
                    message: "金幣儲存失敗，請稍後重試。"
                };
            }

            return {
                success: true,
                message: `${rewardName}啟動成功！獲得 ${reward.toLocaleString()} G。`
            };
        } finally {
            this.processing = false;
        }
    }

    resetAll() {
        if (this.processing) {
            return {
                success: false,
                message: "請稍候再試。"
            };
        }

        this.processing = true;

        try {
            const success = saveManager.reset();

            if (!success) {
                return {
                    success: false,
                    message: "存檔重置失敗，請稍後再試。"
                };
            }

            return {
                success: true,
                reset: true,
                message: "原廠設定恢復成功！"
            };
        } finally {
            this.processing = false;
        }
    }
}

export const cheatSystem = new CheatSystem();

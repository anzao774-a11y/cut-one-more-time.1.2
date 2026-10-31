
import { cheatSystem } from "../systems/cheat-system.js";

class SettingsUI {
    init() {
        const input = document.getElementById("cheat-code");
        const button = document.getElementById("redeem-cheat");
        const message = document.getElementById("cheat-message");

        if (!input || !button || !message) return;

        const showMessage = result => {
            message.textContent = result.message;
            message.className = result.success
                ? "cheat-message success"
                : "cheat-message error";
        };

        const redeem = () => {
            const result = cheatSystem.redeem(input.value);

            if (result.confirmationRequired) {
                const confirmed = window.confirm(
                    "確定要恢復原廠設定嗎？\n\n" +
                    "所有金幣、原石、收藏、保底及統計資料都會清空，" +
                    "並恢復成初始的 10,000 G。\n\n" +
                    "此操作無法復原。"
                );

                if (!confirmed) {
                    showMessage({
                        success: false,
                        message: "已取消原廠重置。"
                    });

                    return;
                }

                const resetResult = cheatSystem.redeem(
                    input.value,
                    true
                );

                showMessage(resetResult);

                if (resetResult.success && resetResult.reset) {
                    input.value = "";

                    window.alert(
                        "原廠設定恢復成功！遊戲即將重新啟動。"
                    );

                    window.location.reload();
                }

                return;
            }

            showMessage(result);

            if (result.success) {
                input.value = "";
            }
        };

        button.addEventListener("click", redeem);

        input.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                redeem();
            }
        });
    }
}

export const settingsUI = new SettingsUI();

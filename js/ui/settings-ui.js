
import { cheatSystem } from "../systems/cheat-system.js";

class SettingsUI {
    init() {
        const input = document.getElementById("cheat-code");
        const button = document.getElementById("redeem-cheat");
        const message = document.getElementById("cheat-message");

        if (!input || !button || !message) return;

        const redeem = () => {
            const result = cheatSystem.redeem(input.value);

            message.textContent = result.message;
            message.className = result.success
                ? "cheat-message success"
                : "cheat-message error";

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

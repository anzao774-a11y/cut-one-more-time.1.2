
import { gachaSystem } from "../systems/gacha.js";
import { saveManager } from "../core/save-manager.js";

const RARITY_NAMES = {
    gypsy: "吉普賽",
    common: "常見",
    rare: "稀有",
    epic: "史詩",
    legendary: "傳說"
};

class GachaUI {
    init() {
        document.getElementById("single-pull")
            ?.addEventListener("click", () => this.pull(1));

        document.getElementById("ten-pull")
            ?.addEventListener("click", () => this.pull(10));

        this.updatePity();
    }

    updatePity() {
        const data = saveManager.getData();

        const pity = data.gachaPity ?? {
            epic: 0,
            legendary: 0
        };

        document.getElementById("epic-pity").textContent =
            `${pity.epic} / 10`;

        document.getElementById("legendary-pity").textContent =
            `${pity.legendary} / 30`;
    }

    pull(count) {
        const message = document.getElementById("gacha-message");
        const resultsPanel = document.getElementById("gacha-results");

        const result = gachaSystem.pull(count);

        if (!result.success) {
            message.textContent = result.message;
            message.className = "gacha-message error";
            return;
        }

        message.textContent =
            `成功抽取 ${count} 塊原石，花費 ${result.cost.toLocaleString()} G。`;

        message.className = "gacha-message success";

        this.renderResults(result.results);
        resultsPanel.hidden = false;
        this.updatePity();
    }

    renderResults(results) {
        const container = document.getElementById("gacha-result-list");

        container.replaceChildren();

        results.forEach((stone, index) => {
            const card = document.createElement("div");
            card.className = "gacha-result-card";
            card.style.animationDelay = `${index * 45}ms`;

            const icon = document.createElement("div");
            icon.className = "result-stone";
            icon.textContent = "◆";

            const name = document.createElement("strong");
            name.textContent = "未鑑定原石";

            const rarity = document.createElement("span");
            rarity.className = `result-rarity ${stone.rarity}`;
            rarity.textContent = RARITY_NAMES[stone.rarity];

            const number = document.createElement("small");
            number.textContent = `第 ${index + 1} 塊`;

            card.append(icon, name, rarity, number);

            if (stone.level >= 4) {
                const bonus = document.createElement("span");
                bonus.className = "result-pity";
                bonus.textContent = "高稀有度";
                card.append(bonus);
            }

            container.append(card);
        });
    }
}

export const gachaUI = new GachaUI();

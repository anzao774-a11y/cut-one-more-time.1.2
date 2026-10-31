
import { eventBus } from "../core/event-bus.js";

const PAGE_NAMES = {
    home: "礦石工坊",
    gacha: "抽取原石",
    cutting: "切割工作台",
    inventory: "原石背包",
    dex: "玉石圖鑑",
    market: "交易市場",
    settings: "工坊設定"
};

class Navigation {
    constructor() {
        this.currentPage = "home";
    }

    init() {
        document.querySelectorAll("[data-page]").forEach(button => {
            button.addEventListener("click", () => {
                this.navigate(button.dataset.page);
            });
        });
    }

    navigate(page) {
        if (!PAGE_NAMES[page]) return;

        this.currentPage = page;

        document.querySelectorAll(".nav-item").forEach(button => {
            button.classList.toggle(
                "active",
                button.dataset.page === page
            );
        });

        eventBus.emit("navigation:changed", {
            page,
            title: PAGE_NAMES[page]
        });

        if (page !== "home") {
            alert(`${PAGE_NAMES[page]}：功能將在後續階段加入。`);
        }
    }
}

export const navigation = new Navigation();

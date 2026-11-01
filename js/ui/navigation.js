
const PAGE_NAMES = {
    home: "工坊",
    gacha: "抽取原石",
    cutting: "切割工作台",
    inventory: "原石背包",
    dex: "玉石圖鑑",
    market: "交易市場",
    processing: "玉石加工",
    museum: "博物館",
    cat: "小黑貓",
    achievements: "成就紀錄",
    settings: "工坊設定"
};

const AVAILABLE_PAGES = Object.keys(PAGE_NAMES);

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

        this.navigate("home");
    }

    navigate(page) {
        if (!PAGE_NAMES[page]) return;

        this.currentPage = page;

        document.querySelectorAll(".page-section").forEach(section => {
            section.hidden = true;
        });

        const target = document.getElementById(`page-${page}`);

        if (target && AVAILABLE_PAGES.includes(page)) {
            target.hidden = false;
        }

        document.querySelectorAll(".nav-item").forEach(button => {
            button.classList.toggle(
                "active",
                button.dataset.page === page
            );
        });

        if (page === "inventory") {
            document.dispatchEvent(
                new CustomEvent("inventory:page-opened")
            );
        }

        if (page === "cutting") {
            requestAnimationFrame(() => {
                document.dispatchEvent(
                    new CustomEvent("cutting:page-opened")
                );
            });
        }

        if (
            [
                "dex",
                "market",
                "processing",
                "museum",
                "cat",
                "achievements"
            ].includes(page)
        ) {
            document.dispatchEvent(
                new CustomEvent("workshop:page-opened")
            );
        }

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    }
}

export const navigation = new Navigation();

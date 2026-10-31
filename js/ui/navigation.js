
const PAGE_NAMES = {
    home: "工坊",
    gacha: "抽取原石",
    cutting: "切割工作台",
    inventory: "原石背包",
    dex: "玉石圖鑑",
    market: "交易市場",
    settings: "工坊設定"
};

const AVAILABLE_PAGES = [
    "home",
    "gacha",
    "inventory",
    "settings"
];

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

        // 隱藏所有頁面
        document.querySelectorAll(".page-section").forEach(section => {
            section.hidden = true;
        });

        // 已完成的頁面直接顯示，其他頁面使用開發中畫面
        const targetPage = AVAILABLE_PAGES.includes(page)
            ? page
            : "placeholder";

        const target = document.getElementById(`page-${targetPage}`);

        if (target) {
            target.hidden = false;
        }

        // 更新尚未開放頁面的標題
        const placeholderTitle =
            document.getElementById("placeholder-title");

        if (targetPage === "placeholder" && placeholderTitle) {
            placeholderTitle.textContent =
                `${PAGE_NAMES[page]}：開發中`;
        }

        // 更新底部導覽列與其他導覽按鈕狀態
        document.querySelectorAll(".nav-item").forEach(button => {
            button.classList.toggle(
                "active",
                button.dataset.page === page
            );
        });

        // 進入背包時刷新資料
        if (page === "inventory") {
            document.dispatchEvent(
                new CustomEvent("inventory:page-opened")
            );
        }

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    }
}

export const navigation = new Navigation();

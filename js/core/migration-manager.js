
export const LEGACY_JADE_ID_MAP = {
    nephrite: "commercial_nephrite",
    qingyu: "jasper",
    white_jade: "jadeite",
    ice_jade: "jadeite",
    violet_jade: "amethyst",
    imperial_green: "imperial_green_jadeite"
};

class MigrationManager {
    migrate(saveData) {
        if (!saveData || typeof saveData !== "object") {
            throw new Error("無效的存檔資料");
        }

        const migrated = structuredClone(saveData);

        if (Array.isArray(migrated.inventory)) {
            migrated.inventory = migrated.inventory.map(item => ({
                ...item,
                jadeType: LEGACY_JADE_ID_MAP[item.jadeType]
                    ?? item.jadeType
            }));
        }

        migrated.version = 1;

        return migrated;
    }
}

export const migrationManager = new MigrationManager();

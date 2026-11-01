
import { GAME_CONFIG } from "../config/game-config.js";

import {
    jadeGeometryGenerator
} from "../systems/jade-geometry-generator.js";


const DEFAULT_SAVE = {
    version: 2,
    gold: GAME_CONFIG.initialGold,

    inventory: [],
    collection: [],
    products: [],
    museum: [],

    dex: [],
    achievements: [],

    player: {
        level: 1,
        exp: 0,
        totalExp: 0
    },

    cat: {
        affection: 0,
        normalFeedCount: 0,
        premiumGiftCount: 0,
        lastNormalFeed: null,
        lastPremiumGift: null
    },

    market: {
        lastRefresh: null,
        dailyEvent: null,
        transactionCount: 0
    },

    statistics: {
        totalPulls: 0,
        totalCuts: 0,
        totalJadeFound: 0,
        totalJadeSold: 0,
        totalCrafts: 0,
        totalGoldEarned: 0,
        totalGoldSpent: 0
    },

    gachaPity: {
        epic: 0,
        legendary: 0
    }
};


const COMPACT_GEOMETRY_KEY = "__compactGeometryV1";


// =====================================
// 二進位編碼工具
// =====================================

function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;

    for (
        let offset = 0;
        offset < bytes.length;
        offset += chunkSize
    ) {
        const chunk = bytes.subarray(
            offset,
            Math.min(offset + chunkSize, bytes.length)
        );

        binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
}


function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
}


function encodeTypedArray(typedArray) {
    return bytesToBase64(
        new Uint8Array(
            typedArray.buffer,
            typedArray.byteOffset,
            typedArray.byteLength
        )
    );
}


function decodeFloat32(base64, expectedLength) {
    const bytes = base64ToBytes(base64);

    if (bytes.byteLength !== expectedLength * 4) {
        throw new Error("玉石頂點壓縮資料長度不正確。");
    }

    const copy = bytes.slice();

    return Array.from(
        new Float32Array(copy.buffer)
    );
}


function decodeIndices(base64, expectedLength, bytesPerIndex) {
    const bytes = base64ToBytes(base64);

    const expectedBytes =
        expectedLength * bytesPerIndex;

    if (bytes.byteLength !== expectedBytes) {
        throw new Error("玉石面索引壓縮資料長度不正確。");
    }

    const copy = bytes.slice();

    if (bytesPerIndex === 2) {
        return Array.from(
            new Uint16Array(copy.buffer)
        );
    }

    if (bytesPerIndex === 4) {
        return Array.from(
            new Uint32Array(copy.buffer)
        );
    }

    throw new Error("未知的玉石索引編碼格式。");
}


// =====================================
// 幾何資料壓縮
// =====================================

function canCompactGeometry(value) {
    if (
        !value ||
        typeof value !== "object" ||
        !Array.isArray(value.vertices) ||
        !Array.isArray(value.faces) ||
        value.vertices.length < 4 ||
        value.faces.length < 4
    ) {
        return false;
    }

    for (const vertex of value.vertices) {
        if (
            !Array.isArray(vertex) ||
            vertex.length !== 3 ||
            !vertex.every(Number.isFinite)
        ) {
            return false;
        }
    }

    let maxIndex = 0;

    for (const face of value.faces) {
        if (
            !Array.isArray(face) ||
            face.length !== 3 ||
            !face.every(index =>
                Number.isInteger(index) &&
                index >= 0 &&
                index < value.vertices.length
            )
        ) {
            return false;
        }

        maxIndex = Math.max(
            maxIndex,
            ...face
        );
    }

    return maxIndex <= 0xFFFFFFFF;
}


function compactGeometry(geometry) {
    const vertexValues = new Float32Array(
        geometry.vertices.length * 3
    );

    let vertexOffset = 0;

    for (const vertex of geometry.vertices) {
        vertexValues[vertexOffset++] = vertex[0];
        vertexValues[vertexOffset++] = vertex[1];
        vertexValues[vertexOffset++] = vertex[2];
    }

    const maxIndex = geometry.vertices.length - 1;

    const indexBytes = maxIndex <= 0xFFFF
        ? 2
        : 4;

    const indexValues = indexBytes === 2
        ? new Uint16Array(geometry.faces.length * 3)
        : new Uint32Array(geometry.faces.length * 3);

    let indexOffset = 0;

    for (const face of geometry.faces) {
        indexValues[indexOffset++] = face[0];
        indexValues[indexOffset++] = face[1];
        indexValues[indexOffset++] = face[2];
    }

    const result = {};

    for (const [key, value] of Object.entries(geometry)) {
        if (key !== "vertices" && key !== "faces") {
            result[key] = packSaveData(value);
        }
    }

    result[COMPACT_GEOMETRY_KEY] = {
        version: 1,

        vertexCount: geometry.vertices.length,
        faceCount: geometry.faces.length,

        indexBytes,

        vertices: encodeTypedArray(vertexValues),
        faces: encodeTypedArray(indexValues)
    };

    return result;
}


// =====================================
// 幾何資料還原
// =====================================

function expandGeometry(geometry) {
    const packed = geometry[COMPACT_GEOMETRY_KEY];

    if (!packed || packed.version !== 1) {
        throw new Error("不支援的玉石幾何壓縮版本。");
    }

    const vertexCount = packed.vertexCount;
    const faceCount = packed.faceCount;

    if (
        !Number.isInteger(vertexCount) ||
        !Number.isInteger(faceCount) ||
        vertexCount < 4 ||
        faceCount < 4
    ) {
        throw new Error("玉石幾何資料數量不正確。");
    }

    const flatVertices = decodeFloat32(
        packed.vertices,
        vertexCount * 3
    );

    const flatFaces = decodeIndices(
        packed.faces,
        faceCount * 3,
        packed.indexBytes
    );

    const vertices = [];
    const faces = [];

    for (let index = 0; index < vertexCount; index++) {
        const offset = index * 3;

        vertices.push([
            flatVertices[offset],
            flatVertices[offset + 1],
            flatVertices[offset + 2]
        ]);
    }

    for (let index = 0; index < faceCount; index++) {
        const offset = index * 3;

        faces.push([
            flatFaces[offset],
            flatFaces[offset + 1],
            flatFaces[offset + 2]
        ]);
    }

    const result = {};

    for (const [key, value] of Object.entries(geometry)) {
        if (key !== COMPACT_GEOMETRY_KEY) {
            result[key] = unpackSaveData(value);
        }
    }

    result.vertices = vertices;
    result.faces = faces;

    return result;
}


// =====================================
// 遞迴處理存檔
// =====================================

function packSaveData(value) {
    if (Array.isArray(value)) {
        return value.map(item => packSaveData(item));
    }

    if (!value || typeof value !== "object") {
        return value;
    }

    if (value[COMPACT_GEOMETRY_KEY]) {
        return value;
    }

    if (canCompactGeometry(value)) {
        return compactGeometry(value);
    }

    const result = {};

    for (const [key, child] of Object.entries(value)) {
        result[key] = packSaveData(child);
    }

    return result;
}


function unpackSaveData(value) {
    if (Array.isArray(value)) {
        return value.map(item => unpackSaveData(item));
    }

    if (!value || typeof value !== "object") {
        return value;
    }

    if (value[COMPACT_GEOMETRY_KEY]) {
        return expandGeometry(value);
    }

    const result = {};

    for (const [key, child] of Object.entries(value)) {
        result[key] = unpackSaveData(child);
    }

    return result;
}


// =====================================
// 存檔合併
// =====================================

function mergeSave(parsed) {
    const data = {
        ...structuredClone(DEFAULT_SAVE),
        ...parsed
    };

    data.player = {
        ...DEFAULT_SAVE.player,
        ...(parsed.player ?? {})
    };

    data.cat = {
        ...DEFAULT_SAVE.cat,
        ...(parsed.cat ?? {})
    };

    data.market = {
        ...DEFAULT_SAVE.market,
        ...(parsed.market ?? {})
    };

    data.statistics = {
        ...DEFAULT_SAVE.statistics,
        ...(parsed.statistics ?? {})
    };

    data.gachaPity = {
        ...DEFAULT_SAVE.gachaPity,
        ...(parsed.gachaPity ?? {})
    };

    const arrayFields = [
        "inventory",
        "collection",
        "products",
        "museum",
        "dex",
        "achievements"
    ];

    for (const field of arrayFields) {
        data[field] = Array.isArray(parsed[field])
            ? parsed[field]
            : [];
    }

    data.version = 2;

    return data;
}


// =====================================
// 玉料幾何資料檢查
// =====================================

function hasValidGeometry(geometry) {
    if (
        !geometry ||
        !Array.isArray(geometry.vertices) ||
        !Array.isArray(geometry.faces) ||
        geometry.vertices.length < 4 ||
        geometry.faces.length < 4
    ) {
        return false;
    }

    try {
        jadeGeometryGenerator.validate(geometry);
        return true;
    } catch {
        return false;
    }
}


// =====================================
// 舊版玉料幾何資料遷移
// =====================================

function repairMassGeometry(mass) {
    if (!mass || typeof mass !== "object") {
        return false;
    }

    if (hasValidGeometry(mass.geometry)) {
        return false;
    }

    if (mass.placementApplied === true) {
        console.warn(
            "略過已定位但缺少幾何資料的玉料：",
            mass.id
        );

        return false;
    }

    if (
        !mass.id ||
        !mass.jadeType ||
        !mass.rarity
    ) {
        console.warn(
            "玉料缺少生成所需的識別資料：",
            mass
        );

        return false;
    }

    try {
        const geometry = jadeGeometryGenerator.generate(
            mass.jadeType,
            mass.rarity,
            mass.id
        );

        if (!hasValidGeometry(geometry)) {
            throw new Error("重新生成的幾何資料未通過驗證。");
        }

        mass.geometry = geometry;

        return true;

    } catch (error) {
        console.error(
            "玉料幾何資料修復失敗：",
            mass.id,
            error
        );

        return false;
    }
}


// =====================================
// 原石玉料資料遷移
// =====================================

function repairLegacyJadeGeometry(data) {
    const result = {
        repaired: 0,
        failed: 0,
        skipped: 0
    };

    if (!Array.isArray(data.inventory)) {
        return result;
    }

    for (const stone of data.inventory) {
        if (stone.status !== "uncut") {
            continue;
        }

        const jadeData = stone.jadeData;

        if (!jadeData) {
            continue;
        }

        const massGroups = [
            jadeData.masses,
            jadeData.discardedMasses
        ];

        for (const masses of massGroups) {
            if (!Array.isArray(masses)) {
                continue;
            }

            for (const mass of masses) {
                if (hasValidGeometry(mass?.geometry)) {
                    continue;
                }

                if (
                    !mass?.id ||
                    !mass?.jadeType ||
                    !mass?.rarity ||
                    mass.placementApplied === true
                ) {
                    result.skipped++;
                    continue;
                }

                if (repairMassGeometry(mass)) {
                    result.repaired++;
                } else {
                    result.failed++;
                }
            }
        }
    }

    if (
        result.repaired > 0 ||
        result.failed > 0 ||
        result.skipped > 0
    ) {
        console.log(
            "========== 玉料幾何資料遷移 =========="
        );

        console.log("成功補回：", result.repaired);
        console.log("修復失敗：", result.failed);
        console.log("略過資料：", result.skipped);

        console.log(
            "===================================="
        );
    }

    return result;
}


// =====================================
// 存檔管理器
// =====================================

class SaveManager {
    constructor() {
        this.data = structuredClone(DEFAULT_SAVE);
    }


    // =================================
    // 載入存檔
    // =================================

    load() {
        try {
            const raw = localStorage.getItem(
                GAME_CONFIG.saveKey
            );

            if (!raw) {
                this.data = structuredClone(DEFAULT_SAVE);

                this.save();

                return this.data;
            }

            const parsed = JSON.parse(raw);

            if (
                !parsed ||
                typeof parsed !== "object"
            ) {
                throw new Error("存檔格式錯誤");
            }

            // 自動辨識舊版與壓縮版存檔。
            const expanded = unpackSaveData(parsed);

            this.data = mergeSave(expanded);

            repairLegacyJadeGeometry(this.data);

            // 將舊版存檔轉成壓縮格式。
            const saved = this.save();

            if (!saved) {
                console.error(
                    "存檔格式轉換失敗，" +
                    "目前資料仍保留在記憶體中。"
                );
            }

            return this.data;

        } catch (error) {
            console.error(
                "讀取存檔失敗：",
                error
            );

            // 不因個別幾何資料錯誤而重置整份存檔。
            if (this.data?.inventory?.length > 0) {
                return this.data;
            }

            this.data = structuredClone(DEFAULT_SAVE);

            this.save();

            return this.data;
        }
    }


    // =================================
    // 保存存檔
    // =================================

    save() {
        try {
            // 幾何資料只在寫入時壓縮。
            // 遊戲執行期間仍使用原本的陣列結構。
            const compacted = packSaveData(this.data);

            const serialized = JSON.stringify(compacted);

            localStorage.setItem(
                GAME_CONFIG.saveKey,
                serialized
            );

            return true;

        } catch (error) {
            console.error(
                "儲存存檔失敗：",
                error
            );

            if (error?.name === "QuotaExceededError") {
                console.error(
                    "存檔仍超過瀏覽器儲存上限。" +
                    "原始遊戲資料沒有被刪除。"
                );
            }

            return false;
        }
    }


    // =================================
    // 取得存檔
    // =================================

    getData() {
        return this.data;
    }


    // =================================
    // 更新存檔
    // =================================

    update(patch) {
        const previous = this.data;

        this.data = {
            ...this.data,
            ...patch
        };

        if (!this.save()) {
            this.data = previous;
            return false;
        }

        return true;
    }


    // =================================
    // 重置存檔
    // =================================

    reset() {
        const previousData = this.data;

        this.data = structuredClone(DEFAULT_SAVE);

        if (this.save()) {
            return true;
        }

        this.data = previousData;

        return false;
    }


    // =================================
    // 匯出備份
    // =================================

    exportBackup() {
        // 備份仍使用完整、可讀取的原始資料格式。
        return JSON.stringify(
            this.data,
            null,
            2
        );
    }


    // =================================
    // 匯入備份
    // =================================

    importBackup(json) {
        try {
            const parsed = JSON.parse(json);

            if (
                !parsed ||
                typeof parsed !== "object" ||
                !Array.isArray(parsed.inventory)
            ) {
                throw new Error("備份檔案格式錯誤");
            }

            // 支援匯入一般 JSON 與壓縮版 JSON。
            const expanded = unpackSaveData(parsed);

            const previous = this.data;

            this.data = mergeSave(expanded);

            repairLegacyJadeGeometry(this.data);

            if (!this.save()) {
                this.data = previous;

                return {
                    success: false,
                    message: "備份匯入失敗，原存檔已保留。"
                };
            }

            return {
                success: true,
                message: "備份匯入成功。"
            };

        } catch (error) {
            return {
                success: false,
                message: error.message
            };
        }
    }
}


export const saveManager = new SaveManager();

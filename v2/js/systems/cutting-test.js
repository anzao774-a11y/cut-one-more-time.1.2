// v2/js/systems/cutting-test.js

import { geometryEngine } from "./geometry-engine.js";

import {
    TEST_STONE,
    TEST_CUT_PLANE
} from "./cutting-test-data.js";

export function runCuttingTest() {
    try {
        const result = geometryEngine.split(
            TEST_STONE,
            TEST_CUT_PLANE
        );

        console.log("原石切割測試結果：", result);

        if (!result.success) {
            console.error("切割失敗：", result.reason);
            return result;
        }

        console.log("正面幾何：", result.positive);
        console.log("反面幾何：", result.negative);
        console.log("切割截面：", result.cutSurface);
        console.log("切割統計：", result.statistics);

        return result;
    } catch (error) {
        console.error("幾何測試發生錯誤：", error);
        return {
            success: false,
            reason: error.message
        };
    }
}

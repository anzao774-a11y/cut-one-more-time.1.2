// v2/js/systems/cutting-test.js

import { cuttingSystem } from "./cutting-system.js";

import {
    TEST_STONE,
    TEST_CUT_PLANE
} from "./cutting-test-data.js";

export function runCuttingTest() {
    console.log("===== 原石切割測試開始 =====");

    const result = cuttingSystem.cut(
        TEST_STONE,
        TEST_CUT_PLANE
    );

    if (!result.success) {
        console.error("切割測試失敗：", result.reason);
        return result;
    }

    console.log("切割成功！");
    console.log("正面原石：", result.positive);
    console.log("反面原石：", result.negative);
    console.log("切割截面：", result.cutSurface);
    console.log("切割平面：", result.plane);
    console.log("切割統計：", result.statistics);

    console.log("===== 原石切割測試結束 =====");

    return result;
}

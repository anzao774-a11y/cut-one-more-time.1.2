
// js/systems/cutting-test.js

// 使用版本參數，避免載入舊版切割系統
import { cuttingSystem } from "./cutting-system.js?version=2";

import {
    testCube,
    testCutPlane
} from "./cutting-test-data.js";

export function runCuttingTest() {
    console.log("開始測試刀片厚度切割系統");

    try {
        const result = cuttingSystem.cutStone(
            testCube,
            testCutPlane
        );

        if (
            !result ||
            !result.positivePiece ||
            !result.negativePiece
        ) {
            throw new Error("切割結果缺少兩側原石模型");
        }

        console.log("切割成功！");
        console.log("------------------------");

        console.log("刀片厚度：", result.bladeThickness);

        console.log("原始體積：", result.originalVolume);

        console.log("正側保留體積：", result.positiveVolume);

        console.log("負側保留體積：", result.negativeVolume);

        console.log("移除材料體積：", result.removedVolume);

        console.log("------------------------");

        console.log(
            "正側頂點數：",
            result.positivePiece.vertices.length
        );

        console.log(
            "正側面數：",
            result.positivePiece.faces.length
        );

        console.log(
            "負側頂點數：",
            result.negativePiece.vertices.length
        );

        console.log(
            "負側面數：",
            result.negativePiece.faces.length
        );

        console.log("------------------------");
        console.log("完整切割結果：", result);

        return result;

    } catch (error) {
        console.error("切割測試失敗：", error);

        return null;
    }
}

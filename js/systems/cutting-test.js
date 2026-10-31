// js/systems/cutting-test.js

// 載入新版切割系統
import { cuttingSystem } from "./cutting-system.js?version=3";

import {
    testCube,
    testCutPlane
} from "./cutting-test-data.js";

export function runCuttingTest() {
    console.log("開始測試刀片厚度切割系統");
    console.log("========================");

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

        const expected = {
            originalVolume: 8,
            positiveVolume: 3.95,
            negativeVolume: 3.95,
            removedVolume: 0.1
        };

        const tolerance = 1e-6;

        const checks = [
            {
                name: "原始體積",
                actual: result.originalVolume,
                expected: expected.originalVolume
            },
            {
                name: "正側保留體積",
                actual: result.positiveVolume,
                expected: expected.positiveVolume
            },
            {
                name: "負側保留體積",
                actual: result.negativeVolume,
                expected: expected.negativeVolume
            },
            {
                name: "移除材料體積",
                actual: result.removedVolume,
                expected: expected.removedVolume
            }
        ];

        console.log("切割結果：");
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

        let allPassed = true;

        console.log("體積驗證：");

        for (const check of checks) {
            const passed =
                Math.abs(check.actual - check.expected) <= tolerance;

            if (!passed) {
                allPassed = false;
            }

            console.log(
                `${passed ? "通過" : "失敗"}：${check.name}`,
                `實際=${check.actual}`,
                `預期=${check.expected}`
            );
        }

        const totalVolume =
            result.positiveVolume +
            result.negativeVolume +
            result.removedVolume;

        const volumeDifference = Math.abs(
            result.originalVolume - totalVolume
        );

        const conservationPassed = volumeDifference <= tolerance;

        if (!conservationPassed) {
            allPassed = false;
        }

        console.log("------------------------");

        console.log(
            `${conservationPassed ? "通過" : "失敗"}：體積守恆`,
            `原始=${result.originalVolume}`,
            `切割後總和=${totalVolume}`
        );

        console.log("========================");

        if (allPassed) {
            console.log("全部測試通過！");
        } else {
            console.error("測試未完全通過，請檢查幾何引擎。");
        }

        console.log("完整切割結果：", result);

        return {
            success: allPassed,
            result,
            checks,
            totalVolume,
            volumeDifference
        };

    } catch (error) {
        console.error("切割測試失敗：", error);

        return {
            success: false,
            error: error.message
        };
    }
}

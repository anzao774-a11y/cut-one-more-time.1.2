// js/systems/cutting-test.js

import { cuttingSystem } from "./cutting-system.js?version=4";

import {
    testCube,
    testCutPlane
} from "./cutting-test-data.js";

// 數值誤差容許值
const TOLERANCE = 1e-6;

// 檢查模型是否封閉
function checkClosedMesh(mesh) {
    const edgeCounts = new Map();

    for (const face of mesh.faces) {
        for (let i = 0; i < 3; i++) {
            const a = face[i];
            const b = face[(i + 1) % 3];

            const key = a < b
                ? `${a},${b}`
                : `${b},${a}`;

            edgeCounts.set(
                key,
                (edgeCounts.get(key) || 0) + 1
            );
        }
    }

    const invalidEdges = [];

    for (const [edge, count] of edgeCounts) {
        if (count !== 2) {
            invalidEdges.push({
                edge,
                count
            });
        }
    }

    return {
        closed: invalidEdges.length === 0,
        totalEdges: edgeCounts.size,
        invalidEdges
    };
}

// 執行單次切割測試
function runSingleTest(name, mesh, plane) {
    console.log(`開始測試：${name}`);
    console.log("------------------------");

    try {
        const result = cuttingSystem.cutStone(mesh, plane);

        const positiveClosed = checkClosedMesh(
            result.positivePiece
        );

        const negativeClosed = checkClosedMesh(
            result.negativePiece
        );

        const totalVolume =
            result.positiveVolume +
            result.negativeVolume +
            result.removedVolume;

        const volumeDifference = Math.abs(
            result.originalVolume - totalVolume
        );

        const volumePassed = volumeDifference <= TOLERANCE;

        const positivePassed = positiveClosed.closed;
        const negativePassed = negativeClosed.closed;

        const allPassed =
            volumePassed &&
            positivePassed &&
            negativePassed;

        console.log("刀片厚度：", result.bladeThickness);
        console.log("原始體積：", result.originalVolume);
        console.log("正側保留體積：", result.positiveVolume);
        console.log("負側保留體積：", result.negativeVolume);
        console.log("移除材料體積：", result.removedVolume);
        console.log("切割後總體積：", totalVolume);
        console.log("體積誤差：", volumeDifference);

        console.log("------------------------");

        console.log(
            "正側模型封閉：",
            positivePassed ? "通過" : "失敗"
        );

        console.log(
            "正側邊數：",
            positiveClosed.totalEdges
        );

        console.log(
            "正側異常邊數：",
            positiveClosed.invalidEdges.length
        );

        console.log(
            "負側模型封閉：",
            negativePassed ? "通過" : "失敗"
        );

        console.log(
            "負側邊數：",
            negativeClosed.totalEdges
        );

        console.log(
            "負側異常邊數：",
            negativeClosed.invalidEdges.length
        );

        console.log("------------------------");

        console.log(
            "體積守恆：",
            volumePassed ? "通過" : "失敗"
        );

        console.log(
            "測試總結果：",
            allPassed ? "全部通過" : "尚未通過"
        );

        if (!positivePassed) {
            console.error(
                "正側異常邊：",
                positiveClosed.invalidEdges
            );
        }

        if (!negativePassed) {
            console.error(
                "負側異常邊：",
                negativeClosed.invalidEdges
            );
        }

        console.log("========================");

        return {
            name,
            success: allPassed,
            result,
            volumePassed,
            positiveClosed,
            negativeClosed,
            totalVolume,
            volumeDifference
        };

    } catch (error) {
        console.error(`${name} 測試失敗：`, error);

        return {
            name,
            success: false,
            error: error.message
        };
    }
}

// 執行全部切割測試
export function runCuttingTest() {
    console.log("開始執行切割系統測試");
    console.log("刀片厚度：0.025");
    console.log("========================");

    cuttingSystem.setBladeThickness(0.025);

    const tests = [
        {
            name: "X 軸垂直切割",
            plane: testCutPlane
        },
        {
            name: "三軸斜向切割",
            plane: {
                point: [0, 0, 0],
                normal: [1, 1, 1]
            }
        }
    ];

    const results = [];

    for (const test of tests) {
        const result = runSingleTest(
            test.name,
            testCube,
            test.plane
        );

        results.push(result);
    }

    const allPassed = results.every(
        result => result.success
    );

    console.log("切割系統測試總結");
    console.log("========================");

    for (const result of results) {
        console.log(
            `${result.success ? "通過" : "失敗"}：${result.name}`
        );
    }

    console.log("------------------------");

    console.log(
        allPassed
            ? "全部測試通過！"
            : "仍有測試項目需要修正。"
    );

    return {
        success: allPassed,
        results
    };
}

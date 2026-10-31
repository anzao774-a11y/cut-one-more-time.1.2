// js/systems/cutting-test.js

import { cuttingSystem } from "./cutting-system.js";
import {
    testCube,
    testCutPlane
} from "./cutting-test-data.js";

export function runCuttingTest() {
    console.log("開始測試切割系統");

    try {
        const result = cuttingSystem.cutStone(
            testCube,
            testCutPlane
        );

        console.log("切割成功");
        console.log("原始頂點數：", testCube.vertices.length);
        console.log("原始面數：", testCube.faces.length);
        console.log("切割後頂點數：", result.vertices.length);
        console.log("切割後面數：", result.faces.length);
        console.log("切割結果：", result);

        return result;
    } catch (error) {
        console.error("切割測試失敗：", error);
        return null;
    }
}

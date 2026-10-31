// v2/js/systems/cutting-test-data.js

export const TEST_STONE = {
    vertices: [
        { x: -1, y: -1, z: -1 },
        { x:  1, y: -1, z: -1 },
        { x:  1, y:  1, z: -1 },
        { x: -1, y:  1, z: -1 },
        { x: -1, y: -1, z:  1 },
        { x:  1, y: -1, z:  1 },
        { x:  1, y:  1, z:  1 },
        { x: -1, y:  1, z:  1 }
    ],

    faces: [
        [0, 2, 1], [0, 3, 2],
        [4, 5, 6], [4, 6, 7],
        [0, 1, 5], [0, 5, 4],
        [1, 2, 6], [1, 6, 5],
        [2, 3, 7], [2, 7, 6],
        [3, 0, 4], [3, 4, 7]
    ]
};

export const TEST_CUT_PLANE = {
    point: { x: 0, y: 0, z: 0 },
    normal: { x: 1, y: 0, z: 0 }
};

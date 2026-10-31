
/**
 * mesh-geometry-utils.js
 *
 * 通用三角網格幾何工具。
 * 用於模型邊界計算、縮放、平移、旋轉及置中。
 *
 * Mesh 格式：
 * {
 *   vertices: [[x, y, z], ...],
 *   faces: [[a, b, c], ...]
 * }
 */

class MeshGeometryUtils {
    validate(mesh) {
        if (
            !mesh ||
            !Array.isArray(mesh.vertices) ||
            !Array.isArray(mesh.faces)
        ) {
            throw new Error("模型資料格式錯誤");
        }

        if (mesh.vertices.length < 4 || mesh.faces.length < 4) {
            throw new Error("模型資料不足");
        }

        for (const vertex of mesh.vertices) {
            if (
                !Array.isArray(vertex) ||
                vertex.length !== 3 ||
                !vertex.every(Number.isFinite)
            ) {
                throw new Error("模型頂點資料無效");
            }
        }

        for (const face of mesh.faces) {
            if (
                !Array.isArray(face) ||
                face.length !== 3 ||
                !face.every(index =>
                    Number.isInteger(index) &&
                    index >= 0 &&
                    index < mesh.vertices.length
                )
            ) {
                throw new Error("模型三角面資料無效");
            }
        }

        return true;
    }

    clone(mesh) {
        this.validate(mesh);

        return {
            ...mesh,
            vertices: mesh.vertices.map(vertex => [...vertex]),
            faces: mesh.faces.map(face => [...face])
        };
    }

    getBounds(mesh) {
        this.validate(mesh);

        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];

        for (const vertex of mesh.vertices) {
            for (let axis = 0; axis < 3; axis++) {
                min[axis] = Math.min(min[axis], vertex[axis]);
                max[axis] = Math.max(max[axis], vertex[axis]);
            }
        }

        const size = [
            max[0] - min[0],
            max[1] - min[1],
            max[2] - min[2]
        ];

        const center = [
            (min[0] + max[0]) / 2,
            (min[1] + max[1]) / 2,
            (min[2] + max[2]) / 2
        ];

        return { min, max, size, center };
    }

    getVolume(mesh) {
        this.validate(mesh);

        let volume = 0;

        for (const face of mesh.faces) {
            const a = mesh.vertices[face[0]];
            const b = mesh.vertices[face[1]];
            const c = mesh.vertices[face[2]];

            volume += (
                a[0] * (b[1] * c[2] - b[2] * c[1]) +
                a[1] * (b[2] * c[0] - b[0] * c[2]) +
                a[2] * (b[0] * c[1] - b[1] * c[0])
            ) / 6;
        }

        return Math.abs(volume);
    }

    translate(mesh, offset) {
        this.validate(mesh);

        if (
            !Array.isArray(offset) ||
            offset.length !== 3 ||
            !offset.every(Number.isFinite)
        ) {
            throw new Error("平移參數無效");
        }

        const result = this.clone(mesh);

        result.vertices = result.vertices.map(vertex => [
            vertex[0] + offset[0],
            vertex[1] + offset[1],
            vertex[2] + offset[2]
        ]);

        return result;
    }

    scale(mesh, scale) {
        this.validate(mesh);

        const values = typeof scale === "number"
            ? [scale, scale, scale]
            : scale;

        if (
            !Array.isArray(values) ||
            values.length !== 3 ||
            !values.every(value =>
                Number.isFinite(value) && value > 0
            )
        ) {
            throw new Error("縮放參數必須是正數");
        }

        const result = this.clone(mesh);

        result.vertices = result.vertices.map(vertex => [
            vertex[0] * values[0],
            vertex[1] * values[1],
            vertex[2] * values[2]
        ]);

        return result;
    }

    rotate(mesh, rotation) {
        this.validate(mesh);

        const angles = [
            Number(rotation?.x ?? 0),
            Number(rotation?.y ?? 0),
            Number(rotation?.z ?? 0)
        ];

        if (!angles.every(Number.isFinite)) {
            throw new Error("旋轉角度無效");
        }

        const result = this.clone(mesh);

        const [rx, ry, rz] = angles;

        const cx = Math.cos(rx);
        const sx = Math.sin(rx);
        const cy = Math.cos(ry);
        const sy = Math.sin(ry);
        const cz = Math.cos(rz);
        const sz = Math.sin(rz);

        result.vertices = result.vertices.map(vertex => {
            let [x, y, z] = vertex;

            // X 軸旋轉
            [x, y, z] = [
                x,
                y * cx - z * sx,
                y * sx + z * cx
            ];

            // Y 軸旋轉
            [x, y, z] = [
                x * cy + z * sy,
                y,
                -x * sy + z * cy
            ];

            // Z 軸旋轉
            [x, y, z] = [
                x * cz - y * sz,
                x * sz + y * cz,
                z
            ];

            return [x, y, z];
        });

        return result;
    }

    center(mesh) {
        const bounds = this.getBounds(mesh);

        return this.translate(mesh, [
            -bounds.center[0],
            -bounds.center[1],
            -bounds.center[2]
        ]);
    }

    fitInside(mesh, targetSize, padding = 0) {
        this.validate(mesh);

        const target = typeof targetSize === "number"
            ? [targetSize, targetSize, targetSize]
            : targetSize;

        if (
            !Array.isArray(target) ||
            target.length !== 3 ||
            !target.every(value =>
                Number.isFinite(value) && value > 0
            )
        ) {
            throw new Error("目標尺寸無效");
        }

        if (!Number.isFinite(padding) || padding < 0 || padding >= 0.5) {
            throw new Error("邊界留白必須介於 0 至 0.5 之間");
        }

        const centered = this.center(mesh);
        const bounds = this.getBounds(centered);

        const ratios = bounds.size.map((size, axis) =>
            size > 1e-10 ? target[axis] / size : Infinity
        );

        const uniformScale = Math.min(...ratios) * (1 - padding * 2);

        if (!Number.isFinite(uniformScale) || uniformScale <= 0) {
            throw new Error("無法計算有效縮放比例");
        }

        return this.scale(centered, uniformScale);
    }

    transform(mesh, options = {}) {
        let result = this.clone(mesh);

        if (options.center !== false) {
            result = this.center(result);
        }

        if (options.rotation) {
            result = this.rotate(result, options.rotation);
        }

        if (options.scale !== undefined) {
            result = this.scale(result, options.scale);
        }

        if (options.position) {
            result = this.translate(result, options.position);
        }

        return result;
    }

    isInsideBounds(mesh, bounds, tolerance = 1e-6) {
        this.validate(mesh);

        if (
            !bounds ||
            !Array.isArray(bounds.min) ||
            !Array.isArray(bounds.max)
        ) {
            throw new Error("目標邊界資料無效");
        }

        for (const vertex of mesh.vertices) {
            for (let axis = 0; axis < 3; axis++) {
                if (
                    vertex[axis] < bounds.min[axis] - tolerance ||
                    vertex[axis] > bounds.max[axis] + tolerance
                ) {
                    return false;
                }
            }
        }

        return true;
    }
}

export const meshGeometryUtils = new MeshGeometryUtils();

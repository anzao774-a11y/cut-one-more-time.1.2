
/**
 * mesh-geometry-utils.js
 * 通用三角網格幾何工具。
 *
 * Mesh:
 * {
 *   vertices: [[x, y, z], ...],
 *   faces: [[a, b, c], ...]
 * }
 */

class MeshGeometryUtils {
    validate(mesh) {
        if (!mesh || !Array.isArray(mesh.vertices) ||
            !Array.isArray(mesh.faces)) {
            throw new Error("模型資料格式錯誤");
        }

        if (mesh.vertices.length < 4 || mesh.faces.length < 4) {
            throw new Error("模型資料不足");
        }

        for (const v of mesh.vertices) {
            if (!Array.isArray(v) || v.length !== 3 ||
                !v.every(Number.isFinite)) {
                throw new Error("模型頂點資料無效");
            }
        }

        for (const f of mesh.faces) {
            if (!Array.isArray(f) || f.length !== 3 ||
                !f.every(i => Number.isInteger(i) &&
                    i >= 0 && i < mesh.vertices.length)) {
                throw new Error("模型三角面資料無效");
            }
        }

        return true;
    }

    clone(mesh) {
        this.validate(mesh);
        return {
            ...mesh,
            vertices: mesh.vertices.map(v => [...v]),
            faces: mesh.faces.map(f => [...f])
        };
    }

    getBounds(mesh) {
        this.validate(mesh);

        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];

        for (const v of mesh.vertices) {
            for (let i = 0; i < 3; i++) {
                min[i] = Math.min(min[i], v[i]);
                max[i] = Math.max(max[i], v[i]);
            }
        }

        const size = max.map((v, i) => v - min[i]);
        const center = max.map((v, i) => (v + min[i]) / 2);

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

        if (!Array.isArray(offset) || offset.length !== 3 ||
            !offset.every(Number.isFinite)) {
            throw new Error("平移參數無效");
        }

        const result = this.clone(mesh);

        result.vertices = result.vertices.map(v =>
            v.map((value, i) => value + offset[i])
        );

        return result;
    }

    scale(mesh, scale) {
        this.validate(mesh);

        const values = typeof scale === "number"
            ? [scale, scale, scale]
            : scale;

        if (!Array.isArray(values) || values.length !== 3 ||
            !values.every(v => Number.isFinite(v) && v > 0)) {
            throw new Error("縮放參數必須是正數");
        }

        const result = this.clone(mesh);

        result.vertices = result.vertices.map(v =>
            v.map((value, i) => value * values[i])
        );

        return result;
    }

    rotate(mesh, rotation = {}) {
        this.validate(mesh);

        const rx = Number(rotation.x ?? 0);
        const ry = Number(rotation.y ?? 0);
        const rz = Number(rotation.z ?? 0);

        if (![rx, ry, rz].every(Number.isFinite)) {
            throw new Error("旋轉角度無效");
        }

        const cx = Math.cos(rx), sx = Math.sin(rx);
        const cy = Math.cos(ry), sy = Math.sin(ry);
        const cz = Math.cos(rz), sz = Math.sin(rz);

        const result = this.clone(mesh);

        result.vertices = result.vertices.map(vertex => {
            let [x, y, z] = vertex;

            [y, z] = [
                y * cx - z * sx,
                y * sx + z * cx
            ];

            [x, z] = [
                x * cy + z * sy,
                -x * sy + z * cy
            ];

            [x, y] = [
                x * cz - y * sz,
                x * sz + y * cz
            ];

            return [x, y, z];
        });

        return result;
    }

    center(mesh) {
        const bounds = this.getBounds(mesh);
        return this.translate(mesh, bounds.center.map(v => -v));
    }

    fitInside(mesh, targetSize, padding = 0) {
        this.validate(mesh);

        const target = typeof targetSize === "number"
            ? [targetSize, targetSize, targetSize]
            : targetSize;

        if (!Array.isArray(target) || target.length !== 3 ||
            !target.every(v => Number.isFinite(v) && v > 0)) {
            throw new Error("目標尺寸無效");
        }

        if (!Number.isFinite(padding) || padding < 0 || padding >= 0.5) {
            throw new Error("留白比例無效");
        }

        const centered = this.center(mesh);
        const bounds = this.getBounds(centered);

        const ratios = bounds.size.map((size, i) =>
            size > 1e-10 ? target[i] / size : Infinity
        );

        const factor = Math.min(...ratios) * (1 - padding * 2);

        if (!Number.isFinite(factor) || factor <= 0) {
            throw new Error("無法計算縮放比例");
        }

        return this.scale(centered, factor);
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

        if (!bounds || !Array.isArray(bounds.min) ||
            !Array.isArray(bounds.max) ||
            bounds.min.length !== 3 || bounds.max.length !== 3) {
            throw new Error("邊界資料無效");
        }

        return mesh.vertices.every(v =>
            v.every((value, i) =>
                value >= bounds.min[i] - tolerance &&
                value <= bounds.max[i] + tolerance
            )
        );
    }
}

export const meshGeometryUtils = new MeshGeometryUtils();


/**
 * mesh-placement-utils.js
 *
 * 通用三角網格定位工具。
 *
 * 座標格式：
 * mesh = {
 *   vertices: [[x, y, z], ...],
 *   faces: [[a, b, c], ...]
 * }
 *
 * placement = {
 *   position: [x, y, z],
 *   rotation: { x, y, z }, // radians
 *   scale: number | [x, y, z]
 * }
 */

class MeshPlacementUtils {
    EPSILON = 1e-8;

    validateMesh(mesh) {
        if (
            !mesh ||
            !Array.isArray(mesh.vertices) ||
            !Array.isArray(mesh.faces) ||
            mesh.vertices.length < 3 ||
            mesh.faces.length < 1
        ) {
            throw new Error("模型資料不完整");
        }

        for (const vertex of mesh.vertices) {
            if (
                !Array.isArray(vertex) ||
                vertex.length !== 3 ||
                !vertex.every(Number.isFinite)
            ) {
                throw new Error("模型包含無效頂點");
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
                throw new Error("模型包含無效三角面");
            }
        }

        return true;
    }

    validateVector(vector, name) {
        if (
            !Array.isArray(vector) ||
            vector.length !== 3 ||
            !vector.every(Number.isFinite)
        ) {
            throw new Error(`${name} 必須是三維數值陣列`);
        }
    }

    getBounds(mesh) {
        this.validateMesh(mesh);

        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];

        for (const vertex of mesh.vertices) {
            for (let axis = 0; axis < 3; axis++) {
                min[axis] = Math.min(min[axis], vertex[axis]);
                max[axis] = Math.max(max[axis], vertex[axis]);
            }
        }

        return {
            min,
            max,
            size: max.map((value, axis) => value - min[axis]),
            center: max.map((value, axis) =>
                (value + min[axis]) / 2
            )
        };
    }

    rotateVertex(vertex, rotation = {}) {
        const rx = rotation.x ?? 0;
        const ry = rotation.y ?? 0;
        const rz = rotation.z ?? 0;

        if (![rx, ry, rz].every(Number.isFinite)) {
            throw new Error("旋轉角度無效");
        }

        let [x, y, z] = vertex;

        // X 軸
        let nextY = y * Math.cos(rx) - z * Math.sin(rx);
        let nextZ = y * Math.sin(rx) + z * Math.cos(rx);

        y = nextY;
        z = nextZ;

        // Y 軸
        let nextX = x * Math.cos(ry) + z * Math.sin(ry);
        nextZ = -x * Math.sin(ry) + z * Math.cos(ry);

        x = nextX;
        z = nextZ;

        // Z 軸
        nextX = x * Math.cos(rz) - y * Math.sin(rz);
        nextY = x * Math.sin(rz) + y * Math.cos(rz);

        return [nextX, nextY, z];
    }

    rotateMesh(mesh, rotation = {}) {
        this.validateMesh(mesh);

        return {
            vertices: mesh.vertices.map(vertex =>
                this.rotateVertex(vertex, rotation)
            ),
            faces: mesh.faces.map(face => [...face])
        };
    }

    translate(mesh, position) {
        this.validateMesh(mesh);
        this.validateVector(position, "位置");

        return {
            vertices: mesh.vertices.map(vertex => [
                vertex[0] + position[0],
                vertex[1] + position[1],
                vertex[2] + position[2]
            ]),
            faces: mesh.faces.map(face => [...face])
        };
    }

    scaleMesh(mesh, scale) {
        this.validateMesh(mesh);

        const scaleVector = typeof scale === "number"
            ? [scale, scale, scale]
            : scale;

        this.validateVector(scaleVector, "縮放比例");

        if (scaleVector.some(value => value <= 0)) {
            throw new Error("縮放比例必須大於零");
        }

        return {
            vertices: mesh.vertices.map(vertex => [
                vertex[0] * scaleVector[0],
                vertex[1] * scaleVector[1],
                vertex[2] * scaleVector[2]
            ]),
            faces: mesh.faces.map(face => [...face])
        };
    }

    centerMesh(mesh) {
        const bounds = this.getBounds(mesh);

        return {
            vertices: mesh.vertices.map(vertex => [
                vertex[0] - bounds.center[0],
                vertex[1] - bounds.center[1],
                vertex[2] - bounds.center[2]
            ]),
            faces: mesh.faces.map(face => [...face])
        };
    }

    getScaleForBounds(mesh, targetSize, padding = 0.1) {
        const bounds = this.getBounds(mesh);

        this.validateVector(targetSize, "目標尺寸");

        if (
            targetSize.some(value => value <= 0) ||
            !Number.isFinite(padding) ||
            padding < 0 ||
            padding >= 0.5
        ) {
            throw new Error("目標尺寸或邊界留白設定錯誤");
        }

        const available = targetSize.map(
            value => value * (1 - padding * 2)
        );

        const ratios = bounds.size.map((size, axis) => {
            if (size <= this.EPSILON) {
                return Infinity;
            }

            return available[axis] / size;
        });

        const scale = Math.min(...ratios);

        if (!Number.isFinite(scale) || scale <= 0) {
            throw new Error("無法計算有效縮放比例");
        }

        return scale;
    }

    fitToBounds(mesh, targetSize, padding = 0.1) {
        const centered = this.centerMesh(mesh);

        const scale = this.getScaleForBounds(
            centered,
            targetSize,
            padding
        );

        const scaled = this.scaleMesh(centered, scale);

        return {
            vertices: scaled.vertices,
            faces: scaled.faces,
            scale
        };
    }

    isWithinBounds(mesh, bounds, tolerance = 1e-6) {
        this.validateMesh(mesh);

        if (
            !bounds ||
            !Array.isArray(bounds.min) ||
            !Array.isArray(bounds.max) ||
            bounds.min.length !== 3 ||
            bounds.max.length !== 3
        ) {
            throw new Error("目標邊界無效");
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

    getPositionFromNormalized(bounds, normalizedPosition = [0.5, 0.5, 0.5]) {
        this.validateVector(normalizedPosition, "標準化位置");

        if (
            normalizedPosition.some(value =>
                value < 0 || value > 1
            )
        ) {
            throw new Error("標準化位置必須介於 0 至 1");
        }

        return normalizedPosition.map((value, axis) =>
            bounds.min[axis] +
            (bounds.max[axis] - bounds.min[axis]) * value
        );
    }

    createPlacement(mesh, hostBounds, options = {}) {
        this.validateMesh(mesh);

        const rotation = options.rotation ?? {
            x: 0,
            y: 0,
            z: 0
        };

        const rotated = this.rotateMesh(mesh, rotation);

        const hostSize = hostBounds?.size ?? (
            hostBounds?.min && hostBounds?.max
                ? hostBounds.max.map((value, axis) =>
                    value - hostBounds.min[axis]
                )
                : null
        );

        if (!hostSize) {
            throw new Error("原石邊界資料無效");
        }

        const fitted = this.fitToBounds(
            rotated,
            hostSize,
            options.padding ?? 0.1
        );

        const normalizedPosition =
            options.normalizedPosition ?? [0.5, 0.5, 0.5];

        const position = options.position ??
            this.getPositionFromNormalized(
                hostBounds,
                normalizedPosition
            );

        this.validateVector(position, "最終位置");

        const translated = this.translate(
            fitted,
            position
        );

        const valid = this.isWithinBounds(
            translated,
            hostBounds
        );

        return {
            geometry: fitted,
            placement: {
                position: [...position],
                rotation: { ...rotation },
                scale: fitted.scale
            },
            bounds: this.getBounds(translated),
            insideHostBounds: valid
        };
    }
}

export const meshPlacementUtils =
    new MeshPlacementUtils();


import { geometryEngine } from "./geometry-engine.js?version=3";

class CuttingSystem {
    constructor() {
        this.lastResult = null;

        this.config = {
            bladeThickness: 0.025,
            tolerance: 1e-7
        };
    }

    validateMesh(mesh) {
        if (
            !mesh ||
            !Array.isArray(mesh.vertices) ||
            !Array.isArray(mesh.faces)
        ) {
            throw new Error("模型資料格式錯誤");
        }

        if (
            mesh.vertices.length < 4 ||
            mesh.faces.length < 4
        ) {
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

    normalizePlane(plane) {
        if (
            !plane ||
            !Array.isArray(plane.point) ||
            !Array.isArray(plane.normal) ||
            plane.point.length !== 3 ||
            plane.normal.length !== 3 ||
            !plane.point.every(Number.isFinite) ||
            !plane.normal.every(Number.isFinite)
        ) {
            throw new Error("切割平面設定錯誤");
        }

        const length = Math.hypot(...plane.normal);

        if (length < 1e-10) {
            throw new Error("切割平面法線不可為零");
        }

        return {
            point: [...plane.point],
            normal: plane.normal.map(value => value / length)
        };
    }

    signedDistance(vertex, plane) {
        return geometryEngine.dot(
            geometryEngine.subtract(vertex, plane.point),
            plane.normal
        );
    }

    classifyMesh(mesh, plane) {
        this.validateMesh(mesh);

        const distances = mesh.vertices.map(vertex =>
            this.signedDistance(vertex, plane)
        );

        const tolerance = this.config.tolerance;

        const positive = distances.some(
            distance => distance > tolerance
        );

        const negative = distances.some(
            distance => distance < -tolerance
        );

        const onPlane = distances.some(
            distance => Math.abs(distance) <= tolerance
        );

        let classification;

        if (positive && negative) {
            classification = "crossing";
        } else if (positive && onPlane) {
            classification = "positive-touching";
        } else if (negative && onPlane) {
            classification = "negative-touching";
        } else if (positive) {
            classification = "positive";
        } else if (negative) {
            classification = "negative";
        } else {
            classification = "coplanar";
        }

        return {
            classification,
            positive,
            negative,
            onPlane,
            minDistance: Math.min(...distances),
            maxDistance: Math.max(...distances)
        };
    }

    offsetPlane(plane, distance) {
        return {
            point: [
                plane.point[0] + plane.normal[0] * distance,
                plane.point[1] + plane.normal[1] * distance,
                plane.point[2] + plane.normal[2] * distance
            ],
            normal: [...plane.normal]
        };
    }

    calculateVolume(mesh) {
        this.validateMesh(mesh);

        let volume = 0;

        for (const face of mesh.faces) {
            const a = mesh.vertices[face[0]];
            const b = mesh.vertices[face[1]];
            const c = mesh.vertices[face[2]];

            volume += geometryEngine.dot(
                a,
                geometryEngine.cross(b, c)
            ) / 6;
        }

        return Math.abs(volume);
    }

    cutStone(mesh, plane) {
        this.validateMesh(mesh);

        const normalized = this.normalizePlane(plane);

        const thickness = this.config.bladeThickness;

        if (!Number.isFinite(thickness) || thickness < 0) {
            throw new Error("刀片厚度設定錯誤");
        }

        const classification = this.classifyMesh(
            mesh,
            normalized
        );

        if (classification.classification !== "crossing") {
            throw new Error(
                "切割平面沒有完整穿過原石，請調整切割位置。"
            );
        }

        const halfThickness = thickness / 2;

        const positivePlane = this.offsetPlane(
            normalized,
            halfThickness
        );

        const negativePlane = this.offsetPlane(
            normalized,
            -halfThickness
        );

        const positivePiece = geometryEngine.clipMesh(
            mesh,
            positivePlane
        );

        const negativePiece = geometryEngine.clipMesh(
            mesh,
            {
                point: negativePlane.point,
                normal: geometryEngine.scale(
                    normalized.normal,
                    -1
                )
            }
        );

        this.validateMesh(positivePiece);
        this.validateMesh(negativePiece);

        const originalVolume = this.calculateVolume(mesh);
        const positiveVolume = this.calculateVolume(positivePiece);
        const negativeVolume = this.calculateVolume(negativePiece);

        const removedVolume =
            originalVolume -
            positiveVolume -
            negativeVolume;

        if (removedVolume < -1e-6) {
            throw new Error(
                "切割結果體積超出原石體積，請檢查幾何封口。"
            );
        }

        const result = {
            positivePiece,
            negativePiece,

            originalVolume,
            positiveVolume,
            negativeVolume,

            removedVolume: Math.max(0, removedVolume),

            bladeThickness: thickness,

            cutPlane: {
                point: [...normalized.point],
                normal: [...normalized.normal]
            },

            classification,

            createdAt: Date.now()
        };

        this.lastResult = result;

        return result;
    }

    getLastResult() {
        return this.lastResult;
    }

    clearResult() {
        this.lastResult = null;
    }

    setBladeThickness(thickness) {
        if (
            !Number.isFinite(thickness) ||
            thickness < 0
        ) {
            throw new Error(
                "刀片厚度必須大於或等於零"
            );
        }

        this.config.bladeThickness = thickness;
    }

    getBladeThickness() {
        return this.config.bladeThickness;
    }
}

export const cuttingSystem = new CuttingSystem();

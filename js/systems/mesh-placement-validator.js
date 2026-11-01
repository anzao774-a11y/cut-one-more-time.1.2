
import { meshContainmentUtils } from "./mesh-containment-utils.js";

class MeshPlacementValidator {
    validateMesh(mesh) {
        return meshContainmentUtils.validateMesh(mesh);
    }

    rotateVertex(vertex, rotation = {}) {
        const rx = rotation.x ?? 0;
        const ry = rotation.y ?? 0;
        const rz = rotation.z ?? 0;

        if (![rx, ry, rz].every(Number.isFinite)) {
            throw new Error("旋轉角度無效");
        }

        let [x, y, z] = vertex;

        [y, z] = [
            y * Math.cos(rx) - z * Math.sin(rx),
            y * Math.sin(rx) + z * Math.cos(rx)
        ];

        [x, z] = [
            x * Math.cos(ry) + z * Math.sin(ry),
            -x * Math.sin(ry) + z * Math.cos(ry)
        ];

        [x, y] = [
            x * Math.cos(rz) - y * Math.sin(rz),
            x * Math.sin(rz) + y * Math.cos(rz)
        ];

        return [x, y, z];
    }

    transformMesh(mesh, placement = {}) {
        this.validateMesh(mesh);

        const position = placement.position ?? [0, 0, 0];
        const rotation = placement.rotation ?? {};
        const scale = placement.scale ?? 1;

        if (!Array.isArray(position) || position.length !== 3 ||
            !position.every(Number.isFinite)) {
            throw new Error("放置位置無效");
        }

        const scaleVector = typeof scale === "number"
            ? [scale, scale, scale]
            : scale;

        if (!Array.isArray(scaleVector) ||
            scaleVector.length !== 3 ||
            !scaleVector.every(v => Number.isFinite(v) && v > 0)) {
            throw new Error("縮放比例無效");
        }

        return {
            vertices: mesh.vertices.map(vertex => {
                const scaled = vertex.map((v, i) =>
                    v * scaleVector[i]
                );

                const rotated = this.rotateVertex(scaled, rotation);

                return rotated.map((v, i) => v + position[i]);
            }),
            faces: mesh.faces.map(face => [...face])
        };
    }

    getSamplePoints(mesh, includeFaceCenters = true) {
        this.validateMesh(mesh);

        const points = mesh.vertices.map(v => [...v]);

        if (includeFaceCenters) {
            for (const face of mesh.faces) {
                const a = mesh.vertices[face[0]];
                const b = mesh.vertices[face[1]];
                const c = mesh.vertices[face[2]];

                points.push([
                    (a[0] + b[0] + c[0]) / 3,
                    (a[1] + b[1] + c[1]) / 3,
                    (a[2] + b[2] + c[2]) / 3
                ]);
            }
        }

        return points;
    }

    validatePlacement(hostMesh, innerMesh, placement = {}, options = {}) {
        this.validateMesh(hostMesh);
        this.validateMesh(innerMesh);

        const transformed = this.transformMesh(innerMesh, placement);

        const samples = this.getSamplePoints(
            transformed,
            options.includeFaceCenters !== false
        );

        const tolerance = options.tolerance ?? 1e-6;

        const results = samples.map(point =>
            meshContainmentUtils.isPointInside(
                point,
                hostMesh,
                { tolerance }
            )
        );

        const insideCount = results.filter(r => r.inside).length;
        const surfaceCount = results.filter(r => r.onSurface).length;
        const outsideCount = results.filter(r => r.outside).length;

        return {
            valid: outsideCount === 0,
            totalSamples: samples.length,
            insideCount,
            surfaceCount,
            outsideCount,
            transformedMesh: transformed,
            results,
            message: outsideCount === 0
                ? "抽樣點均位於外部模型內部或表面"
                : "部分抽樣點位於外部模型之外"
        };
    }

    findFirstOutsidePoint(hostMesh, innerMesh, placement = {}) {
        const transformed = this.transformMesh(innerMesh, placement);
        const points = this.getSamplePoints(transformed);

        for (let index = 0; index < points.length; index++) {
            const result = meshContainmentUtils.isPointInside(
                points[index],
                hostMesh
            );

            if (result.outside) {
                return {
                    index,
                    point: points[index],
                    result
                };
            }
        }

        return null;
    }
}

export const meshPlacementValidator = new MeshPlacementValidator();

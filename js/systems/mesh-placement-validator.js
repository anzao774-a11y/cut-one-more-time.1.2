
/**
 * mesh-placement-validator.js
 *
 * 檢查一個三角網格經過縮放、旋轉、平移後，
 * 是否有抽樣頂點及面中心超出外部網格。
 *
 * 注意：
 * 這是抽樣檢查，不是數學上的完整包含證明。
 */

import { meshContainmentUtils } from "./mesh-containment-utils.js";

class MeshPlacementValidator {
    validateMesh(mesh) {
        meshContainmentUtils.validateMesh(mesh);
    }

    rotateVertex(vertex, rotation = {}) {
        const x = vertex[0];
        const y = vertex[1];
        const z = vertex[2];

        const rx = rotation.x ?? 0;
        const ry = rotation.y ?? 0;
        const rz = rotation.z ?? 0;

        // X 軸旋轉
        const x1 = x;
        const y1 = y * Math.cos(rx) - z * Math.sin(rx);
        const z1 = y * Math.sin(rx) + z * Math.cos(rx);

        // Y 軸旋轉
        const x2 = x1 * Math.cos(ry) + z1 * Math.sin(ry);
        const y2 = y1;
        const z2 = -x1 * Math.sin(ry) + z1 * Math.cos(ry);

        // Z 軸旋轉
        return [
            x2 * Math.cos(rz) - y2 * Math.sin(rz),
            x2 * Math.sin(rz) + y2 * Math.cos(rz),
            z2
        ];
    }

    transformMesh(mesh, placement = {}) {
        this.validateMesh(mesh);

        const position = placement.position ?? [0, 0, 0];
        const rotation = placement.rotation ?? {};
        const scale = placement.scale ?? 1;

        if (
            !Array.isArray(position) ||
            position.length !== 3 ||
            !position.every(Number.isFinite)
        ) {
            throw new Error("放置位置格式錯誤");
        }

        const scaleVector = typeof scale === "number"
            ? [scale, scale, scale]
            : scale;

        if (
            !Array.isArray(scaleVector) ||
            scaleVector.length !== 3 ||
            !scaleVector.every(value =>
                Number.isFinite(value) && value > 0
            )
        ) {
            throw new Error("縮放比例必須是正數");
        }

        const vertices = mesh.vertices.map(vertex => {
            const scaled = [
                vertex[0] * scaleVector[0],
                vertex[1] * scaleVector[1],
                vertex[2] * scaleVector[2]
            ];

            const rotated = this.rotateVertex(
                scaled,
                rotation
            );

            return [
                rotated[0] + position[0],
                rotated[1] + position[1],
                rotated[2] + position[2]
            ];
        });

        return {
            vertices,
            faces: mesh.faces.map(face => [...face])
        };
    }

    getSamplePoints(mesh, includeFaceCenters = true) {
        this.validateMesh(mesh);

        const points = mesh.vertices.map(vertex => [...vertex]);

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

        const transformed = this.transformMesh(
            innerMesh,
            placement
        );

        const samplePoints = this.getSamplePoints(
            transformed,
            options.includeFaceCenters !== false
        );

        const tolerance = options.tolerance ?? 1e-6;

        const results = samplePoints.map(point =>
            meshContainmentUtils.isPointInside(
                point,
                hostMesh,
                { tolerance }
            )
        );

        const insideCount = results.filter(
            result => result.inside
        ).length;

        const surfaceCount = results.filter(
            result => result.onSurface
        ).length;

        const outsideCount = results.filter(
            result => result.outside
        ).length;

        const valid = outsideCount === 0;

        return {
            valid,
            totalSamples: samplePoints.length,
            insideCount,
            surfaceCount,
            outsideCount,
            transformedMesh: transformed,
            results,
            message: valid
                ? "目前抽樣點均位於模型內部或表面"
                : "部分抽樣點位於模型外部"
        };
    }

    findFirstOutsidePoint(hostMesh, innerMesh, placement = {}) {
        const transformed = this.transformMesh(
            innerMesh,
            placement
        );

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

export const meshPlacementValidator =
    new MeshPlacementValidator();

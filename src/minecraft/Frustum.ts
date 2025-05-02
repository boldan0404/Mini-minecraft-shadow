import { Vec3, Vec4, Mat4 } from "../lib/TSM.js";

export enum FrustumPlane {
    LEFT = 0,
    RIGHT = 1,
    BOTTOM = 2,
    TOP = 3,
    NEAR = 4,
    FAR = 5
}

export class Frustum {
    private planes: Vec4[]; // Planes in the form Ax + By + Cz + D = 0

    constructor() {
        // Initialize 6 planes for the frustum
        this.planes = [];
        for (let i = 0; i < 6; i++) {
            this.planes.push(new Vec4([0, 0, 0, 0]));
        }
    }

    public extractFromMatrix(viewProj: Mat4): void {
        // Extract frustum planes from view-projection matrix
        // Based on the method described in "Fast Extraction of Viewing Frustum Planes from the World-View-Projection Matrix"
        const m = viewProj.all();

        // Left plane
        this.planes[FrustumPlane.LEFT].x = m[3] + m[0];
        this.planes[FrustumPlane.LEFT].y = m[7] + m[4];
        this.planes[FrustumPlane.LEFT].z = m[11] + m[8];
        this.planes[FrustumPlane.LEFT].w = m[15] + m[12];

        // Right plane
        this.planes[FrustumPlane.RIGHT].x = m[3] - m[0];
        this.planes[FrustumPlane.RIGHT].y = m[7] - m[4];
        this.planes[FrustumPlane.RIGHT].z = m[11] - m[8];
        this.planes[FrustumPlane.RIGHT].w = m[15] - m[12];

        // Bottom plane
        this.planes[FrustumPlane.BOTTOM].x = m[3] + m[1];
        this.planes[FrustumPlane.BOTTOM].y = m[7] + m[5];
        this.planes[FrustumPlane.BOTTOM].z = m[11] + m[9];
        this.planes[FrustumPlane.BOTTOM].w = m[15] + m[13];

        // Top plane
        this.planes[FrustumPlane.TOP].x = m[3] - m[1];
        this.planes[FrustumPlane.TOP].y = m[7] - m[5];
        this.planes[FrustumPlane.TOP].z = m[11] - m[9];
        this.planes[FrustumPlane.TOP].w = m[15] - m[13];

        // Near plane
        this.planes[FrustumPlane.NEAR].x = m[3] + m[2];
        this.planes[FrustumPlane.NEAR].y = m[7] + m[6];
        this.planes[FrustumPlane.NEAR].z = m[11] + m[10];
        this.planes[FrustumPlane.NEAR].w = m[15] + m[14];

        // Far plane
        this.planes[FrustumPlane.FAR].x = m[3] - m[2];
        this.planes[FrustumPlane.FAR].y = m[7] - m[6];
        this.planes[FrustumPlane.FAR].z = m[11] - m[10];
        this.planes[FrustumPlane.FAR].w = m[15] - m[14];

        // Normalize all planes
        for (let i = 0; i < 6; i++) {
            this.normalizePlane(i);
        }
    }

    private normalizePlane(index: number): void {
        // Normalize plane equations so we can use them for distance calculations
        const plane = this.planes[index];
        const length = Math.sqrt(plane.x * plane.x + plane.y * plane.y + plane.z * plane.z);
        
        // Avoid division by zero
        if (length > 0.00001) {
            plane.x /= length;
            plane.y /= length;
            plane.z /= length;
            plane.w /= length;
        }
    }

    public boxInFrustum(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean {
        // Test if an axis-aligned bounding box is in the frustum
        for (let i = 0; i < 6; i++) {
            const plane = this.planes[i];
            
            // Find the point that is furthest in the direction of the plane normal
            const px = (plane.x > 0) ? maxX : minX;
            const py = (plane.y > 0) ? maxY : minY;
            const pz = (plane.z > 0) ? maxZ : minZ;
            
            // If this point is outside the plane, the box is outside the frustum
            const d = plane.x * px + plane.y * py + plane.z * pz + plane.w;
            if (d < 0) {
                return false;
            }
        }
        
        // Box is inside or intersects all planes
        return true;
    }

    public sphereInFrustum(x: number, y: number, z: number, radius: number): boolean {
        // Test if a sphere is in the frustum
        for (let i = 0; i < 6; i++) {
            const plane = this.planes[i];
            
            // Calculate distance from sphere center to plane
            const distance = plane.x * x + plane.y * y + plane.z * z + plane.w;
            
            // If the distance is negative and greater than the radius, the sphere is outside
            if (distance < -radius) {
                return false;
            }
        }
        
        // Sphere is inside or intersects all planes
        return true;
    }
}
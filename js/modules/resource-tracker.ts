/**
 * resource-tracker.ts
 *
 * Tracks Three.js GPU resources (geometries, materials, textures) so they
 * can be disposed in bulk, preventing GPU memory leaks.
 */

/** Minimal interface for any object that can be disposed. */
interface Disposable {
    dispose?: () => void;
}

/** Minimal interface for a Three.js Object3D (only the properties we access). */
interface Object3DLike extends Disposable {
    geometry?: Disposable;
    material?: MaterialLike;
    children?: Object3DLike[];
}

/** Minimal material shape. */
interface MaterialLike extends Disposable {
    map?: Disposable;
    alphaMap?: Disposable;
    envMap?: Disposable;
    normalMap?: Disposable;
}

export class ResourceTracker {
    private resources: Set<Disposable> = new Set();

    track<T>(resource: T): T {
        if (!resource) return resource;

        if (Array.isArray(resource)) {
            resource.forEach((r: object) => this.track(r));
            return resource;
        }

        const obj = resource as unknown as Object3DLike;

        if (typeof obj.dispose === 'function') {
            this.resources.add(obj);
        }

        // If it's an Object3D, also track its geometry and materials
        if (obj.geometry) {
            this.track(obj.geometry);
        }
        if (obj.material) {
            this.track(obj.material);
            // Track common textures
            const mat = obj.material;
            if (mat.map) this.track(mat.map);
            if (mat.alphaMap) this.track(mat.alphaMap);
            if (mat.envMap) this.track(mat.envMap);
            if (mat.normalMap) this.track(mat.normalMap);
        }
        if (obj.children && Array.isArray(obj.children)) {
            this.track(obj.children);
        }

        return resource;
    }

    untrack(resource: object): void {
        this.resources.delete(resource as Disposable);
    }

    dispose(): void {
        for (const resource of this.resources) {
            if (resource.dispose) {
                resource.dispose();
            }
        }
        this.resources.clear();
    }

    /**
     * Dispose a single object and all of its GPU resources, without keeping
     * a tracker instance around. Use for one-off teardowns; for repeated
     * tracking across a lifecycle, instantiate a ResourceTracker instead.
     */
    static disposeOne(resource: unknown): void {
        if (!resource) return;
        const tracker = new ResourceTracker();
        tracker.track(resource);
        tracker.dispose();
    }
}

/**
 * Convenience export for one-off disposal. Equivalent to
 * `ResourceTracker.disposeOne(object)`.
 */
export function disposeObject3D(object: unknown): void {
    ResourceTracker.disposeOne(object);
}

import type { Material, Scene, Texture } from 'three'

interface Disposable {
    dispose(): void
}

/** Minimal interface for objects that carry GPU resources (meshes, points, etc.) */
interface GPUResourceHolder {
    geometry?: Disposable
    material?: Material | Material[]
    children?: GPUResourceHolder[]
    map?: Texture
    alphaMap?: Texture
    envMap?: Texture
    normalMap?: Texture
}

type Trackable = Disposable | GPUResourceHolder | Trackable[] | null | undefined

export class ResourceTracker {
    private resources = new Set<Disposable>()

    track<T extends Trackable>(resource: T): T {
        if (!resource) return resource

        if (Array.isArray(resource)) {
            for (const r of resource) this.track(r)
            return resource
        }

        if ('dispose' in resource && typeof resource.dispose === 'function') {
            this.resources.add(resource as Disposable)
        }

        // After the dispose-branch check, narrow the union to GPUResourceHolder.
        // The Disposable path doesn't carry geometry/material/children so we
        // skip those fields; casting here keeps tsc happy and documents intent.
        const holder = resource as GPUResourceHolder

        if (holder.geometry) {
            this.track(holder.geometry)
        }

        if (holder.material) {
            const mat: Material | undefined = Array.isArray(holder.material) ? holder.material[0] : holder.material
            if (!mat) return resource
            this.track(mat as unknown as Disposable)

            if (mat && 'map' in mat && mat.map) this.track(mat.map as unknown as Disposable)
            if (mat && 'alphaMap' in mat && (mat as Record<string, unknown>).alphaMap)
                this.track((mat as Record<string, unknown>).alphaMap as Disposable)
            if (mat && 'envMap' in mat && (mat as Record<string, unknown>).envMap)
                this.track((mat as Record<string, unknown>).envMap as Disposable)
            if (mat && 'normalMap' in mat && (mat as Record<string, unknown>).normalMap)
                this.track((mat as Record<string, unknown>).normalMap as Disposable)
        }

        if (holder.children && Array.isArray(holder.children)) {
            this.track(holder.children as unknown as Trackable[])
        }

        return resource
    }

    untrack(resource: Disposable): void {
        this.resources.delete(resource)
    }

    dispose(): void {
        for (const resource of this.resources) {
            if (resource && typeof resource.dispose === 'function') {
                resource.dispose()
            }
        }
        this.resources.clear()
    }

    /** Dispose a single object and all of its GPU resources without keeping a tracker instance. */
    static disposeOne(resource: Trackable): void {
        if (!resource) return
        const tracker = new ResourceTracker()
        tracker.track(resource)
        tracker.dispose()
    }
}

/** Convenience export for one-off disposal. Equivalent to `ResourceTracker.disposeOne(object)`. */
export function disposeObject3D(object: Trackable | Scene): void {
    ResourceTracker.disposeOne(object as Trackable)
}

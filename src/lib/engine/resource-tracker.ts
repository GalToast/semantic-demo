import { debugWarn } from '@lib/utils/debug'

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

/**
 * Narrowing helpers — each owns a single `as unknown as` cast so that
 * call sites in `track()` stay type-clean.
 */
function asDisposable(value: unknown): Disposable {
    return value as unknown as Disposable
}

function asTrackableArray(value: unknown): Trackable[] {
    return value as unknown as Trackable[]
}

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
            // Multi-material meshes carry an array; track every material and its
            // texture maps, not just [0] (which would leak materials[1..n]).
            const materials: Material[] = Array.isArray(holder.material)
                ? (holder.material as Material[]).filter((m): m is Material => Boolean(m))
                : [holder.material].filter((m): m is Material => Boolean(m))
            if (materials.length === 0) return resource
            for (const mat of materials) {
                this.track(asDisposable(mat))

                if ('map' in mat && mat.map) this.track(asDisposable(mat.map))
                if ('alphaMap' in mat && (mat as Record<string, unknown>).alphaMap)
                    this.track((mat as Record<string, unknown>).alphaMap as Disposable)
                if ('envMap' in mat && (mat as Record<string, unknown>).envMap)
                    this.track((mat as Record<string, unknown>).envMap as Disposable)
                if ('normalMap' in mat && (mat as Record<string, unknown>).normalMap)
                    this.track((mat as Record<string, unknown>).normalMap as Disposable)
            }
        }

        if (holder.children && Array.isArray(holder.children)) {
            this.track(asTrackableArray(holder.children))
        }

        return resource
    }

    untrack(resource: Disposable): void {
        this.resources.delete(resource)
    }

    /** Number of currently tracked resources. */
    get size(): number {
        return this.resources.size
    }

    dispose(): void {
        // Iterate over a snapshot so a dispose callback that re-enters or
        // throws cannot corrupt the set or cause a double-dispose.
        const toDispose = Array.from(this.resources)
        this.resources.clear()
        for (const resource of toDispose) {
            if (resource && typeof resource.dispose === 'function') {
                try {
                    resource.dispose()
                } catch (err) {
                    debugWarn('[ResourceTracker] dispose callback threw:', err)
                }
            }
        }
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

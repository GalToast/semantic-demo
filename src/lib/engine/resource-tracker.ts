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
 * Narrowing helpers — each is a runtime-guarded type predicate. `track()`
 * narrows against these instead of casting, so the Disposable /
 * GPUResourceHolder classification is checked at runtime, not asserted.
 */
function isDisposable(value: unknown): value is Disposable {
    if (typeof value !== 'object' || value === null) return false
    if (!('dispose' in value)) return false
    return typeof value.dispose === 'function'
}

function isGpuResourceHolder(value: unknown): value is GPUResourceHolder {
    if (typeof value !== 'object' || value === null) return false
    return (
        ('geometry' in value && Boolean(value.geometry)) ||
        ('material' in value && Boolean(value.material)) ||
        ('children' in value && Boolean(value.children))
    )
}

function isTrackable(value: unknown): value is Trackable {
    return value === null || value === undefined || typeof value === 'object'
}

function isTrackableArray(value: unknown): value is Trackable[] {
    return Array.isArray(value) && value.every((item) => isTrackable(item))
}

export class ResourceTracker {
    private resources = new Set<Disposable>()

    track<T extends Trackable>(resource: T): T {
        if (!resource) return resource

        // Narrow against the declared union so the guards below (not casts)
        // drive the Disposable / holder classification.
        const r: Trackable = resource

        if (Array.isArray(r)) {
            for (const item of r) this.track(item)
            return resource
        }

        if (isDisposable(r) && !isGpuResourceHolder(r)) {
            // Only add to resources if it's a standalone Disposable (not a
            // GPUResourceHolder). Holders carry geometry/material/children which
            // we track recursively; adding the holder itself would cause
            // double-dispose when dispose() is called on both the holder and
            // its components. Three.js dispose() is idempotent but custom
            // disposables may not be.
            this.resources.add(r)
        }

        if (isGpuResourceHolder(r)) {
            if (r.geometry) {
                this.track(r.geometry)
            }

            if (r.material) {
                // Multi-material meshes carry an array; track every material and its
                // texture maps, not just [0] (which would leak materials[1..n]).
                const materials: Material[] = Array.isArray(r.material)
                    ? r.material.filter((m): m is Material => Boolean(m))
                    : [r.material].filter((m): m is Material => Boolean(m))
                if (materials.length === 0) return resource
                for (const mat of materials) {
                    // `Material` (base type) has dispose(), so it is a Disposable.
                    this.track(mat)

                    // The texture-map slots are only declared on concrete material
                    // subclasses, so narrow them via `in` and verify disposability.
                    if ('map' in mat && isDisposable(mat.map)) this.track(mat.map)
                    if ('alphaMap' in mat && isDisposable(mat.alphaMap)) this.track(mat.alphaMap)
                    if ('envMap' in mat && isDisposable(mat.envMap)) this.track(mat.envMap)
                    if ('normalMap' in mat && isDisposable(mat.normalMap)) this.track(mat.normalMap)
                }
            }

            if (isTrackableArray(r.children)) {
                this.track(r.children)
            }
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
    ResourceTracker.disposeOne(object)
}

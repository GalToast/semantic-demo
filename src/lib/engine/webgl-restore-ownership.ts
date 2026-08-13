/**
 * @lib/engine/webgl-restore-ownership.ts — Per-canvas ownership token for webglcontextrestored handling
 *
 * Prevents duplicate restore handling between the engine DisposableRegistry (primary)
 * and the app-init fallback (secondary). Only one layer owns the restored event per canvas at a time.
 *
 * Ownership lifecycle:
 *   1. Engine registry claims ownership for a specific canvas when it registers C5/C6
 *   2. App-init fallback checks ownership for that canvas before installing its listeners; if claimed, it yields
 *   3. Registry disposal releases ownership for that canvas so a later fallback or fresh registry can take over
 */

// WeakMap: canvas -> current restore owner.
// The fallback uses a small token object; the engine uses its registry.
type RestoreOwner = object

export type RestoreOwnershipKind = 'engine' | 'fallback'

interface RestoreOwnershipRecord {
    owner: RestoreOwner
    kind: RestoreOwnershipKind
    cleanup?: () => void
}

// Using WeakMap so ownership doesn't prevent canvas GC.
// Module-level mutable reference so tests can reset by creating a new WeakMap.
let _ownership: WeakMap<EventTarget, RestoreOwnershipRecord> = new WeakMap()

/**
 * Claim ownership of webglcontextrestored handling for the given canvas.
 * Returns true if claim succeeded (no current owner for this canvas).
 */
export function claimRestoreOwnership(
    canvas: EventTarget,
    owner: RestoreOwner,
    options: { kind?: RestoreOwnershipKind; cleanup?: () => void } = {}
): boolean {
    const currentOwner = _ownership.get(canvas)
    if (currentOwner !== undefined && currentOwner.owner !== owner) {
        return false
    }
    _ownership.set(canvas, {
        owner,
        kind: options.kind ?? 'engine',
        cleanup: options.cleanup
    })
    return true
}

/**
 * Claim ownership for an engine registry, replacing only an app-init fallback.
 * A live engine owner is never silently displaced because that would leave its
 * listener set active and create two restore paths.
 */
export function takeRestoreOwnership(canvas: EventTarget, owner: RestoreOwner): boolean {
    const current = _ownership.get(canvas)
    if (current && current.owner !== owner) {
        if (current.kind !== 'fallback') return false
        current.cleanup?.()
    }
    _ownership.set(canvas, { owner, kind: 'engine' })
    return true
}

/**
 * Release ownership for the given canvas if held by the given registry.
 */
export function releaseRestoreOwnership(canvas: EventTarget, owner: RestoreOwner): void {
    const currentOwner = _ownership.get(canvas)
    if (currentOwner?.owner === owner) {
        _ownership.delete(canvas)
    }
}

/**
 * Check whether ownership is currently claimed for the given canvas.
 */
export function isRestoreOwned(canvas: EventTarget): boolean {
    return _ownership.has(canvas)
}

/**
 * Get the current owner registry for the given canvas (for test assertions).
 */
export function getRestoreOwner(canvas: EventTarget): RestoreOwner | null {
    return _ownership.get(canvas)?.owner ?? null
}

/** Reset all ownership state (test-only). */
export function _resetRestoreOwnershipForTest(): void {
    _ownership = new WeakMap()
}

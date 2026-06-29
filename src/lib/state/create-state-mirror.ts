/**
 * @lib/state/create-state-mirror.ts — typed accessor factory for appState slices
 *
 * WHY THIS EXISTS
 * ───────────────
 * Before this factory, every `src/lib/stores/*.svelte.ts` file had to ship the
 * same ~150 LOC of pattern:
 *
 *   1. declare a `_xxxWritable = writable(...)`
 *   2. write a `withXxxNotify(updater)` helper that:
 *      a. reads the current value
 *      b. runs the updater
 *      c. publishes to the writable (notifies subscribers)
 *      d. mirrors the new value to `appState.X` for legacy/kernel readers
 *   3. write a `_createXStore()` callable-builder with `.subscribe`/`.update`/`.set`
 *   4. write ~15-30 derived getters like `isOverview = () => appState.X`
 *
 * The shape was duplicated across 8 stores; the only thing that varied was
 * the field-to-key mapping in step 2d. For example:
 *   - viewport.svelte.ts: writes 5 fields to `appState.viewportX`
 *   - journey.svelte.ts:   writes 6 fields via `writeNavStateMirror`
 *   - focus.svelte.ts:     writes 10 fields via `withFocusNotify`
 *
 * This factory collapses the duplicated parts while preserving the per-field
 * mirror mapping (which is the only store-specific bit). Migrated stores end
 * up with:
 *   - one `createStateMirror<T>({bindings, computeFromAppState})` call
 *   - identical public API (`store()` callable + `.subscribe`/`.update`/`.set`)
 *   - a single `resetForTests()` to clear the window-keyed singleton
 *
 * WHAT IT DOES
 * ────────────
 *   - Creates a `Writable<T>` for Svelte subscriber notifications
 *   - Persists the writable at `window[key]` so cross-chunk imports share state
 *     (replaces per-store `getOrCreateXWritable()` patterns)
 *   - On `update(fn)`, computes the next value via `read()`, applies `fn`, then
 *     publishes to the writable and mirrors the bindable fields back to
 *     `appState[key]`
 *   - Exposes a callable `factory()` that reads from appState directly (not
 *     the writable) so the returned snapshot matches `appState` byte-for-byte
 *   - Provides `resetForTests()` to drop the window-keyed singleton and
 *     force `read()` to recompute the initial value
 *
 * WHAT IT DOES NOT DO (yet)
 * ────────────────────────
 *   - Does NOT consolidate `withStateMutation()` machinery — that's a separate
 *     gate that wraps mutations of CRITICAL_KEYS
 *   - Does NOT generate derived getters like `isOverview = () => ...` — the
 *     store still owns its derived surface; the factory just gives them a
 *     solid backing store to read from
 */

import { writable, type Readable } from 'svelte/store'
import { appState } from '@lib/state/app.svelte'

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Per-field binding: which appState key receives the mirror value.
 *
 * `bindings[stateKey] = appStateKey` means:
 *   when `state[stateKey]` changes via `update`/`set`, the new value
 *   is also written to `appState[appStateKey]`.
 *
 * Use `null` for state fields that should NOT mirror to appState.
 *
 * Omit a key entirely if it shouldn't be tracked at all.
 *
 * @example
 *   const bindings = {
 *     width: 'viewportWidth',           // writes appState.viewportWidth
 *     height: 'viewportHeight',
 *     dpr: 'viewportDpr',
 *     // isCompact intentionally NOT bound — derived locally
 *   }
 */
export type FieldBindings<T> = {
    [K in keyof T]?: keyof typeof appState | null
} & Record<string, keyof typeof appState | null | undefined>

/**
 * The store-shaped API exposed by the factory. Compatible with the
 * `(callable) + Readable + .update/.set` shape that Svelte stores use
 * (`toStore` adapters, `.subscribe`, etc.).
 */
export interface StateMirrorApi<T> extends Readable<T> {
    (): T
    update(_fn: (_current: T) => T): void
    set(_value: T): void
}

/**
 * The full factory return: the public store API plus internal recovery hooks
 * for testing.
 */
export interface StateMirror<T> extends StateMirrorApi<T> {
    /** Read the current mirror state. Always reads from appState (not writable). */
    read(): T
    /**
     * Drop the window-keyed singleton so the next `read()` recomputes the
     * initial value. Use in test beforeEach to ensure isolation.
     */
    resetForTests(): void
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a typed store mirror over a subset of `appState`.
 *
 * @param config.computeFromAppState  Read initial state from appState.
 *                                     Called at writable creation time AND on
 *                                     every `read()` call.
 * @param config.bindings              Per-field mirror target (see FieldBindings).
 * @param config.storageKey            Optional explicit key for the window-keyed
 *                                     singleton. Generate one per factory
 *                                     instance so different stores don't
 *                                     share state by accident.
 */
export function createStateMirror<T>(config: {
    computeFromAppState: () => T
    bindings: FieldBindings<T>
    storageKey?: string
}): StateMirror<T> {
    const storageKey =
        config.storageKey ?? `__SEMANTIC_EXPLORER_STATE_MIRROR_${Math.random().toString(36).slice(2, 10)}__`

    function getOrCreateWritable() {
        if (typeof window !== 'undefined') {
            const w = window as unknown as Record<string, unknown>
            const existing = w[storageKey]
            if (existing && typeof (existing as { subscribe?: unknown }).subscribe === 'function') {
                return existing as ReturnType<typeof writable<T>>
            }
        }
        const initial = config.computeFromAppState()
        const w = writable<T>(initial)
        if (typeof window !== 'undefined') {
            ;(window as unknown as Record<string, unknown>)[storageKey] = w
        }
        return w
    }

    const _writable = getOrCreateWritable()

    /** Apply the per-field bindings to mirror the published value into appState. */
    function mirrorToAppState(state: T): void {
        // For primitive T (number/boolean/string), `state[key]` is undefined
        // for any key — the state itself IS the bound value. For object T,
        // we use the key lookup per the bindings map.
        const isPrimitive =
            state === null ||
            state === undefined ||
            typeof state !== 'object'
        for (const stateKey of Object.keys(config.bindings) as (keyof T)[]) {
            const appStateKey = config.bindings[stateKey]
            if (appStateKey == null) continue
            const value = isPrimitive
                ? (state as unknown)
                : (state as Record<string, unknown>)[stateKey as string]
            ;(appState as unknown as Record<string, unknown>)[appStateKey as string] = value
        }
    }

    function update(fn: (current: T) => T): void {
        const current = config.computeFromAppState()
        const next = fn(current)
        _writable.set(next)
        mirrorToAppState(next)
    }

    function set(value: T): void {
        _writable.set(value)
        mirrorToAppState(value)
    }

    function resetForTests(): void {
        if (typeof window !== 'undefined') {
            delete (window as unknown as Record<string, unknown>)[storageKey]
        }
    }

    // ── Build the callable store-shaped API ────────────────────────────────

    const fn = (() => config.computeFromAppState()) as unknown as StateMirror<T>
    fn.read = () => config.computeFromAppState()
    fn.update = update
    fn.set = set
    fn.resetForTests = resetForTests
    // Svelte store contract: expose .subscribe so $store-style reads work
    Object.defineProperty(fn, 'subscribe', { value: _writable.subscribe })

    return fn
}

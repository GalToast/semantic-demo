/**
 * @lib/focus/focus-coordinator.ts — single owner of entry-point DOM focus.
 *
 * Background
 * ----------
 * This module exists to end the focus fragmentation documented in
 * `plans/state-focus-consolidation-plan.md` §2B. Before it, the fragile
 * "guess when the DOM is ready" pattern
 *
 *     requestAnimationFrame(() => input.focus())
 *
 * was duplicated across `Header.svelte` (W50 mobile-focus) and
 * `SearchInput.svelte` (5 call sites). That duplication is what made the
 * first W50 attempt regress: each call site re-derived its own
 * "is something already focused?" guard and its own retry strategy.
 *
 * What this module owns
 * ---------------------
 * ONLY the browser `document.activeElement` (DOM focus). It is the single
 * entry point for moving keyboard focus to a primary target after a
 * lifecycle transition (scene-ready / surface-change / dialog-close).
 *
 * Hard subsystem boundaries (do NOT blur these)
 * ----------------------------------------------
 * The word "focus" means four different things in this codebase. This file
 * owns exactly one of them:
 *   - DOM focus        ← THIS module (document.activeElement).
 *   - camera-focus     → src/lib/engine/camera-choreography/focus.ts (engine).
 *   - journey-focus    → src/lib/journey/* + src/lib/stores/focus.svelte.ts
 *                        (navState surface/phase, NOT the DOM).
 *   - focus-pocket UI  → src/lib/journey/focus-pocket.ts + friends (cards).
 * No call here may write navState or drive the camera. If two subsystems
 * ever need to coordinate focus, they go through `requestEntryFocus` and
 * the shared `isMeaningfulActiveElement()` guard — never by both calling
 * `.focus()` directly and racing on `document.activeElement`.
 */

import { setupFocusTrap, releaseFocusTrap, FOCUSABLE_SELECTORS } from '@lib/utils/focus-trap'

/** Lifecycle transitions that legitimately move entry-point focus. */
export type FocusLifecycleSignal = 'scene-ready' | 'surface-change' | 'dialog-close'

/** Options for a focus request. */
export interface RequestEntryFocusOptions {
    /** Which lifecycle transition triggered this request (telemetry/boundary marker). */
    signal?: FocusLifecycleSignal
    /**
     * When true (default), skip if a meaningful element (input/textarea/
     * contenteditable) already owns focus — don't steal focus from a user
     * who is actively typing. Pass `false` when the target IS the thing the
     * user just asked for (e.g. the first search result after Enter).
     */
    guardMeaningful?: boolean
    /** Max number of rAF retries while the target is not yet in the DOM. */
    retries?: number
}

const MAX_RETRIES = 3

/** Lifecycle signals observed so far this session (single source of truth). */
const lifecycleSignalsFired = new Set<FocusLifecycleSignal>()

/**
 * Record that a lifecycle transition occurred. Components/store effects call
 * this at the moment the transition is known so the coordinator's lifecycle
 * state stays coherent; `requestEntryFocus` does not depend on it (focus is
 * attempted regardless), but it is the documented hook for future signal-gated
 * logic and for diagnostics.
 */
export function emitFocusLifecycleSignal(signal: FocusLifecycleSignal): void {
    lifecycleSignalsFired.add(signal)
}

/** Has a given lifecycle signal fired this session? */
export function hasFocusLifecycleSignalFired(signal: FocusLifecycleSignal): boolean {
    return lifecycleSignalsFired.has(signal)
}

/** True when a typing surface or interactive control already owns focus. */
export function isMeaningfulActiveElement(): boolean {
    if (typeof document === 'undefined') return false
    const ae = document.activeElement as HTMLElement | null
    if (!ae) return false
    if (
        ae.tagName === 'INPUT' ||
        ae.tagName === 'TEXTAREA' ||
        ae.tagName === 'BUTTON' ||
        ae.tagName === 'SELECT' ||
        ae.isContentEditable
    ) {
        return true
    }
    // Protect any interactive element with an explicit role or roving tab stop.
    const role = ae.getAttribute('role')
    if (role === 'button' || role === 'toolbar' || ae.getAttribute('tabindex') === '0') {
        return true
    }
    return false
}

/**
 * Move DOM focus to a primary entry-point target.
 *
 * @param target Either a CSS selector (resolved at focus time, so it works
 *   even if the target is not yet mounted) or a thunk returning the element.
 * @param opts   See {@link RequestEntryFocusOptions}.
 *
 * The rAF + retry loop replaces the duplicated idiom in Header.svelte /
 * SearchInput.svelte: it defers one frame so the element is mounted/visible
 * after a surface swap or splash removal, and retries a few frames if the
 * element is still absent (surface still swapping).
 */
export function requestEntryFocus(
    target: string | (() => HTMLElement | null | undefined),
    opts: RequestEntryFocusOptions = {}
): void {
    if (typeof document === 'undefined' || typeof requestAnimationFrame === 'undefined') return
    const { guardMeaningful = true, retries = MAX_RETRIES } = opts
    scheduleFocus(target, guardMeaningful, retries, 0)
}

function resolveTarget(target: string | (() => HTMLElement | null | undefined)): HTMLElement | null {
    if (typeof target === 'function') return (target() as HTMLElement | null) ?? null
    return document.querySelector<HTMLElement>(target)
}

function scheduleFocus(
    target: string | (() => HTMLElement | null | undefined),
    guardMeaningful: boolean,
    retries: number,
    attempt: number
): void {
    requestAnimationFrame(() => {
        if (guardMeaningful && isMeaningfulActiveElement()) return
        const el = resolveTarget(target)
        if (el) {
            el.focus()
            return
        }
        // Element not in the DOM yet — surface still swapping. Retry a few frames.
        if (attempt < retries) {
            scheduleFocus(target, guardMeaningful, retries, attempt + 1)
        }
    })
}

/** Read the current DOM focus owner (test/diagnostic helper). */
export function getDomFocusOwner(): { id: string; tag: string } | null {
    if (typeof document === 'undefined') return null
    const ae = document.activeElement as HTMLElement | null
    if (!ae) return null
    return { id: ae.id || '', tag: ae.tagName.toLowerCase() }
}

/* ── Focus-trap routing (a11y) ───────────────────────────────────────────────
 * Keep `focus-trap.ts` as the implementation, but route activation through this
 * coordinator so there is ONE surface for both entry-point focus and trap
 * management. `focus-trap-bindings.ts` calls these instead of the util directly.
 */
export function trapFocusIn(selectors: string | string[]): void {
    setupFocusTrap(selectors)
}

export function releaseFocusTrapNow(): void {
    releaseFocusTrap()
}

export { FOCUSABLE_SELECTORS }

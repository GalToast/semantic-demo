/**
 * @lib/utils/focus-trap-bindings.ts — MutationObserver-based focus trap
 *
 * Watches data-panel-surface attribute on document.body and activates
 * or releases the focus trap based on the current UI surface.
 *
 * Port of
 */

import { trapFocusIn, releaseFocusTrapNow } from '@lib/focus/focus-coordinator'

let _focusTrapObserver: MutationObserver | null = null

/* ── Nested-dialog registry (F2 a11y bugsweep 2026-08-07) ───────────────────
 * Keeps a Set of open non-<dialog> dialogs (role="dialog" divs) so the
 * global Escape handler can gate on them before returning to overview.
 * Native <dialog open> elements are already handled by the global handler's
 * document.querySelector('dialog[open]') check, but role="dialog" divs
 * (trail-review-overlay, etc.) need explicit registration because
 * stopPropagation is fragile across component boundaries.
 */
const _openNestedDialogs = new Set<string>()

/** Register a non-native dialog as open. Global Esc will let it close first. */
export function registerOpenDialog(id: string): void {
  _openNestedDialogs.add(id)
}

/** Unregister a previously-opened non-native dialog. */
export function unregisterOpenDialog(id: string): void {
  _openNestedDialogs.delete(id)
}

/** True when at least one non-native dialog is registered as open. */
export function hasOpenNestedDialog(): boolean {
  return _openNestedDialogs.size > 0
}

/* ── Active-surface trap selectors (mobile focus-containment, 2026-08-12) ───
 * The active mobile search/focus trap previously omitted the header's real
 * visible focusable utility controls (.legend-toggle / #btn-legend,
 * #btn-keyboard-help, #btn-app-help) and the .mode-chip radiogroup. Because
 * handleKeydown only clamps at the wrap boundary, a Tab press *between* trap
 * elements could land on those persistent-chrome controls — focus "escaped"
 * the active sheet (audit finding #1). The rendered header owns those controls
 * via `#app-header`; the focus-stage boundary contains the selected card,
 * journey actions, and neighbor rail rendered alongside the search surface.
 * The focus-pocket accessibility list is another active keyboard surface and
 * is included explicitly because it lives outside `#focus-stage`.
 *
 * The share control lives under `.controls` (already in the set) — there is no
 * `.share-toggle` class in this codebase, so no such selector is added. We do
 * NOT add role=dialog / aria-modal: the search sheet is non-modal, so the
 * contained toggles stay operable, merely part of the trap's Tab cycle (audit
 * finding: no false modal semantics).
 *
 * @keep-in-sync ACTIVE_TRAP_SELECTORS below must mirror the inline literal
 * passed to trapFocusIn() — thread-inspector-focus-trap.test.ts greps for a
 * literal `trapFocusIn([ ... '.thread-inspector' ... ])` in this file.
 */
const ACTIVE_TRAP_SELECTORS = [
    '.search-container',
    '#info-panel',
    '.journey-compass',
    '.controls',
    '.search-drawer-chrome',
    '.thread-inspector',
    '#app-header',
    '#focus-stage',
    '#focus-pocket-a11y',
    '#focus-pocket-list-toggle',
    '#experience-reset-toast'
]

const ACTIVE_SURFACE_SIGNATURE = [...ACTIVE_TRAP_SELECTORS].sort().join('|')

/** Tracks the last-applied trap signature so repeated surface mutations (and
 *  transitions between the four active variants, which all share one selector
 *  set) push at most ONE active trap layer (audit finding #3). */
let _lastAppliedSignature: string | null = null

function applySurfaceTrap(surface: string): void {
    if (surface === 'search' || surface === 'focus-search' || surface === 'focus' || surface === 'semantic-dive') {
        // Idempotent: identical re-assertion (or active→active variant switch)
        // does not push a duplicate layer on top of the existing one.
        if (ACTIVE_SURFACE_SIGNATURE === _lastAppliedSignature) return
        trapFocusIn([
            '.search-container',
            '#info-panel',
            '.journey-compass',
            '.controls',
            '.search-drawer-chrome',
            // PR-T3: include the thread-inspector in the focus-trap selector
            // set when a focus surface is active. Without this, Tab from a
            // thread-inspector button would jump to .search-container
            // (the search input) because the thread-inspector buttons
            // weren't in any of the trap selectors. The inspector owns
            // the focus while it's visible + active in focus/focus-search
            // states (body surface is unchanged by the inspector).
            '.thread-inspector',
            // 2026-08-12: contain the header's visible utility controls
            // (.legend-toggle / #btn-keyboard-help / #btn-app-help / mode
            // chips) so Tab cannot escape the active sheet. The focus-stage
            // root contains its card, journey actions, and neighbor rail;
            // focus-pocket-a11y is rendered beside that root.
            '#app-header',
            '#focus-stage',
            '#focus-pocket-a11y',
            '#focus-pocket-list-toggle',
            '#experience-reset-toast'
        ])
        _lastAppliedSignature = ACTIVE_SURFACE_SIGNATURE
    } else {
        // Non-active surface: release only if we actually applied a layer.
        if (_lastAppliedSignature === null) return
        releaseFocusTrapNow()
        _lastAppliedSignature = null
    }
}

function onSurfaceMutation(): void {
    const surface = (document.body as HTMLElement).dataset.panelSurface || 'idle'
    applySurfaceTrap(surface)
}

export function bindFocusTrapObserver(): void {
    if (_focusTrapObserver) return

    _focusTrapObserver = new MutationObserver(onSurfaceMutation)

    _focusTrapObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['data-panel-surface']
    })

    // URL restoration and initial store hydration can set the surface before
    // this observer is installed. MutationObserver does not replay the current
    // attribute, so evaluate the already-rendered surface once at bind time.
    onSurfaceMutation()
}

export function disposeFocusTrapBindings(): void {
    if (_focusTrapObserver) {
        _focusTrapObserver.disconnect()
        _focusTrapObserver = null
    }
    _lastAppliedSignature = null
}

/**
 * Test seam: deterministically (re)apply the surface trap without relying on
 * MutationObserver timing. Sets `body[data-panel-surface]` and runs the same
 * activation logic the observer uses, so focused tests can prove idempotent
 * activation (repeated calls push at most one layer).
 */
export function evaluateSurfaceTrap(surface: string): void {
    ;(document.body as HTMLElement).dataset.panelSurface = surface
    applySurfaceTrap(surface)
}

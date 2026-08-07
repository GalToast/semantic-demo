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

export function bindFocusTrapObserver(): void {
    if (_focusTrapObserver) return

    _focusTrapObserver = new MutationObserver(() => {
        const surface = (document.body as HTMLElement).dataset.panelSurface || 'idle'
        if (surface === 'search' || surface === 'focus-search' || surface === 'focus' || surface === 'semantic-dive') {
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
                '.thread-inspector'
            ])
        } else {
            releaseFocusTrapNow()
        }
    })

    _focusTrapObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['data-panel-surface']
    })
}

export function disposeFocusTrapBindings(): void {
    if (_focusTrapObserver) {
        _focusTrapObserver.disconnect()
        _focusTrapObserver = null
    }
}

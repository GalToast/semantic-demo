/**
 * @lib/utils/focus-trap-bindings.ts — MutationObserver-based focus trap
 *
 * Watches data-panel-surface attribute on document.body and activates
 * or releases the focus trap based on the current UI surface.
 *
 * Port of
 */

import { setupFocusTrap, releaseFocusTrap } from './focus-trap'

let _focusTrapObserver: MutationObserver | null = null

export function bindFocusTrapObserver(): void {
    if (_focusTrapObserver) return

    _focusTrapObserver = new MutationObserver(() => {
        const surface = (document.body as HTMLElement).dataset.panelSurface || 'idle'
        if (surface === 'search' || surface === 'focus-search' || surface === 'focus' || surface === 'semantic-dive') {
            setupFocusTrap([
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
            releaseFocusTrap()
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

/**
 * focus-trap-bindings.ts
 * Typechecked sibling for focus-trap-bindings.js
 * MutationObserver-based focus trap for accessible surfaces.
 */

let _focusTrapObserver: MutationObserver | null = null;

export function bindFocusTrapObserver(): void {
    if (_focusTrapObserver) return;

    _focusTrapObserver = new MutationObserver(() => {
        const surface = (document.body as HTMLElement).dataset.panelSurface || 'idle';
        if (surface === 'search' || surface === 'focus-search' || surface === 'focus' || surface === 'semantic-dive') {
            import('../utils/focus-trap.ts').then(({ setupFocusTrap }) => {
                setupFocusTrap([
                    '.search-container',
                    '#info-panel',
                    '.journey-compass',
                    '.controls',
                    '.search-drawer-chrome'
                ]);
            });
        } else {
            import('../utils/focus-trap.ts').then(({ releaseFocusTrap }) => {
                releaseFocusTrap();
            });
        }
    });

    _focusTrapObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['data-panel-surface']
    });
}

export function disposeFocusTrapBindings(): void {
    if (_focusTrapObserver) {
        _focusTrapObserver.disconnect();
        _focusTrapObserver = null;
    }
}

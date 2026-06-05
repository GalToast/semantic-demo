/**
 * focus-trap-bindings.ts
 * Typechecked sibling for focus-trap-bindings.js
 * MutationObserver-based focus trap for accessible surfaces.
 */

export function bindFocusTrapObserver(): void {
    const observer = new MutationObserver(() => {
        const surface = (document.body as HTMLElement).dataset.panelSurface || 'idle';
        if (surface === 'search' || surface === 'focus-search' || surface === 'focus' || surface === 'semantic-dive') {
            import('../utils/focus-trap.js').then(({ setupFocusTrap }) => {
                setupFocusTrap([
                    '.search-container',
                    '#info-panel',
                    '.journey-compass',
                    '.controls',
                    '.search-drawer-chrome'
                ]);
            });
        } else {
            import('../utils/focus-trap.js').then(({ releaseFocusTrap }) => {
                releaseFocusTrap();
            });
        }
    });

    observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['data-panel-surface']
    });
}

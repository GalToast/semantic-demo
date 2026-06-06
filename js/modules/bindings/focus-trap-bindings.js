let _focusTrapObserver = null;

export function bindFocusTrapObserver() {
    if (_focusTrapObserver) return;
    const observer = new MutationObserver(() => {
        const surface = document.body.dataset.panelSurface || 'idle';
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
    _focusTrapObserver = observer;
}

export function disposeFocusTrapBindings() {
    if (_focusTrapObserver) {
        _focusTrapObserver.disconnect();
        _focusTrapObserver = null;
    }
}

let _updateInspectedStrandOverlay = null;

export function setInspectedStrandOverlayUpdater(fn) {
    _updateInspectedStrandOverlay = typeof fn === 'function' ? fn : null;
}

export function updateInspectedStrandOverlayFrame(now) {
    if (_updateInspectedStrandOverlay) _updateInspectedStrandOverlay(now);
}

let inspectedStrandOverlayUpdater = null;

export function setInspectedStrandOverlayUpdater(updater) {
    inspectedStrandOverlayUpdater = typeof updater === 'function' ? updater : null;
}

export function updateInspectedStrandOverlayFrame(now = performance.now()) {
    if (!inspectedStrandOverlayUpdater) return;
    inspectedStrandOverlayUpdater(now);
}

/**
 * @lib/journey/inspected-strand-overlay-adapter.ts
 *
 * Ported from:
 * Manages the inspected-strand overlay update callback.
 */

type InspectedStrandOverlayUpdater = (now?: number) => void;

let inspectedStrandOverlayUpdater: InspectedStrandOverlayUpdater | null = null;

export function setInspectedStrandOverlayUpdater(updater: unknown): void {
    inspectedStrandOverlayUpdater = typeof updater === 'function'
        ? updater as InspectedStrandOverlayUpdater
        : null;
}

export function updateInspectedStrandOverlayFrame(now: number = performance.now()): void {
    if (!inspectedStrandOverlayUpdater) return;
    inspectedStrandOverlayUpdater(now);
}

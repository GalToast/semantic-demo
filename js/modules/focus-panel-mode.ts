/**
 * focus-panel-mode.ts
 * Typechecked sibling for focus-panel-mode.js
 * Manages focus panel mode state via document.body.dataset.focusPanelMode
 */

export const FOCUS_PANEL_MODE: Readonly<{
    OVERVIEW: 'overview';
    FIELD_NODE: 'field-node';
    MANUAL_PANEL: 'manual-panel';
    MANUAL_COLLAPSED: 'manual-collapsed';
    LEGEND_OPEN: 'legend-open';
}> = Object.freeze({
    OVERVIEW: 'overview',
    FIELD_NODE: 'field-node',
    MANUAL_PANEL: 'manual-panel',
    MANUAL_COLLAPSED: 'manual-collapsed',
    LEGEND_OPEN: 'legend-open'
});

type FocusPanelModeValue = typeof FOCUS_PANEL_MODE[keyof typeof FOCUS_PANEL_MODE];

export function getFocusPanelMode(): string {
    if (typeof document === 'undefined') return FOCUS_PANEL_MODE.OVERVIEW;
    return (document.body as HTMLElement)?.dataset?.focusPanelMode || FOCUS_PANEL_MODE.OVERVIEW;
}

export function setFocusPanelMode(mode: string): void {
    if (typeof document === 'undefined' || !document.body) return;
    (document.body as HTMLElement).dataset.focusPanelMode = mode || FOCUS_PANEL_MODE.OVERVIEW;
}

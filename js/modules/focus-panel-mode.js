export const FOCUS_PANEL_MODE = Object.freeze({
    OVERVIEW: 'overview',
    FIELD_NODE: 'field-node',
    MANUAL_PANEL: 'manual-panel',
    MANUAL_COLLAPSED: 'manual-collapsed',
    LEGEND_OPEN: 'legend-open'
});

export function getFocusPanelMode() {
    if (typeof document === 'undefined') return FOCUS_PANEL_MODE.OVERVIEW;
    return document.body?.dataset?.focusPanelMode || FOCUS_PANEL_MODE.OVERVIEW;
}

export function setFocusPanelMode(mode) {
    if (typeof document === 'undefined' || !document.body) return;
    document.body.dataset.focusPanelMode = mode || FOCUS_PANEL_MODE.OVERVIEW;
}

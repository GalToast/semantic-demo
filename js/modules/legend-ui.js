/**
 * legend-ui.js — narrow adapter for legend panel structural state transitions.
 *
 * Owns only the DOM class/aria changes for legend panel open/close.
 * Does NOT own semantic guide content rendering (lifecycle.js owns that).
 * Does NOT own the legend toggle button click handler (event-bindings owns that).
 *
 * This adapter is neutral — it imports only state (a shared global), not
 * lifecycle.js or event-bindings.js, so both can import it without deepening
 * the existing lifecycle↔event-bindings import cycle.
 *
 * Structural transitions owned here:
 *   - closeLegendPanel()     — remove active class, set aria-hidden, reset toggle aria
 *   - openLegendPanel()     — add active class, clear aria-hidden, set toggle aria
 *   - isLegendPanelOpen()   — read active class state
 *
 * Cross-module bridge owned here (extracted from event-bindings.js):
 *   - restoreLegendCollapsedPanel(infoPanel, panelBtn) — compact focus-stage info panel restore
 *     (previously a local closure in event-bindings, now callable by lifecycle.closeLegendGuide)
 */

// ── Viewport helper ──────────────────────────────────────────────────────────

function isCompactFocusStage() {
    return typeof window !== 'undefined' && window.innerWidth <= 768;
}

// ── Legend panel structural state transitions ─────────────────────────────────

/**
 * Returns true if the legend panel is currently open (has .active class).
 * Does not read document.documentElement.dataset.legendActive — uses classList only.
 */
export function isLegendPanelOpen() {
    if (typeof document === 'undefined') return false;
    const panel = document.getElementById('legend-panel');
    return panel ? panel.classList.contains('active') : false;
}

/**
 * Opens the legend panel (adds .active class, clears aria-hidden, sets toggle aria).
 * Safe to call when already open — early-returns.
 */
export function openLegendPanel() {
    if (typeof document === 'undefined') return;
    const panel = document.getElementById('legend-panel');
    const toggle = document.getElementById('btn-legend');
    if (!panel || !toggle) return;
    if (panel.classList.contains('active')) return; // already open

    panel.classList.add('active');
    panel.setAttribute('aria-hidden', 'false');
    document.documentElement.dataset.legendActive = 'true';
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-pressed', 'true');
    toggle.setAttribute('aria-label', 'Hide field guide');
}

/**
 * Closes the legend panel (removes .active class, sets aria-hidden, resets toggle aria).
 * Safe to call when already closed — early-returns.
 *
 * Does NOT restore compact focus-stage info panel — use restoreLegendCollapsedPanel()
 * in the caller if that restoration is needed (as lifecycle.closeLegendGuide does).
 */
export function closeLegendPanel() {
    if (typeof document === 'undefined') return;
    const panel = document.getElementById('legend-panel');
    const toggle = document.getElementById('btn-legend');
    if (!panel || !toggle) return;
    if (!panel.classList.contains('active')) return; // already closed

    panel.classList.remove('active');
    panel.setAttribute('aria-hidden', 'true');
    document.documentElement.dataset.legendActive = 'false';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-pressed', 'false');
    toggle.setAttribute('aria-label', 'Show field guide');
}

// ── Compact focus-stage restore (cross-module bridge) ─────────────────────────
// Previously a local closure in event-bindings.js bindLegendControls().
// Now extracted here so lifecycle.closeLegendGuide can call it via direct import
// instead of a window-bridge typeof guard.

/**
 * Restores the info panel after the legend is closed in compact focus-stage view.
 * Safe to call when not in compact mode — early-returns.
 *
 * @param {Element|null} infoPanel - .info-panel element (passed by caller)
 * @param {Element|null} panelBtn - #btn-panel element (passed by caller)
 */
export function restoreLegendCollapsedPanel(infoPanel, panelBtn) {
    if (!isCompactFocusStage()) return;
    if (document.body.dataset.focusPanelMode !== 'legend-open') return;
    if (infoPanel) infoPanel.classList.add('active');
    document.body.dataset.focusPanelMode = 'overview';
    if (panelBtn) panelBtn.setAttribute('aria-expanded', 'true');
}

// ── Window exposure (for bootstrap compatibility) ─────────────────────────────
if (typeof window !== 'undefined') {
    window.isLegendPanelOpen = isLegendPanelOpen;
    window.openLegendPanel = openLegendPanel;
    window.closeLegendPanel = closeLegendPanel;
    window.restoreLegendCollapsedPanel = restoreLegendCollapsedPanel;
}

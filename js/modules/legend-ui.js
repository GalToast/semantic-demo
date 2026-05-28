import { state } from '../state.js';
import { escapeHtml } from '../utils.js';
import { getSemanticGuideTitle } from './semantic-guide.js';

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

// ── Legend Guide UI Controls ──────────────────────────────────────────────────

export function updateLegendGuideState() {
    const legendPanel = document.getElementById('legend-panel');
    if (!legendPanel) return;
    const guide = state.currentSemanticGuide;
    if (!guide) {
        if (isLegendPanelOpen()) closeLegendPanel();
        legendPanel.innerHTML = '';
        return;
    }
    // Auto-open the legend panel when guide data is available
    if (!legendPanel.classList.contains('active')) openLegendPanel();
    const kicker = guide.laneStatus || 'Field Guide';
    const title = getSemanticGuideTitle(guide);
    const note = guide.text || '';
    const next = guide.nextLabel || '';
    legendPanel.innerHTML = `
        <div class="legend-guide">
            <div class="legend-guide-head">
                <span class="legend-guide-kicker">${escapeHtml(kicker)}</span>
            </div>
            <div class="legend-guide-title">${escapeHtml(title)}</div>
            ${note ? `<div class="legend-guide-note">${escapeHtml(note)}</div>` : ''}
            ${next ? `<div class="legend-guide-next">${escapeHtml(next)}</div>` : ''}
        </div>
    `;
}

export function closeLegendGuide(options = {}) {
    const legendToggle = document.getElementById('btn-legend');
    if (!isLegendPanelOpen()) return;

    closeLegendPanel();

    if (options.restoreFocusPanel !== false) {
        const infoPanel = document.querySelector('.info-panel');
        const panelBtn = document.getElementById('btn-panel');
        restoreLegendCollapsedPanel(infoPanel, panelBtn);
    }
    if (options.restoreFocus) {
        if (_previouslyFocusedLegend) {
            _previouslyFocusedLegend.focus({ preventScroll: true });
        } else if (legendToggle) {
            legendToggle.focus({ preventScroll: true });
        }
    }
}

// ── Module-scoped focus scrap (replaces window._previouslyFocusedLegend) ────────
let _previouslyFocusedLegend = null;

export function setPreviouslyFocusedLegend(el) { _previouslyFocusedLegend = el; }
export function getPreviouslyFocusedLegend() { return _previouslyFocusedLegend; }

// All legend exports are consumed through direct imports.

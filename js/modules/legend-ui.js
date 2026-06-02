import { state } from '../state.js';
import { subscribe, EVENTS } from './event-bus.js';
import { escapeHtml } from './utils/dom-formatters.js';
import { describeCluster } from './utils/ui-presentation.js';
import { getSemanticGuideTitle } from './semantic-guide.js';
import { getFilteredClusterCounts, setClusterFilter } from './cluster-filter.js';

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
    if (typeof document === 'undefined' || !document.documentElement) return false;
    return document.documentElement.dataset.legendActive === 'true';
}

/**
 * Opens the legend panel (adds .active class, clears aria-hidden, sets toggle aria).
 * Safe to call when already open — early-returns.
 */
export function openLegendPanel() {
    if (typeof document === 'undefined' || !document.documentElement) return;
    const panel = document.getElementById('legend-panel');
    const toggle = document.getElementById('btn-legend');
    if (!panel || !toggle) return;
    if (document.documentElement.dataset.legendActive === 'true') return; // already open

    panel.setAttribute('aria-hidden', 'false');
    panel.classList.add('active');
    document.documentElement.dataset.legendActive = 'true';
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-pressed', 'true');
    toggle.setAttribute('aria-label', 'Hide field guide');
    // Always (re)build so the panel has content even when no semantic guide is active.
    buildLegend();
}

/**
 * Closes the legend panel (removes .active class, sets aria-hidden, resets toggle aria).
 * Safe to call when already closed — early-returns.
 *
 * Does NOT restore compact focus-stage info panel — use restoreLegendCollapsedPanel()
 * in the caller if that restoration is needed (as lifecycle.closeLegendGuide does).
 */
export function closeLegendPanel() {
    if (typeof document === 'undefined' || !document.documentElement) return;
    const panel = document.getElementById('legend-panel');
    const toggle = document.getElementById('btn-legend');
    if (!panel || !toggle) return;
    if (document.documentElement.dataset.legendActive !== 'true') return; // already closed

    panel.setAttribute('aria-hidden', 'true');
    panel.classList.remove('active');
    document.documentElement.dataset.legendActive = 'false';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-pressed', 'false');
    toggle.setAttribute('aria-label', 'Show field guide');
}

// ── Compact focus-stage restore (cross-module bridge) ─────────────────────────

/**
 * Restores the info panel after the legend is closed in compact focus-stage view.
 * Safe to call when not in compact mode — early-returns.
 */
export function restoreLegendCollapsedPanel(infoPanel, panelBtn) {
    if (!isCompactFocusStage()) return;
    if (document.body.dataset.focusPanelMode !== 'legend-open') return;
    if (infoPanel) infoPanel.classList.add('active');
    document.body.dataset.focusPanelMode = 'overview';
    if (panelBtn) panelBtn.setAttribute('aria-expanded', 'true');
}

// ── Legend Core & Guide UI Controls ───────────────────────────────────────────

export function buildLegend() {
    const legendPanel = document.getElementById('legend-panel');
    if (!legendPanel) return;

    const counts = getFilteredClusterCounts();
    const rows = Array.from(counts.entries())
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1] || a[0] - b[0]);

    const guide = state.currentSemanticGuide;
    const guideTitle = guide ? getSemanticGuideTitle(guide) : 'Read the scene';
    const guideNote = guide?.text || 'Neighborhood colors group records by shared language, trade, civic role, and business texture.';
    const activeCluster = state.activeClusterFilter;

    legendPanel.innerHTML = `
        <div class="legend-guide">
            <div class="legend-guide-head">
                <span class="legend-guide-kicker">${escapeHtml(guide?.laneStatus || 'Field Guide')}</span>
                <span class="legend-state-badge">${activeCluster === null ? 'County overview' : 'Filtered neighborhood'}</span>
            </div>
            <div class="legend-guide-title">${escapeHtml(guideTitle)}</div>
            <div class="legend-guide-note">${escapeHtml(guideNote)}</div>
            ${guide?.nextLabel ? `<div class="legend-guide-next">${escapeHtml(guide.nextLabel)}</div>` : ''}
        </div>
        <div class="legend-lens-truth">
            <span class="legend-lens-truth-mark" aria-hidden="true"></span>
            <span>Glowing lines show semantic relationships; the constellation shape is staged for readability.</span>
        </div>
        <div class="legend-divider"></div>
        <div class="legend-section-title">Neighborhood palette</div>
        <div class="legend-subtitle">Semantic neighborhoods group businesses by shared language, trade, civic role &amp; business texture</div>
        <div class="legend-list" id="legend-list">
            ${rows.map(([cluster, count]) => {
                const active = activeCluster !== null && activeCluster === cluster;
                const color = state.COLORS[cluster % state.COLORS.length] || '#4ecdc4';
                return `
                    <button class="legend-item${active ? ' active' : ''}" type="button" data-legend-cluster="${cluster}" aria-pressed="${String(active)}">
                        <span class="legend-dot" style="background:${escapeHtml(color)}"></span>
                        <span class="legend-copy">
                            <span class="legend-label">${escapeHtml(describeCluster(cluster))}</span>
                            <span class="legend-meta">${active ? '<span class="legend-pill filter">filter</span>' : ''}</span>
                        </span>
                        <span class="legend-count">${count.toLocaleString()}</span>
                    </button>
                `;
            }).join('') || '<div class="legend-guide-note">No neighborhoods match the current filters.</div>'}
        </div>
    `;

    legendPanel.querySelectorAll('[data-legend-cluster]').forEach((item) => {
        item.addEventListener('click', () => setClusterFilter(Number(item.dataset.legendCluster)));
    });
}

export function updateLegendGuideState() {
    const guide = state.currentSemanticGuide;
    if (!guide) {
        if (isLegendPanelOpen()) closeLegendPanel();
        const legendPanel = document.getElementById('legend-panel');
        if (legendPanel) legendPanel.innerHTML = '';
        return;
    }
    // Auto-open the legend panel when guide data is available
    if (!isLegendPanelOpen()) openLegendPanel();
    buildLegend();
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

// Event Bus Subscriptions
const syncLegend = () => {
    updateLegendGuideState();
};

subscribe(EVENTS.VIEW_CHANGED, () => {
    closeLegendPanel();
    syncLegend();
});
subscribe(EVENTS.FILTER_CHANGED, syncLegend);
subscribe(EVENTS.STATE_RESET, syncLegend);
subscribe(EVENTS.SEARCH_SUCCESS, syncLegend);
subscribe(EVENTS.SEARCH_CLEARED, syncLegend);

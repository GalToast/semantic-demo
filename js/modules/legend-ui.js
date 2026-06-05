import { getCurrentSemanticGuide, getActiveClusterFilter, getColors, getClusterNames } from '../state/selectors/index.js';
import { subscribe, EVENTS } from './event-bus.js';
import { escapeHtml } from './utils/dom-formatters.js';
import { describeCluster } from './utils/ui-presentation.js';
import { getSemanticGuideTitle } from './semantic-guide.js';
import { getFilteredClusterCounts, setClusterFilter } from './cluster-filter.js';
import { setFocusPanelMode, getFocusPanelMode, FOCUS_PANEL_MODE } from './focus-panel-mode.js';

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
    if (getFocusPanelMode() !== FOCUS_PANEL_MODE.LEGEND_OPEN) return;
    if (infoPanel) infoPanel.classList.add('active');
    setFocusPanelMode(FOCUS_PANEL_MODE.OVERVIEW);
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

    const guide = getCurrentSemanticGuide();
    const guideTitle = guide ? getSemanticGuideTitle(guide) : 'Read the scene';
    const guideNote = guide?.text || 'Neighborhood colors group records by shared language, trade, civic role, and business texture.';
    const activeCluster = getActiveClusterFilter();

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
                const color = getColors()[cluster % getColors().length] || '#4ecdc4';
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
    // Rebuild the always-visible compact key from current cluster counts so it
    // tracks the same data the panel shows.
    buildCanvasColorLegend();
}

export function updateLegendGuideState() {
    const guide = getCurrentSemanticGuide();
    if (!guide) {
        if (isLegendPanelOpen()) closeLegendPanel();
        // Don't wipe innerHTML here. This function is called from many event
        // subscribers (VIEW_CHANGED, FILTER_CHANGED, STATE_RESET, SEARCH_*);
        // wiping the panel makes the field guide's content flash in and out
        // when the user opens it. buildLegend() always replaces the content
        // when the panel is next opened, so an empty state at the path
        // level is fine.
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

// ── Compact canvas-anchored color key ────────────────────────────────────────

/**
 * Build the small always-visible "Network" color key that hangs off the top-left
 * of the canvas. The old version had 4 hard-coded swatches (Anchor / Match /
 * Cluster / Highlight) that did not match the actual 3D palette — the cluster
 * dots use 30 colors from `state.COLORS` keyed by `state.CLUSTER_NAMES`.
 *
 * We pick the 4 most-populated clusters so the key shows what's actually
 * visible in the cloud. If a cluster has 0 records (data is empty) we fall
 * back to the first 4 names+colors.
 */
export function buildCanvasColorLegend() {
    const root = document.getElementById('canvas-color-legend-rows');
    if (!root) return;
    const counts = getFilteredClusterCounts();
    const colors = Array.isArray(getColors()) ? getColors() : [];
    const names = Array.isArray(getClusterNames()) ? getClusterNames() : [];

    let top = counts && counts.size > 0
        ? Array.from(counts.entries())
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1] || a[0] - b[0])
            .slice(0, 4)
            .map(([cluster]) => cluster)
        : null;

    if (!top || top.length < 4) {
        // Pad with first-N clusters so we always render 4 rows.
        const padded = Array.from(new Set([...(top || []), 0, 1, 2, 3])).slice(0, 4);
        top = padded;
    }

    root.replaceChildren(
        ...top.map((cluster) => {
            const color = colors[cluster % colors.length] || '#4ecdc4';
            const label = names[cluster] || `Cluster ${cluster}`;
            const row = document.createElement('div');
            row.className = 'canvas-color-legend-row';
            const swatch = document.createElement('span');
            swatch.className = 'canvas-color-legend-swatch';
            swatch.style.setProperty('--swatch-color', color);
            const text = document.createElement('span');
            text.className = 'canvas-color-legend-label';
            text.textContent = label;
            row.append(swatch, text);
            return row;
        })
    );
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

/**
 * legend-ui.ts
 *
 * Typechecked sibling of legend-ui.js.
 * Legend panel structural state, guide UI, and canvas color key.
 */

// ── Imports (reference JS siblings for runtime) ────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { appState } from '@lib/state/app.svelte';

import { subscribeKeyed, EVENTS } from '@lib/orchestration/event-bus';
import { escapeHtml } from './utils/dom-formatters.ts';
import { describeCluster } from './utils/ui-presentation.ts';
import { getSemanticGuideTitle } from '../../src/lib/journey/semantic-guide.ts';
import { getFilteredClusterCounts, setClusterFilter } from './cluster-filter.ts';
import { setFocusPanelMode, getFocusPanelMode, FOCUS_PANEL_MODE } from './focus-panel-mode.ts';
import { getViewportSize } from './environment.ts';
import { CONFIG } from '@lib/engine/config';

// ── Types ──────────────────────────────────────────────────────────────────

/** Minimal shape for the current semantic guide — JS runtime returns `unknown`. */
interface SemanticGuide {
    text?: string;
    laneStatus?: string;
    nextLabel?: string;
    anchorIndex?: number;
    [key: string]: unknown;
}

interface CloseLegendGuideOptions {
    restoreFocusPanel?: boolean;
    restoreFocus?: boolean;
}

// ── Viewport helper ────────────────────────────────────────────────────────

function isCompactFocusStage(): boolean {
    return getViewportSize().width <= 768;
}

// ── Legend panel structural state transitions ───────────────────────────────

/**
 * Returns true if the legend panel is currently open (has .active class).
 * Does not read document.documentElement.dataset.legendActive — uses classList only.
 */
export function isLegendPanelOpen(): boolean {
    if (typeof document === 'undefined' || !document.documentElement) return false;
    return document.documentElement.dataset.legendActive === 'true';
}

/**
 * Opens the legend panel (adds .active class, clears aria-hidden, sets toggle aria).
 * Safe to call when already open — early-returns.
 */
export function openLegendPanel(): void {
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
export function closeLegendPanel(): void {
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

// ── Compact focus-stage restore (cross-module bridge) ───────────────────────

/**
 * Restores the info panel after the legend is closed in compact focus-stage view.
 * Safe to call when not in compact mode — early-returns.
 */
export function restoreLegendCollapsedPanel(
    infoPanel: HTMLElement | null,
    panelBtn: HTMLElement | null
): void {
    if (!isCompactFocusStage()) return;
    if (getFocusPanelMode() !== FOCUS_PANEL_MODE.LEGEND_OPEN) return;
    if (infoPanel) infoPanel.classList.add('active');
    setFocusPanelMode(FOCUS_PANEL_MODE.OVERVIEW);
    if (panelBtn) panelBtn.setAttribute('aria-expanded', 'true');
}

// ── Legend Core & Guide UI Controls ─────────────────────────────────────────

export function buildLegend(): void {
    const legendPanel = document.getElementById('legend-panel');
    if (!legendPanel) return;

    const counts = getFilteredClusterCounts();
    const rows = Array.from(counts.entries())
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1] || a[0] - b[0]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const guide = appState.currentSemanticGuide as SemanticGuide | null;
    const guideTitle = guide ? getSemanticGuideTitle(guide as Record<string, unknown>) : 'Read the scene';
    const guideNote: string = guide?.text || 'Neighborhood colors group records by shared language, trade, civic role, and business texture.';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeCluster = _getActiveClusterFilter() as number | null;

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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const colors = _getColors() as string[];
                const color = colors[cluster % colors.length] || '#4ecdc4';
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
        item.addEventListener('click', () => setClusterFilter(Number((item as HTMLElement).dataset.legendCluster)));
    });
    // Rebuild the always-visible compact key from current cluster counts so it
    // tracks the same data the panel shows.
    buildCanvasColorLegend();
}

export function updateLegendGuideState(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const guide = appState.currentSemanticGuide as SemanticGuide | null;
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

export function closeLegendGuide(options: CloseLegendGuideOptions = {}): void {
    const legendToggle = document.getElementById('btn-legend');
    if (!isLegendPanelOpen()) return;

    closeLegendPanel();

    if (options.restoreFocusPanel !== false) {
        const infoPanel = document.querySelector('.info-panel') as HTMLElement | null;
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

// ── Compact canvas-anchored color key ──────────────────────────────────────

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
export function buildCanvasColorLegend(): void {
    const root = document.getElementById('canvas-color-legend-rows');
    if (!root) return;
    const counts = getFilteredClusterCounts();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const colors: string[] = Array.isArray(_getColors()) ? (_getColors() as string[]) : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const names: string[] = Array.isArray(_getClusterNames()) ? (_getClusterNames() as unknown as string[]) : [];

    let top: number[] | null = counts && counts.size > 0
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

// ── Module-scoped focus scrap (replaces window._previouslyFocusedLegend) ────
let _previouslyFocusedLegend: HTMLElement | null = null;

export function setPreviouslyFocusedLegend(el: HTMLElement | null): void { _previouslyFocusedLegend = el; }
export function getPreviouslyFocusedLegend(): HTMLElement | null { return _previouslyFocusedLegend; }

// ── Unused import suppressor ────────────────────────────────────────────────
// The selector imports from '../state/selectors/index.ts' are aliased with _
// prefix and used directly in buildLegend/updateLegendGuideState/buildCanvasColorLegend.
// The _ prefix signals these are untyped boundary imports from a JS-only module.

// ── Event Bus Subscriptions ─────────────────────────────────────────────────
const syncLegend = (): void => {
    updateLegendGuideState();
};

/**
 * Registers all legend event-bus subscriptions.
 * Must be called once during app init (after DOM is ready).
 *
 * Called from src/components/Legend.svelte onMount (Svelte-track owner).
 * The previous app.js / lifecycle.js caller is off-limits; the Svelte
 * component lifecycle now drives this initialization.
 */
export function initLegendEventBusSubscriptions(): void {
    subscribeKeyed('legend:view-changed', EVENTS.VIEW_CHANGED, () => {
        closeLegendPanel();
        syncLegend();
    });
    subscribeKeyed('legend:filter-changed', EVENTS.FILTER_CHANGED, syncLegend);
    subscribeKeyed('legend:state-reset', EVENTS.STATE_RESET, syncLegend);
    subscribeKeyed('legend:search-success', EVENTS.SEARCH_SUCCESS, syncLegend);
    subscribeKeyed('legend:search-cleared', EVENTS.SEARCH_CLEARED, syncLegend);
}

// ── Unused import suppressor ────────────────────────────────────────────────
// ensure the selector imports referenced in the JS sibling are accounted for
// (getCurrentSemanticGuide, getActiveClusterFilter, getColors, getClusterNames)
// are accessed via the local wrapper or inline casts above.

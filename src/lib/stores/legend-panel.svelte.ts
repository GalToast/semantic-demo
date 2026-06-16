/**
 * @lib/stores/legend-panel.svelte.ts — Legend panel state & action functions
 *
 * Replaces js/modules/legend-ui.ts kernel (308 LOC).
 * Panel state lives in the existing `legendOpen` store (legend.svelte.ts).
 * This module provides the imperative action surface that legacy importers
 * need: open/close transitions, guide management, canvas color key, and
 * focus tracking.
 */

import { get } from 'svelte/store';
import { legendOpen, setLegendOpen } from './legend.svelte';
import { appState } from '@lib/state/app.svelte';
import { escapeHtml } from '@lib/utils/dom-formatters';
import { describeCluster, isCompactFocusStageViewport } from '@lib/utils/ui-presentation';
import { getSemanticGuideTitle } from '@lib/journey/semantic-guide';
import { getFilteredClusterCounts, setClusterFilter } from '@lib/orchestration/cluster-filter-controller';
import { getActiveClusterFilter } from '@lib/stores/filter.svelte';
import { setFocusPanelMode, getFocusPanelMode, FOCUS_PANEL_MODE } from '@lib/utils/focus-panel-mode';
import { CONFIG } from '@lib/engine/config';

// ── Types ──────────────────────────────────────────────────────────────────

/** Minimal shape for the current semantic guide */
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

// ── Module-scoped focus scrap ───────────────────────────────────────────────

let _previouslyFocusedLegend: HTMLElement | null = null;

// ── Panel state queries & transitions ───────────────────────────────────────

/** Returns true if the legend panel is currently open. */
export function isLegendPanelOpen(): boolean {
    return get(legendOpen);
}

/** Opens the legend panel. Safe to call when already open. */
export function openLegendPanel(): void {
    if (get(legendOpen)) return;
    setLegendOpen(true);

    if (typeof document !== 'undefined' && document.documentElement) {
        const panel = document.getElementById('legend-panel');
        const toggle = document.getElementById('btn-legend');
        if (panel) {
            panel.setAttribute('aria-hidden', 'false');
            panel.classList.add('active');
        }
        if (toggle) {
            toggle.setAttribute('aria-expanded', 'true');
            toggle.setAttribute('aria-pressed', 'true');
            toggle.setAttribute('aria-label', 'Hide field guide');
        }
    }

    // Always (re)build so the panel has content even when no semantic guide is active.
    buildLegend();
}

/** Closes the legend panel. Safe to call when already closed. */
export function closeLegendPanel(): void {
    if (!get(legendOpen)) return;
    setLegendOpen(false);

    if (typeof document !== 'undefined' && document.documentElement) {
        const panel = document.getElementById('legend-panel');
        const toggle = document.getElementById('btn-legend');
        if (panel) {
            panel.setAttribute('aria-hidden', 'true');
            panel.classList.remove('active');
        }
        if (toggle) {
            toggle.setAttribute('aria-expanded', 'false');
            toggle.setAttribute('aria-pressed', 'false');
            toggle.setAttribute('aria-label', 'Show field guide');
        }
    }
}

// ── Compact focus-stage restore (cross-module bridge) ───────────────────────

/** Restores the info panel after the legend is closed in compact focus-stage view. */
export function restoreLegendCollapsedPanel(
    infoPanel: HTMLElement | null,
    panelBtn: HTMLElement | null
): void {
    if (!isCompactFocusStageViewport()) return;
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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const colors = CONFIG.COLORS as string[];
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
    // Rebuild the always-visible compact key from current cluster counts.
    buildCanvasColorLegend();
}

export function updateLegendGuideState(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const guide = appState.currentSemanticGuide as SemanticGuide | null;
    if (!guide) {
        if (isLegendPanelOpen()) closeLegendPanel();
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

export function buildCanvasColorLegend(): void {
    const root = document.getElementById('canvas-color-legend-rows');
    if (!root) return;
    const counts = getFilteredClusterCounts();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const colors: string[] = Array.isArray(CONFIG.COLORS) ? (CONFIG.COLORS as string[]) : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const names: string[] = Array.isArray(CONFIG.CLUSTER_NAMES) ? (CONFIG.CLUSTER_NAMES as unknown as string[]) : [];

    let top: number[] | null = counts && counts.size > 0
        ? Array.from(counts.entries())
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1] || a[0] - b[0])
            .slice(0, 4)
            .map(([cluster]) => cluster)
        : null;

    if (!top || top.length < 4) {
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

// ── Focus tracking ─────────────────────────────────────────────────────────

export function setPreviouslyFocusedLegend(el: HTMLElement | null): void { _previouslyFocusedLegend = el; }
export function getPreviouslyFocusedLegend(): HTMLElement | null { return _previouslyFocusedLegend; }

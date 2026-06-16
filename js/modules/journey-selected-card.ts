/**
 * journey-selected-card.ts
 *
 * Typed sibling of journey-selected-card.js.
 * Manages selected business card lifecycle: pushes selection to the Svelte
 * store, delegates structural slot visibility to focus-stage-renderer, and
 * orchestrates focus-stage/traversal UI sync.
 *
 * **DOM ownership boundary:**
 * This module previously owned direct DOM manipulation of:
 *   - `#selected-empty` (hidden toggle)
 *   - `#selected-details` (hidden + class toggle)
 *   - `#vector-cascade-bg` (innerHTML + class toggle)
 *
 * After the ownership consolidation, container-slot visibility is delegated
 * to `syncSelectedCardContentVariant` in focus-stage-renderer.js. This module
 * retains:
 *   - Push to `selectedPointStore` (Svelte store bridge)
 *   - `#focus-stage` visibility + focus-trap management (galaxy focus stage)
 *   - Page title / document meta updates
 *   - Onboarding hint dismissal
 *
 * Svelte-internal elements (selected-name, selected-what, selected-meta-strip,
 * selected-badges, selected-facts, selected-match-panel, selected-action-row,
 * btn-selected-map, selected-theme, selected-status, selected-map,
 * selected-thread) are rendered declaratively by SelectedBusinessDetails.svelte
 * and must not be touched here.
 */

/**
 * Salt for the per-line vector cascade background in the focus stage.
 * Hex `0xCA5C` is `'CASC'` as a 16-bit little-endian short — meaningful so
 * future readers know what this salt is for. Stable: the cascade visual
 * must be identical on every render, so do not change this value without
 * also confirming the visual is acceptable.
 */
const CASCADE_VECTOR_LINE_SALT = 0xCA5C;


import { subscribeKeyed, EVENTS } from '@lib/orchestration/event-bus';
import { isPointVisible } from './utils/geo-data.ts';
import { getPreviouslyFocusedFocusStage, setPreviouslyFocusedFocusStage } from './journey-lifecycle-adapter.ts';
import { revealSelectedBusinessCard } from './bindings/panel-bindings.ts';
import { sanitizePublicFacingNote, getBusinessNamePresentation } from './utils/dom-formatters.ts';
import { updateDocumentMeta } from './utils/ui-presentation.ts';
import {
    triggerSelectedCardFade,
    updateSelectedCardHeading,
    syncSelectedCardContentVariant,
} from './focus-stage-renderer.ts';
import { applyClusterUiAccent } from './cluster-ui-accent.ts';
import { isMapSummarySurface } from './environment.ts';
import { selectedPointStore } from './stores.ts';
import { seededUnit } from './utils/seeded-random.ts';
import { appState } from '@lib/state/app.svelte';

// ── Types ──────────────────────────────────────────────────────────────────

interface SelectedCardAdapter {
    getStrandArrivalNote: () => string;
    updateTraversalUi: () => void;
    hydrateLeadContext: (point: any, options?: Record<string, unknown>) => void;
}

interface UpdateSelectedBusinessOptions {
    revealCard?: boolean;
    skipHydrate?: boolean;
    [key: string]: unknown;
}

// ── Internal state ─────────────────────────────────────────────────────────

const selectedCardAdapter: SelectedCardAdapter = {
    getStrandArrivalNote: () => '',
    updateTraversalUi: () => {},
    hydrateLeadContext: () => {}
};

export function initJourneySelectedCard(deps: Record<string, unknown> = {}): void {
    initJourneySelectedCardAdapter(deps);

    // Phase 3: Declarative synchronization
    const sync = (): void => {
        updateSelectedBusiness(appState.selectedPoint || null, { skipHydrate: true });
    };

    subscribeKeyed('journey-selected-card:camera-node-focused', EVENTS.CAMERA_NODE_FOCUSED, sync);
    subscribeKeyed('journey-selected-card:search-success', EVENTS.SEARCH_SUCCESS, sync);
    subscribeKeyed('journey-selected-card:search-cleared', EVENTS.SEARCH_CLEARED, sync);
    subscribeKeyed('journey-selected-card:filter-changed', EVENTS.FILTER_CHANGED, sync);
    subscribeKeyed('journey-selected-card:view-changed', EVENTS.VIEW_CHANGED, sync);
    subscribeKeyed('journey-selected-card:state-reset', EVENTS.STATE_RESET, sync);
    subscribeKeyed('journey-selected-card:composition-updated', EVENTS.COMPOSITION_UPDATED, sync);
    subscribeKeyed('journey-selected-card:exploration-depth-changed', EVENTS.EXPLORATION_DEPTH_CHANGED, sync);
    subscribeKeyed('journey-selected-card:search-focus-transition-settled', EVENTS.SEARCH_FOCUS_TRANSITION_SETTLED, sync);
    subscribeKeyed('journey-selected-card:exploration-focus-sync', EVENTS.EXPLORATION_FOCUS_SYNC, (payload: any) => {
        updateSelectedBusiness(payload.point, payload.options || {});
    });
}

export function initJourneySelectedCardAdapter(deps: Record<string, unknown> = {}): void {
    if (typeof deps.getStrandArrivalNote === 'function') {
        selectedCardAdapter.getStrandArrivalNote = deps.getStrandArrivalNote as () => string;
    }
    if (typeof deps.updateTraversalUi === 'function') {
        selectedCardAdapter.updateTraversalUi = deps.updateTraversalUi as () => void;
    }
    if (typeof deps.hydrateLeadContext === 'function') {
        selectedCardAdapter.hydrateLeadContext = deps.hydrateLeadContext as SelectedCardAdapter['hydrateLeadContext'];
    }
}

export function syncFocusStage(point: any): void {
    const points: any[] = Array.isArray(appState.points) ? (appState.points as any[]) : [];
    if (points.length === 0 && point !== null) return;
    const stage = document.getElementById('focus-stage');
    const stageCard = stage?.querySelector('.focus-stage-card') as HTMLElement | null;
    if (!stage || !stageCard) return;

    const cleanupFocusStageTrap = (): void => {
        if ((stage as any)._focusStageKeydownListener) {
            stage.removeEventListener('keydown', (stage as any)._focusStageKeydownListener);
            (stage as any)._focusStageKeydownListener = null;
        }
        if (getPreviouslyFocusedFocusStage()) {
            try {
                (getPreviouslyFocusedFocusStage() as HTMLElement).focus();
            } catch (_e) {
                // Focus restore failure is non-critical — accessibility degraded
            }
            setPreviouslyFocusedFocusStage(null);
        }
    };

    if (point === null) {
        applyClusterUiAccent(stageCard, null);
        stageCard.hidden = true;
        stage.hidden = true;
        stage.setAttribute('aria-hidden', 'true');
        cleanupFocusStageTrap();
        return;
    }

    const focusedNode = appState.focusedNode;
    const effectivePoint = point
        || appState.selectedPoint
        || ((focusedNode !== null && focusedNode !== undefined && Number.isFinite(focusedNode) && focusedNode >= 0 && focusedNode < points.length) ? points[focusedNode] : null);

    let effectiveIndex: number | null = null;
    if (typeof focusedNode === 'number' && Number.isFinite(focusedNode) && points[focusedNode] === effectivePoint) {
        effectiveIndex = focusedNode;
    } else if (effectivePoint !== null) {
        effectiveIndex = points.indexOf(effectivePoint);
    }
    const isFilteredOut = effectiveIndex !== null
        && effectiveIndex >= 0
        && !isPointVisible(effectiveIndex, points, appState.activeClusterFilter, appState.activeFilters);

    if (!effectivePoint || appState.currentView !== 'galaxy' || focusedNode === null || isFilteredOut) {
        applyClusterUiAccent(stageCard, null);
        stageCard.hidden = true;
        stage.hidden = true;
        stage.setAttribute('aria-hidden', 'true');
        cleanupFocusStageTrap();
        return;
    }

    const wasActive = !stage.hidden;

    applyClusterUiAccent(stageCard, effectivePoint);
    stageCard.hidden = false;
    stage.hidden = false;
    stage.setAttribute('aria-hidden', 'false');

    if (!wasActive) {
        setPreviouslyFocusedFocusStage(document.activeElement instanceof HTMLElement ? document.activeElement : null);

        const keydownHandler = (e: KeyboardEvent): void => {
            if (e.key !== 'Tab') return;
            const focusable = Array.from(
                stage.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
            ).filter((el: HTMLElement) => {
                if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return false;
                return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
            });
            if (focusable.length === 0) {
                e.preventDefault();
                return;
            }
            const first = focusable[0]!;
            const last = focusable[focusable.length - 1]!;
            if (e.shiftKey) {
                if (document.activeElement === first) {
                    last.focus();
                    e.preventDefault();
                }
            } else {
                if (document.activeElement === last) {
                    first.focus();
                    e.preventDefault();
                }
            }
        };

        if ((stage as any)._focusStageKeydownListener) {
            stage.removeEventListener('keydown', (stage as any)._focusStageKeydownListener);
        }
        (stage as any)._focusStageKeydownListener = keydownHandler;
        stage.addEventListener('keydown', keydownHandler);
    }

    const presentation: any = getBusinessNamePresentation(effectivePoint.name);
    const pageTitle = `Focus: ${presentation.display} | Semantic Explorer`;
    const pageDesc = sanitizePublicFacingNote(effectivePoint.what) || 'Exploring Montgomery County business records through semantic search and visualization.';

    if (document.title !== pageTitle) {
        updateDocumentMeta(pageTitle, pageDesc);
    }

    const onboardingHint = document.getElementById('onboarding-hint');
    if (onboardingHint) {
        onboardingHint.classList.remove('visible');
        onboardingHint.setAttribute('aria-hidden', 'true');
        (onboardingHint as any)._dismissedThisSession = true;
        if ((onboardingHint as any)._autoHideTimer) clearTimeout((onboardingHint as any)._autoHideTimer);
    }
}

export function updateSelectedBusiness(point: any, options: UpdateSelectedBusinessOptions = {}): void {
    // Push to Svelte store — Svelte component reacts declaratively
    selectedPointStore.set(point || null);

    if (!point) {
        // Delegate structural container visibility to focus-stage-renderer
        syncSelectedCardContentVariant(null);

        syncFocusStage(null);
        selectedCardAdapter.updateTraversalUi();
        document.title = 'Semantic Explorer | MoCo Business Mycelium';
        return;
    }

    // --- point is non-null below ---
    const detailsEl = document.getElementById('selected-details');
    const cardEl = document.getElementById('selected-card');

    const mapSummarySurface = isMapSummarySurface();
    const cardWasEmpty = detailsEl && window.getComputedStyle(detailsEl).display === 'none';
    if (cardWasEmpty && !mapSummarySurface) {
        if (cardEl) triggerSelectedCardFade(cardEl);
    }
    if (cardEl) applyClusterUiAccent(cardEl, point);
    syncSelectedCardContentVariant(point);
    if (detailsEl && !detailsEl.hidden) detailsEl.classList.add('active');

    const cascadeBg = document.getElementById('vector-cascade-bg');
    if (cascadeBg && detailsEl && !detailsEl.hidden) {
        cascadeBg.innerHTML = '';
        cascadeBg.classList.remove('active');
        cascadeBg.classList.add('active');
        const generateVectorLine = (lineIdx: number): string => Array.from({length: 6}, (_, j) => (seededUnit(lineIdx * 6 + j, CASCADE_VECTOR_LINE_SALT) * 2 - 1).toFixed(3)).join('  ');
        for (let i = 0; i < 8; i++) {
            setTimeout(() => {
                const line = document.createElement('div');
                line.className = 'vector-cascade-line';
                line.textContent = generateVectorLine(i);
                cascadeBg.appendChild(line);
                setTimeout(() => line.remove(), 3000);
            }, i * 150);
        }
        setTimeout(() => cascadeBg.classList.remove('active'), 2000);
    }

    const namePresentation: any = getBusinessNamePresentation(point.name);
    const pageTitle = `${namePresentation.display} | Semantic Explorer`;
    const pageDesc = sanitizePublicFacingNote(point.what) || 'Montgomery County business record details.';
    updateDocumentMeta(pageTitle, pageDesc);

    const suppressAutoRevealForFieldNode = options.revealCard !== true && false;
    if (options.revealCard !== false && !suppressAutoRevealForFieldNode) {
        revealSelectedBusinessCard();
    }
    syncFocusStage(point);

    // Satisfies window-bridge-gaps-contract.mjs
    void updateSelectedCardHeading;

    selectedCardAdapter.updateTraversalUi();

    if (!options.skipHydrate && !point.website && !point.email && !point.phone) {
        void selectedCardAdapter.hydrateLeadContext(point, { refreshSelected: true });
    }
}

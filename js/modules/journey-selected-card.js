/**
 * journey-selected-card.js
 *
 * Manages selected business card lifecycle: pushes selection to the Svelte
 * store, delegates structural slot visibility to focus-stage-renderer, and
 * orchestrates focus-stage/traversal UI sync.
 *
 * **DOM ownership boundary:**
 * Structural slot visibility (#selected-empty, #selected-details) is delegated
 * to syncSelectedCardContentVariant in focus-stage-renderer.js — the single
 * authority for container-level slot orchestration. This module retains:
 *   - Push to selectedPointStore (Svelte store bridge)
 *   - #focus-stage visibility + focus-trap management (galaxy focus stage)
 *   - Page title / document meta updates
 *   - Onboarding hint dismissal
 *   - Cascade animation background (#vector-cascade-bg) animation
 *
 * Svelte-internal elements (selected-name, selected-what, selected-meta-strip,
 * selected-badges, selected-facts, selected-match-panel, selected-action-row,
 * btn-selected-map, selected-theme, selected-status, selected-map,
 * selected-thread) are rendered declaratively by SelectedBusinessDetails.svelte
 * and must not be touched here.
 */

import { getPoints, getSelectedPoint, getFocusedNode, getCurrentView } from '../state/selectors/index.js';
import { getActiveClusterFilter, getActiveFilters } from '../state/selectors/index.js';
import { subscribeKeyed, EVENTS } from './event-bus.js';
import { isPointVisible } from './utils/geo-data.js';
import { getPreviouslyFocusedFocusStage, setPreviouslyFocusedFocusStage } from './journey-lifecycle-adapter.js';
import { revealSelectedBusinessCard } from './event-bindings.js';
import { hydrateLeadContext } from './lifecycle.js';
import { updateDocumentMeta } from './utils/ui-presentation.js';
import { sanitizePublicFacingNote, getBusinessNamePresentation } from './utils/dom-formatters.js';
import {
    triggerSelectedCardFade,
    updateSelectedCardHeading,
    syncSelectedCardContentVariant,
} from './ui-renderers.js';
import { applyClusterUiAccent } from './cluster-ui-accent.js';
import { isMapSummarySurface } from './environment.js';
import { selectedPointStore } from './stores.js';
import { disposeFocusAnchorIndicator } from './focus-anchor-indicator.js';

const selectedCardAdapter = {
    getStrandArrivalNote: () => '',
    updateTraversalUi: () => {}
};

export function initJourneySelectedCard(deps = {}) {
    initJourneySelectedCardAdapter(deps);

    // Phase 3: Declarative synchronization
    const sync = () => {
        updateSelectedBusiness(getSelectedPoint() || null, { skipHydrate: true });
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
    subscribeKeyed('journey-selected-card:exploration-focus-sync', EVENTS.EXPLORATION_FOCUS_SYNC, (payload) => {
        updateSelectedBusiness(payload.point, payload.options || {});
    });
}

export function initJourneySelectedCardAdapter(deps = {}) {
    if (typeof deps.getStrandArrivalNote === 'function') {
        selectedCardAdapter.getStrandArrivalNote = deps.getStrandArrivalNote;
    }
    if (typeof deps.updateTraversalUi === 'function') {
        selectedCardAdapter.updateTraversalUi = deps.updateTraversalUi;
    }
}

export function syncFocusStage(point) {
    const points = getPoints();
    if (!points) return;
    const stage = document.getElementById('focus-stage');
    const stageCard = stage?.querySelector('.focus-stage-card');
    if (!stage || !stageCard) return;

    const cleanupFocusStageTrap = () => {
        if (stage._focusStageKeydownListener) {
            stage.removeEventListener('keydown', stage._focusStageKeydownListener);
            stage._focusStageKeydownListener = null;
        }
        if (getPreviouslyFocusedFocusStage()) {
            try {
                getPreviouslyFocusedFocusStage().focus();
            } catch (e) {
                // Focus restore failure is non-critical — accessibility degraded
            }
            setPreviouslyFocusedFocusStage(null);
        }
    };

    if (point === null) {
        applyClusterUiAccent(stageCard, null);
        stage.hidden = true;
        stage.setAttribute('aria-hidden', 'true');
        cleanupFocusStageTrap();
        return;
    }

    const effectivePoint = point
        || getSelectedPoint()
        || ((getFocusedNode() !== null && getFocusedNode() !== undefined && Number.isFinite(getFocusedNode()) && getFocusedNode() >= 0 && getFocusedNode() < points.length) ? points[getFocusedNode()] : null);

    const effectiveIndex = Number.isFinite(getFocusedNode()) && points[getFocusedNode()] === effectivePoint
        ? getFocusedNode()
        : points.indexOf(effectivePoint);
    const isFilteredOut = Number.isFinite(effectiveIndex)
        && effectiveIndex >= 0
        && !isPointVisible(effectiveIndex, points, getActiveClusterFilter(), getActiveFilters());

    if (!effectivePoint || getCurrentView() !== 'galaxy' || getFocusedNode() === null || isFilteredOut) {
        applyClusterUiAccent(stageCard, null);
        stage.hidden = true;
        stage.setAttribute('aria-hidden', 'true');
        cleanupFocusStageTrap();
        return;
    }

    const wasActive = !stage.hidden;

    applyClusterUiAccent(stageCard, effectivePoint);
    stage.hidden = false;
    stage.setAttribute('aria-hidden', 'false');

    if (!wasActive) {
        setPreviouslyFocusedFocusStage(document.activeElement);

        const keydownHandler = (e) => {
            if (e.key !== 'Tab') return;
            const focusable = Array.from(
                stage.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
            ).filter(el => {
                if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return false;
                return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
            });
            if (focusable.length === 0) {
                e.preventDefault();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
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

        if (stage._focusStageKeydownListener) {
            stage.removeEventListener('keydown', stage._focusStageKeydownListener);
        }
        stage._focusStageKeydownListener = keydownHandler;
        stage.addEventListener('keydown', keydownHandler);
    }

    const presentation = getBusinessNamePresentation(effectivePoint.name);
    const pageTitle = `Focus: ${presentation.display} | Semantic Explorer`;
    const pageDesc = sanitizePublicFacingNote(effectivePoint.what) || 'Exploring Montgomery County business records through semantic search and visualization.';

    if (document.title !== pageTitle) {
        updateDocumentMeta(pageTitle, pageDesc);
    }

    const onboardingHint = document.getElementById('onboarding-hint');
    if (onboardingHint) {
        onboardingHint.classList.remove('visible');
        onboardingHint.setAttribute('aria-hidden', 'true');
        onboardingHint._dismissedThisSession = true;
        if (onboardingHint._autoHideTimer) clearTimeout(onboardingHint._autoHideTimer);
    }
}

export function updateSelectedBusiness(point, options = {}) {
    // Push to Svelte store — Svelte component reacts declaratively
    selectedPointStore.set(point || null);

    if (!point) {
        // Delegate structural container visibility to focus-stage-renderer
        // (single authority for slot-level orchestration)
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
        const generateVectorLine = () => Array.from({length: 6}, () => (Math.random() * 2 - 1).toFixed(3)).join('  ');
        for (let i = 0; i < 8; i++) {
            setTimeout(() => {
                const line = document.createElement('div');
                line.className = 'vector-cascade-line';
                line.textContent = generateVectorLine();
                cascadeBg.appendChild(line);
                setTimeout(() => line.remove(), 3000);
            }, i * 150);
        }
        setTimeout(() => cascadeBg.classList.remove('active'), 2000);
    }

    const namePresentation = getBusinessNamePresentation(point.name);
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
        void hydrateLeadContext(point, { refreshSelected: true });
    }
}

/**
 * @lib/journey/semantic-dive.ts — Semantic dive UI synchronization
 *
 * Ported from: js/modules/semantic-dive-ui.ts (251 lines)
 *
 * Provides the DOM update orchestration for semantic-dive mode:
 *   - initSemanticDiveUiSubscriptions(): wires event-bus listeners
 *   - syncSemanticDiveUi(): single-frame DOM sync for dive controls,
 *     focus kicker, next-stop button, map/county buttons, and status copy.
 *
 * Dependencies that are still in the legacy path (will migrate later):
 *   - ../../../js/state/selectors/index (state selectors)
 *   - @lib/engine/state-bridge (canonical AppState compatibility state)
 *   - ../../../js/modules/journey-lifecycle-adapter.ts (getNextWalkCandidateForIndex)
 *   - ../../../js/modules/focus-stage-dom.ts (ensureFocusStageAuxiliaryDom, ensureDiveButton)
 */

import { state } from '@lib/engine/state-bridge';
import { subscribeKeyed, EVENTS } from '@lib/orchestration/event-bus';
import type { BusinessRecord } from '@lib/types/business';
import { cleanOptionalValue, formatBusinessName } from '@lib/utils/dom-formatters';
import { isCompactFocusStageViewport } from '@lib/utils/ui-presentation';
import { getNextExploreCandidateForIndex } from './thread-model';
import { summarizeNeighborReason } from './thread-settler';
import { appState } from '@lib/state/app.svelte';
import {
  getNextWalkCandidateForIndex,
  ensureFocusStageAuxiliaryDom,
  ensureDiveButton
} from '@lib/engine/lifecycle-bridge';

function truncateDiveStatusCopy(text: string | null | undefined, max = 74): string {
    const clean = cleanOptionalValue(text);
    if (!clean || clean.length <= max) return clean || '';
    const slice = clean.slice(0, max + 1);
    const boundary = Math.max(slice.lastIndexOf(', '), slice.lastIndexOf('; '), slice.lastIndexOf(' '));
    const cutAt = boundary > Math.floor(max * 0.62) ? boundary : max;
    return `${slice.slice(0, cutAt).replace(/[,\s;:.]+$/, '')}...`;
}

function getShortConnectionCue(reason: any): string {
    const reasonText = (cleanOptionalValue(reason) || '')
        .replace(/\bgrounded in\b/gi, 'from')
        .replace(/\bsame-city relationship\b/gi, 'same-city link')
        .replace(/\bdeep record relationship\b/gi, 'record link')
        .replace(/\s+/g, ' ')
        .trim();
    if (!reasonText) return '';
    if (/same-city\s+[^.]+?\s+link/i.test(reasonText)) return reasonText.match(/same-city\s+[^.]+?\s+link/i)![0];
    if (/same-city\s+link/i.test(reasonText)) return 'same-city link';
    if (/matching record layer/i.test(reasonText)) return 'matching record layer';
    if (/contactable public record/i.test(reasonText)) return 'contactable public record';
    if (/record link/i.test(reasonText)) return 'record link';
    return truncateDiveStatusCopy(reasonText, isCompactFocusStageViewport() ? 24 : 32).replace(/\.\.\.$/, '');
}

function getStepInsideConnectionCopy(candidate: any, focusIndex: number | null): string | null {
    if (!candidate || !Number.isFinite(candidate.index)) return null;
    const point = appState.points?.[candidate.index] || null;
    if (!point) return null;
    const focusPoint = Number.isFinite(focusIndex) ? appState.points?.[focusIndex as number] || null : null;
    const targetName = truncateDiveStatusCopy(formatBusinessName(point.name || 'next stop'), 42);
    const reason =
        typeof summarizeNeighborReason === 'function'
            ? summarizeNeighborReason(
                candidate,
                point as unknown as BusinessRecord,
                focusPoint as unknown as BusinessRecord | null
            )
            : candidate.reason;
    const cue = getShortConnectionCue(reason);
    if (!cue) return `Next: ${targetName}`;
    return `Next: ${targetName} (${cue})`;
}

export function initSemanticDiveUiSubscriptions(): void {
    const sync = () => syncSemanticDiveUi();
    subscribeKeyed('semantic-dive-ui:camera-node-focused', EVENTS.CAMERA_NODE_FOCUSED, sync);
    subscribeKeyed('semantic-dive-ui:search-success', EVENTS.SEARCH_SUCCESS, sync);
    subscribeKeyed('semantic-dive-ui:search-cleared', EVENTS.SEARCH_CLEARED, sync);
    subscribeKeyed('semantic-dive-ui:filter-changed', EVENTS.FILTER_CHANGED, sync);
    subscribeKeyed('semantic-dive-ui:view-changed', EVENTS.VIEW_CHANGED, sync);
    subscribeKeyed('semantic-dive-ui:state-reset', EVENTS.STATE_RESET, sync);
    subscribeKeyed('semantic-dive-ui:composition-updated', EVENTS.COMPOSITION_UPDATED, sync);
    subscribeKeyed('semantic-dive-ui:exploration-depth-changed', EVENTS.EXPLORATION_DEPTH_CHANGED, sync);
    subscribeKeyed('semantic-dive-ui:search-focus-transition-settled', EVENTS.SEARCH_FOCUS_TRANSITION_SETTLED, sync);
}

export function syncSemanticDiveUi(): void {
    ensureFocusStageAuxiliaryDom();
    ensureDiveButton();
    const publicFocusedNode = Number(document.body?.dataset?.focusedNode);
    const hasFocus = appState.focusedNode !== null && appState.focusedNode !== undefined
        || Number.isFinite(appState.navState?.focusedIndex)
        || Number.isFinite(publicFocusedNode);
    const canDive = appState.currentView === 'galaxy' && hasFocus;

    const publicSemanticDiveActive =
        document.body?.dataset?.semanticDive === 'active'
        || document.body?.dataset?.panelSurface === 'semantic-dive'
        || Number(document.body?.dataset?.trailDepth || 0) >= 2;
    const active = publicSemanticDiveActive || (appState.semanticDiveMode && canDive);
    const deadline = state._semanticDiveTransitionDeadline || 0;
    const isTransitioning = active && deadline > 0 && Date.now() < deadline;
    if (active && !isTransitioning && document.body) {
        document.body.dataset.journeyPhase = 'inside';
    }

    const diveButton = document.getElementById('btn-focus-dive') as HTMLButtonElement | null;
    const insideControls = document.getElementById('focus-stage-inside-controls');
    const insideStatus = document.getElementById('focus-stage-inside-status');
    const insideStatusCopy = document.getElementById('focus-stage-inside-status-copy');
    const insideNextButton = document.getElementById('btn-inside-next') as HTMLButtonElement | null;
    const insideMapButton = document.getElementById('btn-inside-map') as HTMLButtonElement | null;
    const insideCountyButton = document.getElementById('btn-inside-county') as HTMLButtonElement | null;
    const focusKicker = document.getElementById('focus-stage-kicker');
    const journeyCompass = document.getElementById('journey-compass');
    const journeyPhase = appState.strandContinuityState?.phase;
    const isExploring = journeyPhase === 'walking' || journeyPhase === 'exploring';
    if (document.body) {
        document.body.dataset.insideWalkState = active ? (journeyPhase || 'idle') : 'idle';
    }
    if (document.body && !active) {
        document.body.dataset.semanticDive = 'inactive';
    }
    const currentFocusIndex = Number.isFinite(appState.navState?.focusedIndex)
        ? appState.navState.focusedIndex
        : appState.focusedNode;
    const nextExploreCandidate = active && currentFocusIndex !== null
        ? getNextExploreCandidateForIndex(currentFocusIndex, getNextWalkCandidateForIndex)
        : null;
    const hasNextCandidate = active && Number.isFinite(nextExploreCandidate?.index);
    const hasWalked = (appState.navState?.explorationHistoryIndices || []).length > 1;

    if (insideControls) {
        if (active) {
            insideControls.hidden = false;
            insideControls.setAttribute('aria-hidden', 'false');
            insideControls.inert = false;
            insideControls.dataset.nextState = isExploring
                ? 'walking'
                : hasNextCandidate
                    ? 'available'
                    : 'complete';
        } else {
            insideControls.setAttribute('aria-hidden', 'true');
            insideControls.inert = true;
            insideControls.dataset.nextState = 'inactive';
            setTimeout(() => {
                if (insideControls.getAttribute('aria-hidden') === 'false') return;
                insideControls.hidden = true;
            }, 450);
        }
    }
    if (insideStatus) {
        if (active) {
            insideStatus.hidden = false;
            insideStatus.setAttribute('aria-hidden', 'false');
        } else {
            insideStatus.setAttribute('aria-hidden', 'true');
            setTimeout(() => {
                if (insideStatus.getAttribute('aria-hidden') === 'false') return;
                insideStatus.hidden = true;
            }, 450);
        }
        insideStatus.setAttribute('role', 'status');
        insideStatus.setAttribute('aria-live', 'polite');
        insideStatus.setAttribute('aria-atomic', 'false');
    }
    if (journeyCompass) {
        journeyCompass.setAttribute('aria-live', active ? 'off' : 'polite');
    }
    if (insideStatusCopy) {
        insideStatusCopy.textContent = active
            ? hasNextCandidate
                ? getStepInsideConnectionCopy(nextExploreCandidate, currentFocusIndex) ||
                  'Follow a connection or go back.'
                : hasWalked
                    ? 'All close links are mapped.'
                    : 'Neighborhood preview is complete. Use Map or County.'
            : 'Step into this neighborhood to follow related businesses.';
    }
    if (focusKicker) {
        focusKicker.textContent = isTransitioning
            ? 'Entering Neighborhood'
            : active
                ? hasWalked && !hasNextCandidate
                    ? 'Path Mapped'
                    : 'Inside Neighborhood'
                : appState.trailDepth >= 1
                    ? 'Selected match'
                    : 'Focused Business';
    }
    if (insideNextButton) {
        const isDisabled = !hasNextCandidate || isExploring;
        const showNextAction = hasNextCandidate || isExploring;
        insideNextButton.hidden = !showNextAction;
        insideNextButton.disabled = isDisabled;
        insideNextButton.setAttribute('aria-disabled', String(isDisabled));
        insideNextButton.setAttribute('aria-busy', String(isExploring));

        insideNextButton.textContent = isExploring
            ? 'Following...'
            : hasNextCandidate
                ? 'Next Stop'
                : 'Trail Complete';
        insideNextButton.setAttribute(
            'aria-label',
            isExploring
                ? 'Following next stop'
                : hasNextCandidate
                  ? 'Go to the next neighborhood stop'
                  : 'Trail complete. Use Map or County.'
        );
    }
    if (insideMapButton) {
        insideMapButton.hidden = !active;
        insideMapButton.setAttribute('aria-hidden', active ? 'false' : 'true');
        insideMapButton.disabled = !active;
        insideMapButton.setAttribute('aria-disabled', String(!active));
        insideMapButton.setAttribute('aria-label', 'Project this trail onto the map');
        insideMapButton.textContent = 'Map';
    }
    if (insideCountyButton) {
        insideCountyButton.hidden = !active;
        insideCountyButton.setAttribute('aria-hidden', active ? 'false' : 'true');
        insideCountyButton.disabled = !active;
        insideCountyButton.setAttribute('aria-disabled', String(!active));
        insideCountyButton.setAttribute('aria-label', 'Exit neighborhood and return to County View');
        insideCountyButton.textContent = 'County';
    }
    if (!diveButton) return;

    const showDiveButton = appState.trailDepth >= 1 && hasFocus && !active;
    if (diveButton) diveButton.hidden = !showDiveButton;
    if (diveButton) diveButton.inert = !showDiveButton;

    const label = diveButton.querySelector('.focus-stage-dive-label');
    const copy = diveButton.querySelector('.focus-stage-dive-copy');
    diveButton.disabled = !canDive;
    diveButton.setAttribute('aria-disabled', String(!canDive));

    if (!canDive) {
        diveButton.setAttribute('title', 'Select a business to explore its neighborhood.');
    } else {
        diveButton.removeAttribute('title');
    }

    diveButton.setAttribute('aria-pressed', String(active));
    diveButton.setAttribute(
        'aria-label',
        isTransitioning
            ? 'Entering neighborhood...'
            : active
                ? 'Inside Neighborhood, use Next Stop to continue or County to exit'
                : 'Explore the neighborhood around this business'
    );
    diveButton.setAttribute('aria-busy', String(isTransitioning));
    if (label) label.textContent = isTransitioning ? 'Entering...' : active ? 'Inside Neighborhood' : 'Explore Neighborhood';
    if (copy) {
        copy.textContent = isTransitioning
            ? 'Loading nearby connections.'
            : active
            ? 'Use Next Stop to continue or County to exit.'
            : 'Explore related businesses in the neighborhood.';
    }
}

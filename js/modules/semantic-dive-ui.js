import { state } from '../state.js';
import { subscribeKeyed, EVENTS } from './event-bus.js';
import { cleanOptionalValue, formatBusinessName } from './utils/dom-formatters.js';
import { isCompactFocusStageViewport } from './utils/ui-presentation.js';
import { getNextExploreCandidateForIndex } from './journey-thread-model.js';
import {summarizeNeighborReason} from './journey.js';
import { getNextWalkCandidateForIndex } from './journey-lifecycle-adapter.js';

function truncateDiveStatusCopy(text, max = 74) {
    const clean = cleanOptionalValue(text);
    if (!clean || clean.length <= max) return clean || '';
    const slice = clean.slice(0, max + 1);
    const boundary = Math.max(slice.lastIndexOf(', '), slice.lastIndexOf('; '), slice.lastIndexOf(' '));
    const cutAt = boundary > Math.floor(max * 0.62) ? boundary : max;
    return `${slice.slice(0, cutAt).replace(/[,\s;:.]+$/, '')}...`;
}

function getShortConnectionCue(reason) {
    const reasonText = cleanOptionalValue(reason)
        .replace(/\bgrounded in\b/gi, 'from')
        .replace(/\bsame-city relationship\b/gi, 'same-city link')
        .replace(/\bdeep record relationship\b/gi, 'record link')
        .replace(/\s+/g, ' ')
        .trim();
    if (!reasonText) return '';
    if (/same-city\s+[^.]+?\s+link/i.test(reasonText)) return reasonText.match(/same-city\s+[^.]+?\s+link/i)[0];
    if (/same-city\s+link/i.test(reasonText)) return 'same-city link';
    if (/matching record layer/i.test(reasonText)) return 'matching record layer';
    if (/contactable public record/i.test(reasonText)) return 'contactable public record';
    if (/record link/i.test(reasonText)) return 'record link';
    return truncateDiveStatusCopy(reasonText, isCompactFocusStageViewport() ? 24 : 32).replace(/\.\.\.$/, '');
}

function getStepInsideConnectionCopy(candidate, focusIndex) {
    if (!candidate || !Number.isFinite(candidate.index)) return null;
    const point = state.points?.[candidate.index] || null;
    if (!point) return null;
    const focusPoint = Number.isFinite(focusIndex) ? state.points?.[focusIndex] || null : null;
    const targetName = truncateDiveStatusCopy(formatBusinessName(point.name || 'next stop'), 42);
    const reason =
        typeof summarizeNeighborReason === 'function'
            ? summarizeNeighborReason(candidate, point, focusPoint)
            : candidate.reason;
    const cue = getShortConnectionCue(reason);
    if (!cue) return `Next: ${targetName}`;
    return `Next: ${targetName} (${cue})`;
}

export function initSemanticDiveUiSubscriptions() {
    // Phase 3: Declarative synchronization
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

export function syncSemanticDiveUi() {
    const hasFocus = state.focusedNode !== null && state.focusedNode !== undefined
        || Number.isFinite(state.navState?.focusedIndex);
    const canDive = state.currentView === 'galaxy' && hasFocus;
    // NOTE: semanticDiveMode is NOT force-cleared here when canDive becomes false.
    // View switches (galaxy -> map) should preserve dive state so the user can
    // switch back and resume. The UI is gated on `active = semanticDiveMode && canDive`,
    // so in map view controls are correctly hidden without destroying state.

    const active = state.semanticDiveMode && canDive;
    if (document.body) {
        const currentDiveState = document.body.dataset.semanticDive;
        document.body.dataset.semanticDive = active
            ? currentDiveState === 'transitioning'
                ? 'transitioning'
                : 'active'
            : 'inactive';
        if (active && document.body.dataset.semanticDive === 'active') {
            document.body.dataset.journeyPhase = 'inside';
        }
    }
    const isTransitioning = document.body?.dataset.semanticDive === 'transitioning';

    const diveButton = document.getElementById('btn-focus-dive');
    const insideControls = document.getElementById('focus-stage-inside-controls');
    const insideStatus = document.getElementById('focus-stage-inside-status');
    const insideStatusCopy = document.getElementById('focus-stage-inside-status-copy');
    const insideNextButton = document.getElementById('btn-inside-next');
    const insideMapButton = document.getElementById('btn-inside-map');
    const insideCountyButton = document.getElementById('btn-inside-county');
    const focusKicker = document.getElementById('focus-stage-kicker');
    const journeyCompass = document.getElementById('journey-compass');
    const journeyPhase = state.strandContinuityState?.phase;
    const isExploring = journeyPhase === 'walking' || journeyPhase === 'exploring';
    if (document.body) {
        document.body.dataset.insideWalkState = active ? (journeyPhase || 'idle') : 'idle';
    }
    const currentFocusIndex = Number.isFinite(state.navState?.focusedIndex)
        ? state.navState.focusedIndex
        : state.focusedNode;
    const nextExploreCandidate = active
        ? getNextExploreCandidateForIndex(currentFocusIndex, getNextWalkCandidateForIndex, {
            requireSemantic: state.currentView === 'galaxy',
            requireOnCanvas: state.currentView === 'galaxy'
        })
        : null;
    const hasNextCandidate = active && Number.isFinite(nextExploreCandidate?.index);
    const hasWalked = (state.navState?.explorationHistoryIndices || []).length > 1;

    if (insideControls) {
        if (active) {
            insideControls.hidden = false;
            insideControls.setAttribute('aria-hidden', 'false');
            insideControls.inert = false;
        } else {
            insideControls.setAttribute('aria-hidden', 'true');
            insideControls.inert = true;
            // Defer hidden to allow CSS transition to play (0.4s - 0.5s baseline)
            setTimeout(() => {
                if (!insideControls.getAttribute('aria-hidden') === 'false') return; 
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
                    : 'Inside this neighborhood. Pick another match or return to County.'
            : 'Step into this neighborhood to follow related businesses.';
    }
    if (focusKicker) {
        focusKicker.textContent = isTransitioning
            ? 'Entering Neighborhood'
            : active
                ? hasWalked && !hasNextCandidate
                    ? 'Path Mapped'
                    : 'Inside Neighborhood'
                : state.trailDepth >= 1
                    ? 'Selected match'
                    : 'Focused Business';
    }
    if (insideNextButton) {
        const isDisabled = !hasNextCandidate || isExploring;
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
                  : 'Trail complete, no more connections to follow'
        );
    }
    if (insideMapButton) {
        insideMapButton.disabled = !canDive;
        insideMapButton.setAttribute('aria-disabled', String(!canDive));
        insideMapButton.setAttribute('aria-label', 'Project this trail onto the map');
        insideMapButton.textContent = 'Map';
    }
    if (insideCountyButton) {
        insideCountyButton.disabled = !canDive;
        insideCountyButton.setAttribute('aria-disabled', String(!canDive));
        insideCountyButton.setAttribute('aria-label', 'Exit neighborhood and return to County View');

        insideCountyButton.textContent = 'County';
    }
    if (!diveButton) return;

    // Step Inside button visibility: only shown when trailDepth >= 1 and a node is focused
    const showDiveButton = state.trailDepth >= 1 && hasFocus && !active;
    if (diveButton) diveButton.hidden = !showDiveButton;
    if (diveButton) diveButton.inert = !showDiveButton;

    const label = diveButton.querySelector('.focus-stage-dive-label');
    const copy = diveButton.querySelector('.focus-stage-dive-copy');
    diveButton.disabled = !canDive;
    diveButton.setAttribute('aria-disabled', String(!canDive));

    // A11y Polish: Update tooltip based on disabled state
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
                : 'Step Inside'
    );
    diveButton.setAttribute('aria-busy', String(isTransitioning));
    if (label) label.textContent = isTransitioning ? 'Entering...' : active ? 'Inside Neighborhood' : 'Step Inside';
    if (copy) {
        copy.textContent = isTransitioning
            ? 'Loading nearby connections.'
            : active
            ? 'Use Next Stop to continue or County to exit.'
            : 'Open the neighborhood around this business.';
    }
}

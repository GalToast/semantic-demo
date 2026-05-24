import { state } from '../state.js';
import { cleanOptionalValue, formatBusinessName, isCompactFocusStageViewport } from '../utils.js';

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
        typeof window.summarizeNeighborReason === 'function'
            ? window.summarizeNeighborReason(candidate, point, focusPoint)
            : candidate.reason;
    const cue = getShortConnectionCue(reason);
    if (!cue) return `Next: ${targetName}`;
    return `Next: ${targetName} (${cue})`;
}

export function syncSemanticDiveUi() {
    const hasFocus = state.focusedNode !== null && state.focusedNode !== undefined;
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
    const insideCountyButton = document.getElementById('btn-inside-county');
    const focusKicker = document.getElementById('focus-stage-kicker');
    const journeyCompass = document.getElementById('journey-compass');
    const journeyPhase = state.strandContinuityState?.phase;
    const isExploring = journeyPhase === 'walking' || journeyPhase === 'exploring';
    if (document.body) {
        document.body.dataset.insideWalkState = active ? (journeyPhase || 'idle') : 'idle';
    }
    const currentFocusIndex = typeof window.getCurrentTrailFocusIndex === 'function'
        ? window.getCurrentTrailFocusIndex()
        : state.focusedNode;
    const getNextExploreCandidate =
        typeof window.getNextExploreCandidateForIndex === 'function'
            ? window.getNextExploreCandidateForIndex
            : typeof window.getNextWalkCandidateForIndex === 'function'
                ? window.getNextWalkCandidateForIndex
                : null;
    const nextExploreCandidate = active && getNextExploreCandidate
        ? getNextExploreCandidate(currentFocusIndex, {
            requireSemantic: state.currentView === 'galaxy',
            requireOnCanvas: state.currentView === 'galaxy',
            commitNeighborhood: false
        }) || getNextExploreCandidate(currentFocusIndex, {
            requireSemantic: false,
            requireOnCanvas: false,
            commitNeighborhood: false
        })
        : null;
    const hasNextCandidate = active && Number.isFinite(nextExploreCandidate?.index);
    const hasWalked = (state.navState?.explorationHistoryIndices || []).length > 1;

    if (insideControls) insideControls.setAttribute('aria-hidden', active ? 'false' : 'true');
    if (insideControls) insideControls.inert = !active;
    if (insideStatus) {
        insideStatus.setAttribute('aria-hidden', active ? 'false' : 'true');
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

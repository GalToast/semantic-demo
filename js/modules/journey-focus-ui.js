import { state } from '../state.js';
import * as adapter from './journey-lifecycle-adapter.js';
import { formatBusinessName, escapeHtml, cleanOptionalValue } from './utils/dom-formatters.js';
import { isCompactFocusStageViewport } from './utils/ui-presentation.js';
import { isPointVisible } from './utils/geo-data.js';
import { truncateMicrocopy } from './journey-text-helpers.js';
import { setStrandContinuityState } from './strand-continuity.js';
import {
    summarizeNeighborReason,
    walkThreadNeighbor
} from './journey-thread-settler.js';
import {
    inspectThreadNeighbor,
    pinThreadNeighbor,
    clearThreadInspection
} from './thread-inspector.js';
import {
    getCurrentTrailFocusIndex,
    getNextWalkCandidateForIndex
} from './journey-neighborhood.js';
import { ensureCanvasNodeInteractionBindings } from './journey-canvas-interaction.js';
import { focusOnNode } from './camera-controls.js';
import { dispatchNavTransition } from './lifecycle.js';
import {
    refreshFocusSemanticOverlay,
    updateFocusSemanticOverlayPositions,
    removeFocusSemanticOverlay,
    resetFocusThreadDiagnostics
} from './journey-webgl.js';
import { isCompactLandscape, isUltraCompactPortrait } from './environment.js';
import { getRelationshipRoleLabel, normalizeRelationshipRole } from './relationship-roles.js';

export function isCondensedFocusStageViewport() {
    return state.currentView === 'galaxy' && (isCompactLandscape() || isUltraCompactPortrait());
}

function supportsHoverPreview() {
    return typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

export function hasColdDegradedSemanticFallback() {
    return typeof adapter.hasColdDegradedSemanticFallback === 'function'
        ? adapter.hasColdDegradedSemanticFallback()
        : false;
}

export function shouldUseFloatingFocusJourneyOnly() {
    return typeof adapter.shouldUseFloatingFocusJourneyOnly === 'function'
        ? adapter.shouldUseFloatingFocusJourneyOnly()
        : false;
}

export function updateFocusNeighborRail() {
    const rail = document.getElementById('focus-stage-neighbors');
    const list = document.getElementById('focus-stage-neighbor-list');
    const countEl = document.getElementById('focus-stage-neighbor-count');
    if (!rail || !list) return;

    if (!Number.isFinite(state.navState.focusedIndex) || hasColdDegradedSemanticFallback()) {
        rail.classList.remove('active');
        list.innerHTML = '';
        if (countEl) countEl.textContent = '0 visible neighbors';
        clearThreadInspection({ force: true, preserveJourney: ['exploring', 'arrived'].includes(state.strandContinuityState.phase) });
        return;
    }

    const candidates = (state.navState.threadCandidates || [])
        .filter((candidate) => candidate && candidate.index !== state.navState.focusedIndex)
        .filter((candidate) => isPointVisible(candidate.index, state.points, null, state.activeFilters))
        .slice(0, isCondensedFocusStageViewport() ? 2 : (isCompactFocusStageViewport() ? 4 : 5));

    if (!candidates.length) {
        rail.classList.remove('active');
        list.innerHTML = '<div class="empty-state">No neighboring stops found in this area.</div>';
        if (countEl) countEl.textContent = '0 visible neighbors';
        clearThreadInspection({ force: true, preserveJourney: ['exploring', 'arrived'].includes(state.strandContinuityState.phase) });
        return;
    }

    list.innerHTML = '';
    if (countEl) {
        const source = state.navState.threadSource === 'semantic' ? 'neighbors' : 'neighbors';
        countEl.textContent = `${candidates.length} visible ${source}`;
    }

    candidates.forEach((candidate, order) => {
        const point = (Number.isFinite(candidate.index) && candidate.index >= 0 && candidate.index < state.points.length)
            ? state.points[candidate.index]
            : null;
        const button = document.createElement('button');
        button.className = 'focus-stage-neighbor-pill';
        button.type = 'button';
        button.tabIndex = 0;
        button.dataset.index = String(candidate.index);
        button.dataset.role = state.navState.focusPocketRoleByIndex?.get(candidate.index) || 'trail';
        const relationshipRole = normalizeRelationshipRole(candidate.relationshipRole);
        button.dataset.relationshipRole = relationshipRole;
        button.dataset.reason = candidate.reason || 'semantic neighbor';
        const name = formatBusinessName(point?.name || 'Nearby business');
        const city = cleanOptionalValue(point?.city) || 'Montgomery County';
        const focusIdx = state.navState.focusedIndex;
        const focusPoint = (Number.isFinite(focusIdx) && focusIdx >= 0 && focusIdx < state.points.length) ? state.points[focusIdx] : null;
        const reason = summarizeNeighborReason(candidate, point, focusPoint);
        const relationshipLabel = getRelationshipRoleLabel(relationshipRole, 'rail');
        const relationshipTitle = getRelationshipRoleLabel(relationshipRole, 'title');
        const reasonLabel = isCompactFocusStageViewport()
            ? truncateMicrocopy(reason, 58)
            : `${truncateMicrocopy(reason, 72)} | ${city}`;
        button.setAttribute('aria-label', `Explore ${name}: ${relationshipTitle}. ${reason}. Use the inner buttons to inspect or pin this connection without following.`);
        button.innerHTML = `
            <span class="focus-stage-neighbor-index">${String(order + 1).padStart(2, '0')}</span>
            <span class="focus-stage-neighbor-copy">
                <span class="focus-stage-neighbor-name">${escapeHtml(name)} <span class="focus-stage-neighbor-role">${escapeHtml(relationshipLabel)}</span></span>
                <span class="focus-stage-neighbor-reason">${escapeHtml(reasonLabel)}</span>
            </span>
            <span class="focus-stage-neighbor-actions" aria-label="Strand actions">
                <button class="focus-stage-neighbor-action" type="button" data-neighbor-action="inspect" aria-label="Inspect connection">Inspect</button>
                <button class="focus-stage-neighbor-action primary" type="button" data-neighbor-action="pin" aria-label="Pin connection">Pin</button>
            </span>
        `;
        list.appendChild(button);
    });

    let hoverIntentTimer = null;
    const cancelHoverIntent = () => {
        if (hoverIntentTimer) {
            clearTimeout(hoverIntentTimer);
            hoverIntentTimer = null;
        }
    };

    list.querySelectorAll('[data-index]').forEach((button) => {
        const scheduleInspect = () => {
            cancelHoverIntent();
            hoverIntentTimer = setTimeout(() => {
                const nextIndex = Number(button.dataset.index);
                if (!Number.isFinite(nextIndex)) return;
                inspectThreadNeighbor(nextIndex);
            }, 80);
        };

        const walkToIndex = () => {
            cancelHoverIntent();
            const nextIndex = Number(button.dataset.index);
            if (!Number.isFinite(nextIndex)) return;
            walkThreadNeighbor(nextIndex, { surface: 'rail', reason: button.dataset.reason || 'nearby business relationship' });
        };
        const inspectIndex = () => {
            cancelHoverIntent();
            const nextIndex = Number(button.dataset.index);
            if (!Number.isFinite(nextIndex)) return;
            setStrandContinuityState('preview', {
                targetIndex: nextIndex,
                fromIndex: state.navState.focusedIndex,
                reason: 'rail-inspect'
            });
            inspectThreadNeighbor(nextIndex, { force: true, surface: 'rail' });
        };

        button.addEventListener('mouseenter', scheduleInspect);
        button.addEventListener('focus', scheduleInspect);
        button.addEventListener('pointerup', (event) => {
            if (supportsHoverPreview()) return;
            if (event.target?.closest?.('[data-neighbor-action]')) return;
            inspectIndex();
        });

        button.addEventListener('mouseleave', () => {
            cancelHoverIntent();
            if (!supportsHoverPreview()) return;
            clearThreadInspection();
        });

        button.addEventListener('blur', () => {
            cancelHoverIntent();
            if (!supportsHoverPreview()) return;
            clearThreadInspection();
        });

        button.onclick = (event) => {
            if (event.target?.closest?.('[data-neighbor-action]')) return;
            if (!supportsHoverPreview()) {
                inspectIndex();
                return;
            }
            walkToIndex();
        };

        button.onkeydown = (event) => {
            if (event.target?.closest?.('[data-neighbor-action]')) return;
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            if (!supportsHoverPreview()) {
                inspectIndex();
                return;
            }
            walkToIndex();
        };

        button.querySelectorAll('[data-neighbor-action]').forEach((actionButton) => {
            actionButton.addEventListener('focus', scheduleInspect);
            actionButton.onclick = (event) => {

                event.preventDefault();
                event.stopPropagation();
                const nextIndex = Number(button.dataset.index);
                if (!Number.isFinite(nextIndex)) return;
                if (actionButton.dataset.neighborAction === 'pin') {
                    pinThreadNeighbor(nextIndex, { surface: 'pinned' });
                } else {
                    setStrandContinuityState('preview', {
                        targetIndex: nextIndex,
                        fromIndex: state.navState.focusedIndex,
                        reason: 'rail-inspect'
                    });
                    inspectThreadNeighbor(nextIndex, { force: true, surface: 'rail' });
                }
            };
        });
    });

    rail.classList.add('active');
}

function updateWalkBreadcrumb(hasFocus = false) {
    const breadcrumb = document.getElementById('walk-breadcrumb');
    if (!breadcrumb) return;

    const history = (state.navState.walkHistoryIndices || [])
        .filter((index) => Number.isFinite(index) && state.points[index])
        .filter((index, order, list) => list.indexOf(index) === order || order === list.length - 1);

    if (!hasFocus || history.length <= 1) {
        breadcrumb.hidden = true;
        breadcrumb.classList.remove('visible');
        breadcrumb.innerHTML = '';
        return;
    }

    breadcrumb.hidden = false;
    breadcrumb.classList.add('visible');
    breadcrumb.innerHTML = `
        <span class="walk-breadcrumb-label">Trail</span>
        ${history.map((index, order) => {
            const point = state.points[index];
            const name = formatBusinessName(point?.name || 'Stop');
            const isCurrent = order === history.length - 1;
            return `
                <button class="walk-breadcrumb-chip${isCurrent ? ' current' : ''}" type="button"
                    data-walk-index="${index}" data-walk-order="${order}"
                    ${isCurrent ? 'aria-current="step"' : ''}
                    aria-label="${escapeHtml(isCurrent ? `Current stop: ${name}` : `Return to ${name}`)}">
                    ${escapeHtml(name)}
                </button>
            `;
        }).join('<span class="walk-breadcrumb-sep" aria-hidden="true">/</span>')}
    `;

    breadcrumb.querySelectorAll('.walk-breadcrumb-chip:not(.current)').forEach((chip) => {
        chip.onclick = () => {
            const targetIndex = Number(chip.dataset.walkIndex);
            const targetOrder = Number(chip.dataset.walkOrder);
            if (!Number.isFinite(targetIndex) || !Number.isFinite(targetOrder)) return;
            dispatchNavTransition('WALK_TO', {
                index: targetIndex,
                restoreHistoryIndices: history.slice(0, targetOrder + 1),
                appendHistory: false
            });
            focusOnNode(targetIndex, {
                fromTraversal: true,
                restoreHistory: true,
                historyMode: 'push'
            });
        };
    });
}

export function updateTraversalUi() {
    const controlsEl = document.getElementById('trail-controls');
    const contextEl = document.getElementById('trail-context');
    const prevBtn = document.getElementById('btn-prev-node');
    const nextBtn = document.getElementById('btn-next-node');
    const focusJourneyEl = document.getElementById('focus-stage-journey');
    const focusPrevBtn = document.getElementById('btn-focus-prev');
    const focusNextBtn = document.getElementById('btn-focus-next');
    const focusProgressEl = document.getElementById('focus-stage-progress');
    const focusNextEl = document.getElementById('focus-stage-next');
    const focusRouteEl = document.getElementById('focus-stage-route');
    const focusCenterBtn = document.getElementById('btn-focus-center');
    const currentFocusPoint = state.currentView === 'map'
        ? state.selectedPoint
        : (Number.isFinite(state.navState.focusedIndex) ? state.points[state.navState.focusedIndex] : null);
    const hasFocus = !!currentFocusPoint;
    const neighborCount = state.navState.trailNeighborIndices.length;
    const coldDegradedNoRail = hasColdDegradedSemanticFallback();

    if (!controlsEl || !contextEl || !prevBtn || !nextBtn || !focusJourneyEl || !focusPrevBtn || !focusNextBtn || !focusProgressEl) return;

    controlsEl.classList.toggle('active', hasFocus && (state.currentView === 'map' || !shouldUseFloatingFocusJourneyOnly()));
    contextEl.classList.toggle('active', hasFocus);
    focusJourneyEl.classList.toggle('active', hasFocus && state.currentView === 'galaxy');
    if (focusCenterBtn) focusCenterBtn.disabled = !hasFocus;
    ensureCanvasNodeInteractionBindings();

    if (!hasFocus) {
        updateWalkBreadcrumb(false);
        focusProgressEl.textContent = 'Pick a business, then explore its nearby neighbors.';
        if (focusNextEl) focusNextEl.textContent = 'Choose a nearby business to continue the path.';
        if (focusRouteEl) focusRouteEl.dataset.state = 'idle';
        updateFocusNeighborRail();
        removeFocusSemanticOverlay();
        resetFocusThreadDiagnostics('no-focus');
        return;
    }

    const canGoBack = (state.navState.walkHistoryIndices || []).length > 1;
    [prevBtn, focusPrevBtn].forEach(btn => {
        if (!btn) return;
        btn.disabled = !canGoBack;
        btn.setAttribute('aria-disabled', String(!canGoBack));
        if (!canGoBack) btn.title = 'No previous stops in this walk history';
        else btn.removeAttribute('title');
    });
    [nextBtn, focusNextBtn].forEach(btn => {
        if (!btn) return;
        const noNext = neighborCount === 0;
        btn.disabled = noNext;
        btn.setAttribute('aria-disabled', String(noNext));
        if (noNext) btn.title = 'No nearby stops to continue to';
        else btn.removeAttribute('title');
    });

    const currentName = formatBusinessName(currentFocusPoint?.name || 'this business');
    const currentCandidate = state.navState.mode === 'trail' && state.navState.trailCursor >= 0 && neighborCount > 0
        ? state.navState.threadCandidates[state.navState.trailCursor]
        : null;
    const sourceLabel = state.navState.threadSource === 'semantic'
        ? 'semantic thread'
        : 'approximate cloud projection fallback';
    const currentIndexForWalk = state.navState.focusedIndex ?? getCurrentTrailFocusIndex();
    const nextWalkCandidate = getNextWalkCandidateForIndex(currentIndexForWalk);
    const nextWalkPoint = nextWalkCandidate ? state.points[nextWalkCandidate.index] : null;
    const nextWalkName = nextWalkPoint ? formatBusinessName(nextWalkPoint.name || 'next business') : null;
    const nextWalkReason = nextWalkCandidate ? summarizeNeighborReason(nextWalkCandidate, nextWalkPoint, currentFocusPoint) : '';
    if (focusRouteEl) focusRouteEl.dataset.state = neighborCount ? (state.navState.mode === 'trail' ? 'walking' : 'ready') : 'empty';

    if (coldDegradedNoRail) {
        const queryLabel = state.semanticLaneSnapshot?.query ? `"${state.semanticLaneSnapshot.query}"` : 'this semantic trail';
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        focusPrevBtn.disabled = true;
        focusNextBtn.disabled = true;
        contextEl.textContent = `${currentName} restored from this shared link, but the ${queryLabel} did not restore while the semantic lane is degraded. Retry now to rebuild it, or use Overview to step back to the county.`;
        focusProgressEl.textContent = `Semantic trail unavailable for ${queryLabel} while the lane is degraded.`;
        if (focusNextEl) focusNextEl.textContent = 'Retry the semantic lane before continuing this trail.';
        updateWalkBreadcrumb(false);
        updateFocusNeighborRail();
        removeFocusSemanticOverlay();
        resetFocusThreadDiagnostics('cold-degraded');
        return;
    }

    if (state.trailDepth >= 1 && (state.navState.walkHistoryIndices || []).length >= 0) {
        const reason = state.navState.lastTraversalReason || currentCandidate?.reason || 'nearby business relationship';
        const walkLength = (state.navState.walkHistoryIndices || []).length;
        const stepNumber = walkLength + 1;
        contextEl.textContent = `Stop ${stepNumber}: ${currentName}. Why here: ${reason}. Source: ${sourceLabel}. Use Prev to go back or Next to continue.`;
        focusProgressEl.textContent = `Stop ${stepNumber} of ${neighborCount}`;
        if (focusNextEl) {
            focusNextEl.textContent = nextWalkName
                ? `Next: ${nextWalkName} - ${nextWalkReason.length > 40 ? nextWalkReason.slice(0, 37) + '...' : nextWalkReason}.`
                : 'This exploration has no unseen visible stop left in the current slice.';

        }
    } else if (neighborCount === 0 && state.navState.threadSource === 'semantic') {
        contextEl.textContent = `Semantic connections exist around ${currentName}, but none survive the current slice. Broaden the view to see the record-backed relationship.`;
        focusProgressEl.textContent = `No visible nearby records from ${currentName} in this slice.`;
        if (focusNextEl) focusNextEl.textContent = 'No visible next stop in this filtered slice.';
    } else {
        const fallbackLeadIn = state.semanticThreadsStatus === 'loading'
            ? 'Semantic connections are still loading, so this is a temporary cloud fallback.'
            : 'Semantic relationship data is missing here, so this trail is using the current cloud as an approximate fallback.';
        const pocketNote = state.navState.threadSource === 'semantic' && state.navState.focusPocketMeta?.active
            ? ` Focus lens is staging ${state.navState.focusPocketMeta.nodeCount} related records as a ${state.navState.focusPocketMeta.motifLabel || 'semantic constellation'} for readability; the links still come from the semantic trail.`
            : '';
        contextEl.textContent = `${neighborCount} candidate steps around ${currentName}. ${state.navState.threadSource === 'semantic' ? 'These come from record-backed relationships, and the bright spokes show the same links even when spacing stays approximate.' : fallbackLeadIn}${pocketNote} Use Prev / Next to continue.`;
        focusProgressEl.textContent = neighborCount
            ? `${neighborCount} nearby ready from ${currentName}`
            : `Start with ${currentName}, then explore the neighborhood.`;
        if (focusNextEl) {
            focusNextEl.textContent = nextWalkName
                ? `Next: ${nextWalkName} - ${nextWalkReason.length > 40 ? nextWalkReason.slice(0, 37) + '...' : nextWalkReason}.`
                : 'Choose a nearby business to continue the path.';
        }
    }

    updateFocusNeighborRail();
    updateWalkBreadcrumb(hasFocus);
    refreshFocusSemanticOverlay();
    updateFocusSemanticOverlayPositions();
}

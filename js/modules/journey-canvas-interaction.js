import { state } from '../state.js';
import { isPointVisible } from './utils/geo-data.js';
import { focusOnNode, noteSceneInteraction, releaseFocusCameraAssist } from './camera-controls.js';
import { initJourneyCanvasInteractionAdapter, isThreadCandidateVisibleOnCanvas, canvasInteractionAdapter, getNearestCanvasThreadCandidate, getCanvasFieldNodeClickRadius } from './journey-canvas-hit-test.js';
import { findNearestCanvasFieldNode } from './journey-canvas-node-picking.js';
import { clearCanvasFieldHover, setCanvasFieldHover } from './journey-canvas-hover.js';

export { initJourneyCanvasInteractionAdapter, isThreadCandidateVisibleOnCanvas };

const CANVAS_THREAD_INSPECTION_CLEAR_DELAY_MS = 5200;

export function ensureCanvasNodeInteractionBindings() {
    const canvas = state.renderer?.domElement;
    if (!canvas || canvas.dataset.threadInteractionBound === 'true') return;
    canvas.dataset.threadInteractionBound = 'true';
    let suppressNextCanvasClick = false;
    const isUiPointerTarget = (target) => !!target?.closest?.([
        'button',
        'a',
        'input',
        'textarea',
        'select',
        '.info-panel',
        '.focus-stage-card',
        '.summary-card',
        '.controls',
        '.view-toggle',
        '.journey-compass',
        '.legend-panel',
        '.weather-widget',
        '.share-toggle'
    ].join(','));
    const isPrimaryPointerRelease = (event) => !Number.isFinite(event.button) || event.button <= 0;
    const walkCanvasThreadFromPointerEvent = (event) => {
        if (state.currentView !== 'galaxy' || !Number.isFinite(state.navState.focusedIndex)) return false;
        let candidate = null;
        const stable = state.stableCanvasHover;
        const stableIsThreadNeighbor = stable
            && Number.isFinite(stable.index)
            && stable.index !== state.navState.focusedIndex
            && isPointVisible(stable.index, state.points, null, state.activeFilters)
            && (state.navState.threadCandidates || []).some((item) => item && item.index === stable.index);
        if (stableIsThreadNeighbor) {
            const stableDistance = Math.hypot((stable.screenX ?? event.clientX) - event.clientX, (stable.screenY ?? event.clientY) - event.clientY);
            if (stableDistance <= 96) {
                const threadCandidate = (state.navState.threadCandidates || []).find((item) => item && item.index === stable.index);
                candidate = {
                    ...threadCandidate,
                    ...stable,
                    reason: threadCandidate?.reason || stable.reason || 'hovered 3D related node',
                    source: stable.source || 'stable-hover'
                };
            }
        }
        if (!candidate && document.body.dataset.threadInspectSurface === 'canvas' && Number.isFinite(state.inspectedThreadIndex)) {
            candidate = (state.navState.threadCandidates || []).find((item) => item && item.index === state.inspectedThreadIndex)
                || { index: state.inspectedThreadIndex, reason: 'inspected 3D related node' };
        }
        if (!candidate) candidate = getNearestCanvasThreadCandidate(event, 96);
        if (!candidate) return false;
        event.preventDefault();
        state.lastCanvasNodePick = candidate;
        state.lastCanvasNodeFocusPick = candidate;
        canvasInteractionAdapter.walkThreadNeighbor(candidate.index, {
            fromCanvasNode: true,
            surface: 'canvas',
            reason: candidate.reason || 'direct 3D related node'
        });
        return true;
    };
    const focusCanvasFieldNodeFromPointerEvent = (event) => {
        if (state.currentView !== 'galaxy') return false;
        const stable = state.stableCanvasHover;
        const stableIsValid = stable
            && Number.isFinite(stable.index)
            && isPointVisible(stable.index, state.points, null, state.activeFilters);
        const candidate = stableIsValid
            ? { ...stable, source: stable.source || 'stable-hover' }
            : findNearestCanvasFieldNode(event);
        if (!candidate) return false;
        state.lastCanvasNodePick = candidate;
        state.lastCanvasNodeFocusPick = candidate;
        event.preventDefault();
        releaseFocusCameraAssist('field-click');
        noteSceneInteraction(state.AUTO_ROTATE_MANUAL_IDLE_MS);
        return focusOnNode(candidate.index, {
            fromCanvasNode: true,
            revealCard: true,
            historyMode: 'push'
        });
    };
    canvas.addEventListener('pointermove', (event) => {
        if (state.currentView !== 'galaxy') {
            clearCanvasFieldHover(canvas);
            return;
        }
        noteSceneInteraction(state.AUTO_ROTATE_MANUAL_IDLE_MS);
        if (Number.isFinite(state.navState.focusedIndex)) {
            const candidate = getNearestCanvasThreadCandidate(event);
            if (candidate) {
                setCanvasFieldHover(candidate, canvas);
                canvasInteractionAdapter.inspectThreadNeighbor(candidate.index, { surface: 'canvas' });
                return;
            } else if (document.body.dataset.threadInspectSurface === 'canvas') {
                canvasInteractionAdapter.scheduleCanvasThreadInspectionClear(CANVAS_THREAD_INSPECTION_CLEAR_DELAY_MS);
            }
        }
        const fieldCandidate = findNearestCanvasFieldNode(event, getCanvasFieldNodeClickRadius(event) + 4);
        setCanvasFieldHover(fieldCandidate, canvas);
    });
    canvas.addEventListener('pointerleave', () => {
        if (document.body.dataset.threadInspectSurface === 'canvas') {
            canvasInteractionAdapter.scheduleCanvasThreadInspectionClear(CANVAS_THREAD_INSPECTION_CLEAR_DELAY_MS);
        }
        clearCanvasFieldHover(canvas, { force: true });
    });
    canvas.addEventListener('pointerup', (event) => {
        if (isPrimaryPointerRelease(event) && walkCanvasThreadFromPointerEvent(event)) {
            suppressNextCanvasClick = true;
        }
    });
    canvas.addEventListener('click', (event) => {
        if (suppressNextCanvasClick) {
            suppressNextCanvasClick = false;
            event.preventDefault();
            return;
        }
        if (walkCanvasThreadFromPointerEvent(event)) return;
        focusCanvasFieldNodeFromPointerEvent(event);
    });
    if (document.documentElement.dataset.canvasHoverDocumentClearBound !== 'true') {
        document.documentElement.dataset.canvasHoverDocumentClearBound = 'true';
        document.addEventListener('pointermove', (event) => {
            const activeCanvas = state.renderer?.domElement;
            if (!activeCanvas || event.target === activeCanvas || activeCanvas.contains(event.target)) return;
            if (state.hoverHighlightIndex === -1 && !state.stableCanvasHover) return;
            clearCanvasFieldHover(activeCanvas, { force: true });
        }, true);
    }
    if (document.documentElement.dataset.threadCanvasDocumentWalkBound !== 'true') {
        document.documentElement.dataset.threadCanvasDocumentWalkBound = 'true';
        document.addEventListener('pointerup', (event) => {
            if (!isPrimaryPointerRelease(event) || isUiPointerTarget(event.target)) return;
            if (event.target === canvas) return;
            if (walkCanvasThreadFromPointerEvent(event)) return;
            focusCanvasFieldNodeFromPointerEvent(event);
        }, true);
    }
}

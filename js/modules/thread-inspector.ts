/**
 * thread-inspector.ts
 *
 * TypeScript shadow for thread-inspector.js
 * Thread/strand inspection for semantic demo.
 * Heavy module — uses `as unknown` assertions at the boundary to bridge
 * untyped JS selector returns into the TS thread-inspection surface.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { state } from '../state.js';
import type { Point } from '../../types/state.js';
import {
    getCurrentView, getNavState, getSelectedPoint,
    getStrandContinuityState,
    getPinnedThreadIndex, getInspectedThreadIndex,
    getThreadInspectorPointerInside,
    getCanvasThreadInspectionClearTimer,
    getPoints, getInspectedStrandDiagnostics
} from '../state/selectors/index.js';
import { formatBusinessName, stripTerminalPunctuation } from './utils/dom-formatters.js';
import {
    getGeometricThreadCandidates,
    getSemanticThreadCandidates,
    getThreadCandidatesForIndex
} from './journey-thread-model.js';
import { focusOnNode } from './camera-controls.js';
import { dispatchNavTransition, focusOnPoint } from './lifecycle.js';
import { syncFocusStage } from './journey.js';
import { updateJourneyCompass } from './journey-compass-controller.js';
import { showExperienceToast } from './ui-feedback.js';
import { syncSemanticDiveUi } from './semantic-dive-ui.js';
import {
    syncInspectedStrandOverlay,
    updateInspectedStrandOverlay,
    disposeInspectedStrandOverlay
} from './thread-inspector-webgl.js';
import { setInspectedStrandOverlayUpdater } from './inspected-strand-overlay-adapter.js';
import { setStrandContinuityState, clearStrandContinuityState } from './strand-continuity.js';
import { getStrandArrivalNote } from './strand-continuity.js';
import { getRelationshipRoleLabel, normalizeRelationshipRole } from './relationship-roles.js';
import {
    adapter_summarizeNeighborReason,
    adapter_getInsideRelationshipLabel,
    adapter_getCurrentTrailFocusIndex
} from './thread-inspector-adapter.js';
import { subscribe, EVENTS } from './event-bus.js';
import { truncateMicrocopy } from './journey-text-helpers.js';

export { getGeometricThreadCandidates, getSemanticThreadCandidates, getThreadCandidatesForIndex };
export { setStrandContinuityState, clearStrandContinuityState, getStrandArrivalNote };
export { syncInspectedStrandOverlay, updateInspectedStrandOverlay, disposeInspectedStrandOverlay };

setInspectedStrandOverlayUpdater(updateInspectedStrandOverlay);

export interface ThreadInspectionState {
    active: boolean;
    index: number | null;
    focusedIndex: number | null;
    focusName: string;
    targetName: string;
    reason: string;
    relationshipRole: string;
    relationshipTitle: string;
    role: string;
    source: string;
    pinned: boolean;
    journeyPhase: string;
    surface: string | null;
    title: string;
    copy: string;
    meta: string;
    strandVisual: {
        active: boolean;
        source: string;
        segmentCount: number;
        braidCount: number;
        endpointCount: number;
    };
    threadSource: string | null;
}

export interface ThreadInspectionOptions {
    force?: boolean;
    preserveJourney?: boolean;
    surface?: string | null;
    pinned?: boolean;
    fromIndex?: number | null;
    reason?: string;
    arrivalDelay?: number;
    settleDelay?: number;
    fromCanvasNode?: boolean;
    restoreHistory?: boolean;
}

subscribe(EVENTS.CAMERA_NODE_FOCUSED, (payload: Record<string, unknown>) => {
    clearThreadInspection({
        force: true,
        preserveJourney: !!(payload.options as Record<string, unknown>)?.fromTraversal
    });
});

let clearingThreadInspection = false;

function summarizeNeighborReason(candidate: any, point: any, focusPoint: any): string {
    return adapter_summarizeNeighborReason(candidate, point, focusPoint);
}

function getInsideRelationshipLabel(candidate: any, point: any, focusPoint: any): string {
    return adapter_getInsideRelationshipLabel(candidate, point, focusPoint);
}

export function getThreadInspectionState(index: number | null = getInspectedThreadIndex(), options: ThreadInspectionOptions = {}): ThreadInspectionState | null {
    const pts = getPoints();
    if (!pts || !Array.isArray(pts) || pts.length === 0) return null;
    const focusedIndex = Number.isFinite(getNavState()?.focusedIndex) ? getNavState()?.focusedIndex : null;
    const focusPoint = (focusedIndex !== null && focusedIndex >= 0 && focusedIndex < pts.length) ? pts[focusedIndex] : null;
    const candidate = Number.isFinite(index)
        ? (getNavState()?.threadCandidates as any[])?.find((item: any) => item && item.index === index)
        : null;
    const point = candidate ? pts[candidate.index] : null;
    const active = !!(candidate && point && focusPoint);
    const focusName = focusPoint ? formatBusinessName(focusPoint.name || 'this business') : '';
    const targetName = point ? formatBusinessName(point.name || 'nearby stop') : '';
    const reason = active ? summarizeNeighborReason(candidate, point, focusPoint) : '';
    const relationshipRole = active ? normalizeRelationshipRole(candidate.relationshipRole) : '';
    const relationshipTitle = active && relationshipRole
        ? getRelationshipRoleLabel(relationshipRole, 'title')
        : '';
    const role = active ? (getNavState()?.focusPocketRoleByIndex instanceof Map ? getNavState()?.focusPocketRoleByIndex.get(candidate.index) : undefined) || candidate.role || 'trail' : '';
    const source = active
        ? candidate.source === 'semantic' || getNavState()?.threadSource === 'semantic'
            ? 'semantic relationship'
            : 'current cloud fallback'
        : '';
    const title = active ? `${focusName} -> ${targetName}` : 'Select a nearby stop';
    const pinned = active && getPinnedThreadIndex() === candidate.index;
    const journeyPhase =
        active && getStrandContinuityState()?.targetIndex === candidate.index
            ? getStrandContinuityState()?.phase
            : pinned
              ? 'pinned'
              : active
                ? 'preview'
                : 'idle';
    const cleanReason = stripTerminalPunctuation(reason);
    const displayReason =
        active && reason.includes('...') ? getInsideRelationshipLabel(candidate, point, focusPoint) : cleanReason;
    const rawCopy = active
        ? journeyPhase === 'exploring'
            ? `${displayReason}. Following this connection into the next neighborhood.`
            : journeyPhase === 'arrived'
              ? `${displayReason}. You arrived through this connection; inspect another connection or backtrack to compare.`
              : pinned
                ? `${displayReason}. This connection is pinned for comparison; follow it, keep it pinned, or clear it.`
                : `${displayReason}. Preview the relationship, pin it for comparison, or follow it to the next stop.`
        : 'Click a neighbor below to preview why it belongs here, then pin or follow.';
    const copy = truncateMicrocopy(rawCopy, 220);
    const meta = active
        ? `${relationshipTitle || 'Connection'} | ${source} | ${journeyPhase} connection`
        : 'Preview connection';
    const rawSurface = pinned ? 'pinned' : (options.surface || document.body.dataset.threadInspectSurface || null);
    const surface = active && rawSurface && rawSurface !== 'idle'
        ? rawSurface
        : active
            ? 'rail'
            : rawSurface;
    return {
        active,
        index: active ? candidate.index : null,
        focusedIndex,
        focusName,
        targetName,
        reason,
        relationshipRole,
        relationshipTitle,
        role,
        source,
        pinned,
        journeyPhase,
        surface,
        title,
        copy,
        meta,
        strandVisual: {
            active: !!(getInspectedStrandDiagnostics() as any)?.active,
            source: (getInspectedStrandDiagnostics() as any)?.source || 'none',
            segmentCount: (getInspectedStrandDiagnostics() as any)?.segmentCount || 0,
            braidCount: (getInspectedStrandDiagnostics() as any)?.braidCount || 0,
            endpointCount: (getInspectedStrandDiagnostics() as any)?.endpointCount || 0
        },
        threadSource: getNavState()?.threadSource || null
    };
}

export function renderThreadInspection(index: number | null = getInspectedThreadIndex(), options: ThreadInspectionOptions = {}): ThreadInspectionState | null {
    const inspector = document.getElementById('focus-thread-inspector');
    const inspectionState = getThreadInspectionState(index, options);
    syncInspectedStrandOverlay(inspectionState as any, options);
    document.body.dataset.threadInspectSurface = inspectionState?.active
        ? inspectionState.surface || options.surface || 'rail'
        : 'idle';
    if (!inspector) return inspectionState;
    if ((inspector as any)._pointerEnterListener) {
        inspector.removeEventListener('pointerenter', (inspector as any)._pointerEnterListener);
        inspector.removeEventListener('pointerleave', (inspector as any)._pointerLeaveListener);
        delete (inspector as any)._pointerEnterListener;
        delete (inspector as any)._pointerLeaveListener;
        delete inspector.dataset.pointerGuardBound;
    }
    if (!inspector.dataset.pointerGuardBound) {
        inspector.dataset.pointerGuardBound = 'true';
        const pointerEnter = (): void => {
            state.threadInspectorPointerInside = true;
            if (getCanvasThreadInspectionClearTimer()) {
                window.clearTimeout(getCanvasThreadInspectionClearTimer()!);
                state.canvasThreadInspectionClearTimer = null;
            }
        };
        const pointerLeave = (): void => {
            state.threadInspectorPointerInside = false;
            if (document.body.dataset.threadInspectSurface === 'canvas' && getPinnedThreadIndex() === null) {
                scheduleCanvasThreadInspectionClear(1800);
            }
        };
        inspector.addEventListener('pointerenter', pointerEnter);
        inspector.addEventListener('pointerleave', pointerLeave);
    }
    if (inspectionState?.active && getCanvasThreadInspectionClearTimer()) {
        window.clearTimeout(getCanvasThreadInspectionClearTimer()!);
        state.canvasThreadInspectionClearTimer = null;
    }
    inspector.classList.toggle('active', !!inspectionState?.active);
    inspector.classList.toggle('from-canvas', !!inspectionState?.active && inspectionState.surface === 'canvas');
    inspector.classList.toggle('is-pinned', !!inspectionState?.pinned);
    if (inspectionState?.active && inspectionState.relationshipRole) {
        inspector.dataset.relationshipRole = inspectionState.relationshipRole;
    } else {
        delete inspector.dataset.relationshipRole;
    }
    inspector.setAttribute('aria-hidden', inspectionState?.active ? 'false' : 'true');
    const titleEl = document.getElementById('focus-thread-inspector-title');
    const copyEl = document.getElementById('focus-thread-inspector-copy');
    const metaEl = document.getElementById('focus-thread-inspector-meta');
    const pinBtn = document.getElementById('btn-thread-pin') as HTMLButtonElement | null;
    const followBtn = document.getElementById('btn-thread-follow') as HTMLButtonElement | null;
    const clearBtn = document.getElementById('btn-thread-clear') as HTMLButtonElement | null;
    const isMobile = window.innerWidth <= 768;
    if (titleEl) titleEl.textContent = inspectionState?.title ?? null;
    if (copyEl) copyEl.textContent = inspectionState?.copy ?? null;
    if (metaEl) metaEl.textContent = inspectionState?.meta ?? null;
    if (pinBtn) {
        pinBtn.disabled = !inspectionState?.active;
        pinBtn.textContent = inspectionState?.pinned
            ? (isMobile ? 'Unpin' : 'Unpin Connection')
            : (isMobile ? 'Pin' : 'Pin Connection');
        pinBtn.setAttribute('aria-pressed', String(!!inspectionState?.pinned));
    }
    if (followBtn) {
        const followTargetsCurrent =
            !!inspectionState?.active &&
            Number.isFinite(inspectionState?.index) &&
            inspectionState?.index === getNavState()?.focusedIndex;
        followBtn.disabled = !inspectionState?.active || !!followTargetsCurrent || inspectionState?.journeyPhase === 'exploring';
        followBtn.setAttribute('aria-disabled', String(followBtn.disabled));
        followBtn.setAttribute('aria-busy', String(inspectionState?.journeyPhase === 'exploring'));
        followBtn.textContent = inspectionState?.journeyPhase === 'exploring'
            ? 'Following'
            : followTargetsCurrent
              ? (isMobile ? 'Current' : 'Current Stop')
              : (isMobile ? 'Follow' : 'Follow Connection');
        followBtn.setAttribute(
            'aria-label',
            inspectionState?.journeyPhase === 'exploring'
                ? 'Following this connection'
                : followTargetsCurrent
                  ? 'This connection is the current path stop'
                  : 'Follow this connection as the next path stop'
        );
    }
    if (clearBtn) {
        clearBtn.disabled = !inspectionState?.active && getPinnedThreadIndex() === null;
        clearBtn.setAttribute('aria-disabled', String(clearBtn.disabled));
        clearBtn.setAttribute(
            'aria-label',
            getPinnedThreadIndex() !== null ? 'Clear pinned connection' : 'Clear connection preview'
        );
    }
    document.querySelectorAll<HTMLElement>('.focus-stage-neighbor-pill.is-inspected')
        .forEach((item) => item.classList.remove('is-inspected'));
    document.querySelectorAll<HTMLElement>('.focus-stage-neighbor-pill.is-pinned')
        .forEach((item) => item.classList.remove('is-pinned'));
    document.querySelectorAll<HTMLElement>('.focus-stage-neighbor-pill.is-exploring')
        .forEach((item) => item.classList.remove('is-exploring'));
    if (inspectionState?.active) {
        const railItem = document.querySelector<HTMLElement>(`.focus-stage-neighbor-pill[data-index="${inspectionState.index}"]`);
        railItem?.classList.add('is-inspected');
        railItem?.classList.toggle('is-pinned', inspectionState.pinned);
        railItem?.classList.toggle('is-exploring', inspectionState.journeyPhase === 'exploring');
    }
    return inspectionState;
}

export function inspectThreadNeighbor(index: number, options: ThreadInspectionOptions = {}): ThreadInspectionState | null {
    if (getPinnedThreadIndex() !== null && !options.force) {
        return renderThreadInspection(getPinnedThreadIndex(), { surface: 'pinned', pinned: true });
    }
    state.inspectedThreadIndex = Number.isFinite(index) ? index : null;
    if (Number.isFinite(getInspectedThreadIndex()) && !options.preserveJourney) {
        setStrandContinuityState('preview', {
            targetIndex: getInspectedThreadIndex(),
            fromIndex: getNavState()?.focusedIndex,
            reason: options.surface || 'inspect'
        });
    }
    return renderThreadInspection(getInspectedThreadIndex(), options);
}

export function pinThreadNeighbor(index: number, options: ThreadInspectionOptions = {}): ThreadInspectionState | null {
    if (!Number.isFinite(index)) return clearThreadInspection({ force: true });
    if (getCanvasThreadInspectionClearTimer()) {
        window.clearTimeout(getCanvasThreadInspectionClearTimer()!);
        state.canvasThreadInspectionClearTimer = null;
    }
    state.pinnedThreadIndex = index;
    state.inspectedThreadIndex = index;
    setStrandContinuityState('pinned', {
        targetIndex: index,
        fromIndex: getNavState()?.focusedIndex,
        reason: options.reason || 'pin'
    });
    const inspectionState = renderThreadInspection(index, { ...options, surface: 'pinned', pinned: true });
    syncSemanticDiveUi();
    return inspectionState;
}

export function unpinThreadInspection(): ThreadInspectionState | null {
    if (getCanvasThreadInspectionClearTimer()) {
        window.clearTimeout(getCanvasThreadInspectionClearTimer()!);
        state.canvasThreadInspectionClearTimer = null;
    }
    state.pinnedThreadIndex = null;
    state.inspectedThreadIndex = null;
    clearStrandContinuityState('unpin');
    const inspectionState = renderThreadInspection(null, { surface: 'idle', force: true });
    syncSemanticDiveUi();
    return inspectionState;
}

export function scheduleCanvasThreadInspectionClear(delay: number = 1800): void {
    if (getCanvasThreadInspectionClearTimer()) window.clearTimeout(getCanvasThreadInspectionClearTimer()!);
    state.canvasThreadInspectionClearTimer = window.setTimeout(() => {
        state.canvasThreadInspectionClearTimer = null;
        if (getThreadInspectorPointerInside() || getPinnedThreadIndex() !== null) return;
        if (document.body.dataset.threadInspectSurface === 'canvas') {
            clearThreadInspection();
        }
    }, delay);
}

export function clearThreadInspection(options: ThreadInspectionOptions = {}): ThreadInspectionState | null {
    if (clearingThreadInspection) {
        state.pinnedThreadIndex = null;
        state.inspectedThreadIndex = null;
        state.threadInspectorPointerInside = false;
        return renderThreadInspection(null, { surface: 'idle' });
    }
    clearingThreadInspection = true;
    try {
    if (options.force && getCanvasThreadInspectionClearTimer()) {
        window.clearTimeout(getCanvasThreadInspectionClearTimer()!);
        state.canvasThreadInspectionClearTimer = null;
    }
    if (options.force) {
        state.pinnedThreadIndex = null;
        state.inspectedThreadIndex = null;
        state.threadInspectorPointerInside = false;
        syncFocusStage(getSelectedPoint());
        syncSemanticDiveUi();
        if (!options.preserveJourney) clearStrandContinuityState('force-clear');
    }
    if (getPinnedThreadIndex() !== null && !options.force) {
        return renderThreadInspection(getPinnedThreadIndex(), { surface: 'pinned', pinned: true });
    }
    if (!options.preserveJourney && getStrandContinuityState()?.phase === 'preview') {
        clearStrandContinuityState('preview-clear');
    }
    state.inspectedThreadIndex = null;
    state.threadInspectorPointerInside = false;
    return renderThreadInspection(null, { surface: 'idle' });
    } finally {
        clearingThreadInspection = false;
    }
}

export function exploreThreadNeighbor(index: number, options: ThreadInspectionOptions = {}): { targetIndex: number; fromIndex: number | null; reason: string } | null {
    const pts = getPoints();
    if (!pts || !Array.isArray(pts) || pts.length === 0) return null;
    if (!Number.isFinite(index)) return null;
    const fromIndex = Number.isFinite(options.fromIndex)
        ? options.fromIndex
        : adapter_getCurrentTrailFocusIndex() !== null
          ? adapter_getCurrentTrailFocusIndex()
          : null;
    const candidate = (getNavState()?.threadCandidates as any[])?.find((item: any) => item && item.index === index);
    const targetPoint = (Number.isFinite(index) && index >= 0 && index < pts.length) ? pts[index] : null;
    if (!targetPoint) return null;
    const reason =
        summarizeNeighborReason(
            candidate || {},
            targetPoint,
            (Number.isFinite(fromIndex) && fromIndex! >= 0 && fromIndex! < pts.length) ? pts[fromIndex!] : null
        ) ||
        candidate?.reason ||
        options.reason ||
        'nearby business relationship';
    const strandState = getStrandContinuityState();
    if (Number.isFinite(strandState?.arrivalTimeoutId)) {
        window.clearTimeout(strandState!.arrivalTimeoutId);
        strandState!.arrivalTimeoutId = undefined;
    }
    if (Number.isFinite(strandState?.settleTimeoutId)) {
        window.clearTimeout(strandState!.settleTimeoutId);
        strandState!.settleTimeoutId = undefined;
    }
    state.pinnedThreadIndex = null;
    state.inspectedThreadIndex = index;
    setStrandContinuityState('exploring', { targetIndex: index, fromIndex, reason });
    dispatchNavTransition('WALK_TO', { index, fromIndex, appendHistory: !options.restoreHistory } as any);
    renderThreadInspection(index, { force: true, surface: options.surface || 'explore' });
    state.navState.lastTraversalReason = reason;
    if (getCurrentView() === 'map') {
        focusOnPoint(targetPoint, {
            fromTraversal: true,
            appendHistory: !options.restoreHistory,
            restoreHistory: !!options.restoreHistory,
            fromIndex
        });
    } else {
        focusOnNode(index, {
            fromCanvasNode: !!options.fromCanvasNode,
            fromTraversal: true,
            appendHistory: !options.restoreHistory,
            restoreHistory: !!options.restoreHistory,
            fromIndex
        });
    }
    showExperienceToast(
        'Following connection',
        `Opening the connection to ${formatBusinessName(targetPoint?.name || 'the next stop')}.`
    );
    const arrivalDelay = options.arrivalDelay || 820;
    const capturedIndex = index;
    const capturedFromIndex = fromIndex;
    const capturedReason = reason;
    const arrivalTid = window.setTimeout(() => {
        const s2 = getStrandContinuityState();
        if (s2?.phase === 'exploring' && s2?.targetIndex === capturedIndex) {
            setStrandContinuityState('arrived', { targetIndex: capturedIndex, fromIndex: capturedFromIndex, reason: capturedReason });
            const pointAtArrival = (Number.isFinite(capturedIndex) && capturedIndex >= 0 && capturedIndex < pts.length) ? pts[capturedIndex] : null;
            syncFocusStage(pointAtArrival || getSelectedPoint() || null);
            updateJourneyCompass();
        }
    }, arrivalDelay);
    getStrandContinuityState().arrivalTimeoutId = arrivalTid;
    const settleDelay = options.settleDelay || 5200;
    const settleTid = window.setTimeout(() => {
        const s3 = getStrandContinuityState();
        if (s3?.phase === 'arrived' && s3?.targetIndex === capturedIndex) {
            clearStrandContinuityState('arrival-settled');
            const pointAtSettle = (Number.isFinite(capturedIndex) && capturedIndex >= 0 && capturedIndex < pts.length) ? pts[capturedIndex] : null;
            syncFocusStage(pointAtSettle || getSelectedPoint() || null);
        }
    }, settleDelay);
    getStrandContinuityState().settleTimeoutId = settleTid;
    return { targetIndex: index, fromIndex, reason };
}

import { registerDiagnosticProbe } from './diagnostic-adapter.js';

registerDiagnosticProbe('_ti', {
    getSemanticThreadCandidates,
    getGeometricThreadCandidates,
    getThreadCandidatesForIndex,
    setStrandContinuityState,
    clearStrandContinuityState,
    getStrandArrivalNote,
    getThreadInspectionState,
    renderThreadInspection,
    inspectThreadNeighbor,
    pinThreadNeighbor,
    unpinThreadInspection,
    scheduleCanvasThreadInspectionClear,
    clearThreadInspection,
    exploreThreadNeighbor,
    syncInspectedStrandOverlay,
    updateInspectedStrandOverlay,
    disposeInspectedStrandOverlay
});

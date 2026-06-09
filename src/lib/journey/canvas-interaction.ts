/**
 * @lib/journey/canvas-interaction.ts — Canvas pointer event bindings for thread walking and field-node focus
 *
 * Port of js/modules/journey-canvas-interaction.js
 *
 * Re-exports core adapters from extracted modules and owns canvas DOM event binding lifecycle.
 */
import { state } from '@legacy/state.js';
import { isPointVisible } from '@lib/utils/geo-data';
import type { ActiveFilters, GeoPoint } from '@lib/utils/geo-data';
import _cameraControls from '@legacy/modules/camera-controls.js';
const {
  focusOnNode,
  noteSceneInteraction,
  releaseFocusCameraAssist,
} = _cameraControls as {
  focusOnNode: (index: number, options: Record<string, unknown>) => boolean;
  noteSceneInteraction: (idleMs?: number) => void;
  releaseFocusCameraAssist: (reason?: string) => void;
};
import {
  initJourneyCanvasInteractionAdapter,
  isThreadCandidateVisibleOnCanvas,
  canvasInteractionAdapter,
  getNearestCanvasThreadCandidate,
  getCanvasFieldNodeClickRadius
} from './canvas-hit-test';
import { findNearestCanvasFieldNode } from './canvas-node-picking';
import { clearCanvasFieldHover, setCanvasFieldHover } from './canvas-hover';
import type { HoverCandidate } from './canvas-hover';

export { initJourneyCanvasInteractionAdapter, isThreadCandidateVisibleOnCanvas };

const CANVAS_THREAD_INSPECTION_CLEAR_DELAY_MS = 5200;
const DEFAULT_ACTIVE_FILTERS: ActiveFilters = {
  status: 'all',
  city: 'all',
  website: false,
  email: false,
  geocoded: false,
};

/** AbortController shared by canvas interaction listeners for clean teardown. */
let _canvasInteractionAbort: AbortController | null = null;

export function ensureCanvasNodeInteractionBindings(): void {
  const lState = state as Record<string, unknown>;
  const renderer = lState.renderer as { domElement?: HTMLCanvasElement } | undefined;
  const canvas = renderer?.domElement;
  if (!canvas || canvas.dataset.threadInteractionBound === 'true') return;
  canvas.dataset.threadInteractionBound = 'true';

  _canvasInteractionAbort = new AbortController();
  const signal = _canvasInteractionAbort.signal;

  let suppressNextCanvasClick = false;
  const getActiveFilters = (): ActiveFilters =>
    (state as unknown as { activeFilters?: ActiveFilters }).activeFilters ?? DEFAULT_ACTIVE_FILTERS;
  const getPoints = (): GeoPoint[] => ((state as unknown as { points?: GeoPoint[] }).points ?? []);

  const isUiPointerTarget = (target: EventTarget | null): boolean =>
    !!(target as HTMLElement)?.closest?.([
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

  const isPrimaryPointerRelease = (event: PointerEvent): boolean =>
    !Number.isFinite(event.button) || event.button <= 0;

  const walkCanvasThreadFromPointerEvent = (event: PointerEvent): boolean => {
    if (state.currentView !== 'galaxy' || !Number.isFinite((state.navState as Record<string, unknown>).focusedIndex as number)) return false;
    let candidate: ReturnType<typeof getNearestCanvasThreadCandidate> = null;
    const stable = state.stableCanvasHover as { index: number; screenX: number; screenY: number; source?: string; reason?: string; [key: string]: unknown } | null;
    const stableIsThreadNeighbor =
      !!(stable
        && Number.isFinite(stable.index)
        && stable.index !== (state.navState as Record<string, unknown>).focusedIndex
        && isPointVisible(stable.index, getPoints(), null, getActiveFilters())
        && ((state.navState as Record<string, unknown>).threadCandidates as Array<Record<string, unknown>> || []).some((item) => item && item.index === stable.index));
    if (stableIsThreadNeighbor) {
      const stableDistance = Math.hypot(
        (stable.screenX ?? event.clientX) - event.clientX,
        (stable.screenY ?? event.clientY) - event.clientY
      );
      if (stableDistance <= 96) {
        const threadCandidate = ((state.navState as Record<string, unknown>).threadCandidates as Array<Record<string, unknown>> || []).find(
          (item) => item && item.index === stable.index
        );
        candidate = {
          ...(threadCandidate ?? {}),
          ...stable,
          index: stable.index,
          reason: (threadCandidate?.reason as string) || stable.reason || 'hovered 3D related node',
          source: stable.source || 'stable-hover',
          screenX: stable.screenX,
          screenY: stable.screenY,
          inViewport: true,
          canvasReachable: true,
          distanceFromFocus: null
        } as ReturnType<typeof getNearestCanvasThreadCandidate>;
      }
    }
    if (!candidate && (document.body.dataset.threadInspectSurface === 'canvas') && Number.isFinite((state as unknown as { inspectedThreadIndex?: number }).inspectedThreadIndex)) {
      const ti = (state as unknown as { inspectedThreadIndex?: number }).inspectedThreadIndex!;
      const inspectedCandidate = ((state.navState as Record<string, unknown>).threadCandidates as Array<Record<string, unknown>> || []).find(
        (item) => item && item.index === ti
      );
      candidate = {
        ...(inspectedCandidate ?? {}),
        index: ti,
        reason: (inspectedCandidate?.reason as string) || 'inspected 3D related node',
        source: (inspectedCandidate?.source as string) || 'inspection',
        screenX: event.clientX,
        screenY: event.clientY,
        inViewport: true,
        canvasReachable: true,
        distanceFromFocus: null,
      };
    }
    if (!candidate) candidate = getNearestCanvasThreadCandidate(event, 96);
    if (!candidate) return false;
    event.preventDefault();
    (state as unknown as { lastCanvasNodePick?: unknown }).lastCanvasNodePick = candidate;
    (state as unknown as { lastCanvasNodeFocusPick?: unknown }).lastCanvasNodeFocusPick = candidate;
    canvasInteractionAdapter.walkThreadNeighbor(candidate.index, {
      fromCanvasNode: true,
      surface: 'canvas',
      reason: candidate.reason || 'direct 3D related node'
    });
    return true;
  };

  const focusCanvasFieldNodeFromPointerEvent = (event: PointerEvent): boolean => {
    if (state.currentView !== 'galaxy') return false;
    const stable = state.stableCanvasHover as { index: number; screenX: number; screenY: number; source?: string; [key: string]: unknown } | null;
    const stableIsValid = !!(stable
      && Number.isFinite(stable.index)
      && isPointVisible(stable.index, getPoints(), null, getActiveFilters()));
    const candidate = stableIsValid
      ? { ...stable, index: stable!.index, source: stable!.source || 'stable-hover' }
      : findNearestCanvasFieldNode(event);
    if (!candidate) return false;
    (state as unknown as { lastCanvasNodePick?: unknown }).lastCanvasNodePick = candidate;
    (state as unknown as { lastCanvasNodeFocusPick?: unknown }).lastCanvasNodeFocusPick = candidate;
    event.preventDefault();
    releaseFocusCameraAssist('field-click');
    noteSceneInteraction((state as unknown as { AUTO_ROTATE_MANUAL_IDLE_MS?: number }).AUTO_ROTATE_MANUAL_IDLE_MS ?? 3000);
    return focusOnNode(candidate.index, {
      fromCanvasNode: true,
      revealCard: true,
      historyMode: 'push'
    });
  };

  canvas.addEventListener('pointermove', (event: PointerEvent) => {
    if (state.currentView !== 'galaxy') {
      clearCanvasFieldHover(canvas);
      return;
    }
    noteSceneInteraction((state as unknown as { AUTO_ROTATE_MANUAL_IDLE_MS?: number }).AUTO_ROTATE_MANUAL_IDLE_MS ?? 3000);
    if (Number.isFinite((state.navState as Record<string, unknown>).focusedIndex as number)) {
      const candidate = getNearestCanvasThreadCandidate(event);
      if (candidate) {
        setCanvasFieldHover(candidate as HoverCandidate, canvas);
        canvasInteractionAdapter.inspectThreadNeighbor(candidate.index, { surface: 'canvas' });
        return;
      } else if (document.body.dataset.threadInspectSurface === 'canvas') {
        canvasInteractionAdapter.scheduleCanvasThreadInspectionClear(CANVAS_THREAD_INSPECTION_CLEAR_DELAY_MS);
      }
    }
    const fieldCandidate = findNearestCanvasFieldNode(event, getCanvasFieldNodeClickRadius(event) + 4);
    setCanvasFieldHover(fieldCandidate, canvas);
  }, { signal });

  canvas.addEventListener('pointerleave', () => {
    if (document.body.dataset.threadInspectSurface === 'canvas') {
      canvasInteractionAdapter.scheduleCanvasThreadInspectionClear(CANVAS_THREAD_INSPECTION_CLEAR_DELAY_MS);
    }
    clearCanvasFieldHover(canvas, { force: true });
  }, { signal });

  canvas.addEventListener('pointerup', (event: PointerEvent) => {
    if (isPrimaryPointerRelease(event) && walkCanvasThreadFromPointerEvent(event)) {
      suppressNextCanvasClick = true;
    }
  }, { signal });

  canvas.addEventListener('click', (event: MouseEvent) => {
    if (suppressNextCanvasClick) {
      suppressNextCanvasClick = false;
      event.preventDefault();
      return;
    }
    if (walkCanvasThreadFromPointerEvent(event as unknown as PointerEvent)) return;
    focusCanvasFieldNodeFromPointerEvent(event as unknown as PointerEvent);
  }, { signal });

  if (document.documentElement.dataset.canvasHoverDocumentClearBound !== 'true') {
    document.documentElement.dataset.canvasHoverDocumentClearBound = 'true';
    document.addEventListener('pointermove', (event: PointerEvent) => {
      const activeCanvas = ((state as Record<string, unknown>).renderer as { domElement?: HTMLCanvasElement } | undefined)?.domElement;
      if (!activeCanvas || event.target === activeCanvas || activeCanvas.contains(event.target as Node)) return;
      if (state.hoverHighlightIndex === -1 && !state.stableCanvasHover) return;
      clearCanvasFieldHover(activeCanvas, { force: true });
    }, { capture: true, signal });
  }

  if (document.documentElement.dataset.threadCanvasDocumentWalkBound !== 'true') {
    document.documentElement.dataset.threadCanvasDocumentWalkBound = 'true';
    document.addEventListener('pointerup', (event: PointerEvent) => {
      if (!isPrimaryPointerRelease(event) || isUiPointerTarget(event.target)) return;
      if (event.target === canvas) return;
      if (walkCanvasThreadFromPointerEvent(event)) return;
      focusCanvasFieldNodeFromPointerEvent(event);
    }, { capture: true, signal });
  }
}

export function removeCanvasNodeInteractionBindings(): void {
  if (_canvasInteractionAbort) {
    _canvasInteractionAbort.abort();
    _canvasInteractionAbort = null;
  }
  const lState = state as Record<string, unknown>;
  const renderer = lState.renderer as { domElement?: HTMLCanvasElement } | undefined;
  const canvas = renderer?.domElement;
  if (canvas) {
    canvas.dataset.threadInteractionBound = 'false';
  }
  delete document.documentElement.dataset.canvasHoverDocumentClearBound;
  delete document.documentElement.dataset.threadCanvasDocumentWalkBound;
}

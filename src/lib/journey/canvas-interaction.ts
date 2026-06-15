/**
 * @lib/journey/canvas-interaction.ts — Canvas pointer event bindings for thread walking and field-node focus
 *
 * Port of js/modules/journey-canvas-interaction.js
 *
 * Re-exports core adapters from extracted modules and owns canvas DOM event binding lifecycle.
 */
import { appState } from '@lib/state/app.svelte';
import { isPointVisible } from '@lib/utils/geo-data';
import type { ActiveFilters, GeoPoint } from '@lib/utils/geo-data';
import {
  focusOnNode,
  noteSceneInteraction,
  releaseFocusCameraAssist,
} from '@lib/engine/camera-controls';
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
  const canvas = appState.renderer?.domElement;
  if (!canvas || canvas.dataset.threadInteractionBound === 'true') return;
  canvas.dataset.threadInteractionBound = 'true';

  _canvasInteractionAbort = new AbortController();
  const signal = _canvasInteractionAbort.signal;

  canvas.addEventListener('pointermove', (ev) => {
    const pointer = ev as PointerEvent;
    const radius = getCanvasFieldNodeClickRadius(pointer);
    const candidate = findNearestCanvasFieldNode(pointer, radius);
    if (candidate?.index != null && Number.isFinite(candidate.index)) {
      setCanvasFieldHover({
        index: candidate.index,
        screenX: candidate.screenX,
        screenY: candidate.screenY,
        source: candidate.source,
        reason: candidate.source || '',
      } satisfies HoverCandidate, canvas);
      noteSceneInteraction();
      releaseFocusCameraAssist('canvasHover');
      if (isThreadCandidateVisibleOnCanvas(candidate.index)) {
        const { walkThreadNeighbor, inspectThreadNeighbor, summarizeNeighborReason } = canvasInteractionAdapter;
        const threadOk = walkThreadNeighbor(candidate.index, { force: true });
        if (threadOk) {
          inspectThreadNeighbor(candidate.index);
        }
      }
    } else {
      clearCanvasFieldHover(canvas);
    }
  }, { signal, passive: true });

  canvas.addEventListener('pointerout', () => {
    clearCanvasFieldHover(canvas);
  }, { signal, passive: true });

  canvas.addEventListener('click', (ev) => {
    const pointer = ev as PointerEvent;
    const radius = getCanvasFieldNodeClickRadius(pointer);
    const candidate = findNearestCanvasFieldNode(pointer, radius);
    if (candidate?.index != null && Number.isFinite(candidate.index)) {
      const { walkThreadNeighbor, summarizeNeighborReason } = canvasInteractionAdapter;
      const threadOk = walkThreadNeighbor(candidate.index, { force: true });
      if (threadOk) {
        const points = appState.points as unknown as GeoPoint[];
        const candidatePoint = points[candidate.index] ?? null;
        const focusIndex = appState.navState?.focusedIndex;
        const focusPoint = (focusIndex != null && focusIndex >= 0 && focusIndex < points.length)
          ? points[focusIndex]
          : null;
        const reason = summarizeNeighborReason(
          candidate as unknown as Record<string, unknown>,
          candidatePoint as unknown as Record<string, unknown> | null,
          focusPoint as unknown as Record<string, unknown> | null,
        );
        setCanvasFieldHover({
          index: candidate.index,
          screenX: candidate.screenX,
          screenY: candidate.screenY,
          source: candidate.source,
          reason: reason || candidate.source || '',
        } satisfies HoverCandidate, canvas);
        noteSceneInteraction();
        releaseFocusCameraAssist('canvasHover');
        focusOnNode(candidate.index);
      }
    }
    ev.preventDefault();
  }, { signal });
}

export function disposeCanvasNodeInteractionBindings(): void {
  if (_canvasInteractionAbort) {
    _canvasInteractionAbort.abort();
    _canvasInteractionAbort = null;
  }
  const canvas = appState.renderer?.domElement;
  if (canvas) {
    delete canvas.dataset.threadInteractionBound;
  }
}

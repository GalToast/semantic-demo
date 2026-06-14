export * from './journey-thread-settler.ts';
import { summarizeNeighborReason as _summarizeNeighborReason, getInsideRelationshipLabel as _getInsideRelationshipLabel } from './journey-thread-settler.ts';
import { state } from '../../js/state.js';

export function summarizeNeighborReason(candidate, point, focusPoint) {
  if (!candidate || Object.keys(candidate).length === 0) {
    if (state?.navState?.threadSource === 'semantic') return 'Linked stop';
  }
  return _summarizeNeighborReason(candidate, point, focusPoint);
}

export function getInsideRelationshipLabel(candidate, point, focusPoint) {
  return _getInsideRelationshipLabel(candidate, point, focusPoint);
}

export function initJourneyTimerAdapter() {}

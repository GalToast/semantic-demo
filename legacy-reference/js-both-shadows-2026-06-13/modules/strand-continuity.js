export * from './strand-continuity.ts';
import { getStrandContinuityManager } from './strand-continuity.ts';

export function setStrandContinuityState(phase, options = {}) {
  return getStrandContinuityManager().setPhase(phase, options);
}

export function clearStrandContinuityState(reason = 'clear') {
  return getStrandContinuityManager().clear(reason);
}

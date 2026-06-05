/**
 * @lib/utils/index.ts — Barrel export for all utility modules
 */

export { seededUnit } from './seeded-random';
export {
  parseFiniteNumber,
  easeInOutSine,
  easeInOutCubic,
  quadraticBezierComponent,
  easeOutBack,
  easeOutQuint,
  clampNumber
} from './math-easing';
export {
  escapeHtml,
  cleanPublicNoteText,
  isPrivateResearchNote,
  sanitizePublicFacingNote,
  getBusinessNamePresentation,
  formatBusinessName,
  cleanOptionalValue,
  stripTerminalPunctuation,
  getPublicRecordStatusLabel
} from './dom-formatters';
export type { BusinessNamePresentation } from './dom-formatters';
export {
  registerTimer,
  clearTimer,
  clearAllTimers,
  setTrackedTimeout,
  setTrackedInterval,
  debounceRAF
} from './timer-utils';
export {
  getViewportSize,
  isMobileViewport,
  isMobile,
  isCompactFocusStage,
  prefersReducedMotion,
  hasCoarsePointer,
  isCompactLandscape,
  isUltraCompactPortrait,
  getDevicePixelRatio,
  getPanelSurface,
  isMapSummarySurface,
  isSemanticDiveSurface,
  matchMedia,
  getLocation,
  getCurrentUrl,
  getComputedStyle,
  requestAnimationFrame,
  cancelAnimationFrame
} from './environment';
export {
  isDebugProbesEnabled,
  registerDiagnosticProbe,
  debugWarn
} from './diagnostic-adapter';
export {
  FOCUS_PANEL_MODE,
  getFocusPanelMode,
  setFocusPanelMode
} from './focus-panel-mode';
export type { FocusPanelMode } from './focus-panel-mode';
export {
  StrandContinuityManager,
  getStrandContinuityManager,
  resetStrandContinuityManager
} from './strand-continuity';
export type { StrandContinuityConfig } from './strand-continuity';

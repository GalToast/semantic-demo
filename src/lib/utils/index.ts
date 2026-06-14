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
export {
  pointHasGeocode,
  normalizeCityForFilter,
  isPointVisible,
  calculateSignalScore,
  highlightMatch,
  tokenizeSearchText as tokenizeSearchTextLegacy,
  countTokenMatches as countTokenMatchesLegacy,
  computeOverviewScatterOffsets
} from './geo-data';
export type { ScatterOffset, ActiveFilters, GeoPoint, TokenMatchResult as GeoTokenMatchResult } from './geo-data';
export {
  updateDocumentMeta,
  describeCluster,
  isCompactFocusStageViewport,
  isCompactMapViewport,
  isCompactSearchViewport,
  detectStaticDevPHP,
  allowsStaticDevFallback,
  shouldLogStaticDevFallback,
  updateTime,
  getThreadPulseOpacity,
  getFieldStepSyncLift,
  getZoomBlend,
  getGraphPresentationState,
  getGraphPresentationProfile,
  getThreadCategoryColor
} from './ui-presentation';
export type { GraphPresentationState, GraphPresentationProfile } from './ui-presentation';
export { DATA_COLUMNS } from './data-schema';
export type { RawDatum, DataColumnKey } from './data-schema';
export {
  normalizeSlugName,
  mapRawRecordToPoint,
  extractRawCoordinates,
} from './data-mapper';
export type { MappedPoint, RawCoordinates } from './data-mapper';
export { el, setChildren } from './dom-builder';
export type { DomChild, DomEventHandler, DomAttributes } from './dom-builder';
export { FOCUSABLE_SELECTORS, setupFocusTrap, releaseFocusTrap } from './focus-trap';
export { bindFocusTrapObserver, disposeFocusTrapBindings } from './focus-trap-bindings';
export {
  createSporeTexture,
  createFocusRingTexture,
  createFocusNextCueTexture,
} from './three-textures';
export {
  setWebGLContextRestoreHandler,
  restoreWebGLContext,
} from './webgl-restore-adapter';

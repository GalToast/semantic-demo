/**
 * @lib/utils/index.ts — Barrel export for all utility modules
 */

export { seededUnit } from './seeded-random'
export {
    parseFiniteNumber,
    easeInOutSine,
    easeInOutCubic,
    quadraticBezierComponent,
    easeOutBack,
    easeOutQuint,
    clampNumber
} from './math-easing'
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
} from './dom-formatters'
export type { BusinessNamePresentation } from './dom-formatters'
export {
    registerTimer,
    clearTimer,
    clearAllTimers,
    setTrackedTimeout,
    setTrackedInterval,
    debounceRAF
} from './timer-utils'
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
} from './environment'
// ── Diagnostic probes (inlined from diagnostic-adapter.ts) ─────────────────

declare global {
    interface Window {
        __DEBUG_PROBES__?: boolean
    }
}

function isDebugProbesEnabled(): boolean {
    if (typeof window === 'undefined') return false
    if (typeof window.__DEBUG_PROBES__ !== 'undefined') return !!window.__DEBUG_PROBES__

    const hostname = window.location?.hostname ?? ''
    if (!hostname) return true
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
    return isLocal
}

function registerDiagnosticProbe(key: string, probe: object | (() => void)): void {
    if (!isDebugProbesEnabled()) return
    if (typeof window === 'undefined') return
    ;(window as unknown as Record<string, unknown>)[key] = probe
}

export { isDebugProbesEnabled, registerDiagnosticProbe }

export { debugWarn } from './debug'
export { FOCUS_PANEL_MODE, getFocusPanelMode, setFocusPanelMode } from './focus-panel-mode'
export type { FocusPanelMode } from './focus-panel-mode'
export { StrandContinuityManager, getStrandContinuityManager, resetStrandContinuityManager } from './strand-continuity'
export type { StrandContinuityConfig } from './strand-continuity'
export {
    pointHasGeocode,
    normalizeCityForFilter,
    isPointVisible,
    calculateSignalScore,
    highlightMatch,
    computeOverviewScatterOffsets
} from './geo-data'
export {
    tokenizeSearchText as tokenizeSearchTextLegacy,
    countTokenMatches as countTokenMatchesLegacy
} from '@lib/search/tokenizer'
export type { ScatterOffset, ActiveFilters, GeoPoint, TokenMatchResult as GeoTokenMatchResult } from './geo-data'
export {
    updateDocumentMeta,
    describeCluster,
    isCompactFocusStageViewport,
    isCompactMapViewport,
    isCompactSearchViewport,
    detectStaticDevPHP,
    allowsStaticDevFallback,
    shouldLogStaticDevFallback,
    getThreadPulseOpacity,
    getFieldStepSyncLift,
    getGraphPresentationState,
    getGraphPresentationProfile
} from './ui-presentation'
export type { GraphPresentationState, GraphPresentationProfile } from './ui-presentation'
export { DATA_COLUMNS } from './data-schema'
export type { RawDatum, DataColumnKey } from './data-schema'
export { normalizeSlugName, mapRawRecordToPoint, extractRawCoordinates } from './data-mapper'
export type { MappedPoint, RawCoordinates } from './data-mapper'
export {
    UNCLASSIFIED_RELATIONSHIP_ROLE,
    RELATIONSHIP_ROLES,
    normalizeRelationshipRole,
    getRelationshipRoleLabel,
    getRelationshipRoleCopy,
    describeRelationshipRoleReason
} from './relationship-roles'
export type { RelationshipRole } from './relationship-roles'
export { el, setChildren } from './dom-builder'
export type { DomChild, DomEventHandler, DomAttributes } from './dom-builder'
export { FOCUSABLE_SELECTORS, setupFocusTrap, releaseFocusTrap } from './focus-trap'
export { bindFocusTrapObserver, disposeFocusTrapBindings, registerOpenDialog, unregisterOpenDialog, hasOpenNestedDialog } from './focus-trap-bindings'
export { createSporeTexture, createFocusRingTexture, createFocusNextCueTexture } from './three-textures'

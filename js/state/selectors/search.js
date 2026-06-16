// js/state/selectors/search.js
// Read-only selectors for search query, results, glow, semantic lane state.
// W13-T3: Consumers in js/modules/ migrated to direct appState reads.
// Exports retained for state-selectors-bridge.ts re-export (Phase 4 territory).
// W13-T3 pass-through: selectors below now read from appState (Svelte 5)
// instead of the legacy state singleton. T5 will retire the barrel.
import { appState } from '@lib/state/app.svelte.ts';

// ── Search Results ──
export const getCurrentSearchSummary = () => appState.currentSearchSummary;
export const getCurrentEmptyQuery = () => appState.currentEmptyQuery;

// ── Search Glow ──
export const getSearchGlowActive = () => appState.searchGlowActive;
export const getSearchGlowIndices = () => appState.searchGlowIndices;
export const getSearchGlowTopIndex = () => appState.searchGlowTopIndex;
export const getSearchGlowRenderStateKey = () => appState.searchGlowRenderStateKey;

// ── Search Request / Anchor ──
export const getSearchRequestSequence = () => appState.searchRequestSequence;
export const getSearchAnchorIndex = () => appState.searchAnchorIndex;
export const getSearchPreviewIndex = () => appState.searchPreviewIndex;
export const getSearchFocusTransitionToken = () => appState.searchFocusTransitionToken;
// ── Search Vector Scramble ──
export const getSearchVectorScrambleInterval = () => appState.searchVectorScrambleInterval;

// ── Search Abort ──
export const getSearchAbortController = () => appState.searchAbortController;

// ── Compact Search Reveal ──
export const getCompactSearchRevealToken = () => appState.compactSearchRevealToken;

// ── Mobile Route Field Peek ──
export const getMobileRouteFieldPeekToken = () => appState.mobileRouteFieldPeekToken;

// ── Semantic Lane ──
export const getSemanticLaneState = () => appState.semanticLaneState;
export const getSemanticLaneProbePromise = () => appState.semanticLaneProbePromise;
export const getSemanticLaneOpsMode = () => appState.semanticLaneOpsMode;
export const getSemanticLaneOpsFetchPromise = () => appState.semanticLaneOpsFetchPromise;
export const getSemanticLanePendingWarm = () => appState.semanticLanePendingWarm;
export const getSemanticLaneSnapshot = () => appState.semanticLaneSnapshot;

// ── Semantic Search Cache ──
export const getSemanticSearchResultCache = () => appState.semanticSearchResultCache;
export const getSemanticResultContextByLeadId = () => appState.semanticResultContextByLeadId;

// ── Semantic Guide ──
export const getSemanticGuideAbortController = () => appState.semanticGuideAbortController;
export const getSemanticGuideRequestSequence = () => appState.semanticGuideRequestSequence;
export const getCurrentSemanticGuide = () => appState.currentSemanticGuide;
export const getSummaryCardTypeToken = () => appState.summaryCardTypeToken;

// ── Trail Cue ──
export const getSemanticTrailCue = () => appState.semanticTrailCue;
export const getTrailIndices = () => appState.trailIndices;

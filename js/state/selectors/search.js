// js/state/selectors/search.js
// Read-only selectors for search query, results, glow, semantic lane state.
import { state } from '../../state.js';

// ── Search Results ──
export const getCurrentSearchSummary = () => state.currentSearchSummary;
export const getCurrentEmptyQuery = () => state.currentEmptyQuery;

// ── Search Glow ──
export const getSearchGlowActive = () => state.searchGlowActive;
export const getSearchGlowIndices = () => state.searchGlowIndices;
export const getSearchGlowTopIndex = () => state.searchGlowTopIndex;
export const getSearchGlowRenderStateKey = () => state.searchGlowRenderStateKey;

// ── Search Request / Anchor ──
export const getSearchRequestSequence = () => state.searchRequestSequence;
export const getSearchAnchorIndex = () => state.searchAnchorIndex;
export const getSearchPreviewIndex = () => state.searchPreviewIndex;
export const getSearchFocusTransitionToken = () => state.searchFocusTransitionToken;
// ── Search Vector Scramble ──
export const getSearchVectorScrambleInterval = () => state.searchVectorScrambleInterval;

// ── Search Abort ──
export const getSearchAbortController = () => state.searchAbortController;

// ── Compact Search Reveal ──
export const getCompactSearchRevealToken = () => state.compactSearchRevealToken;

// ── Mobile Route Field Peek ──
export const getMobileRouteFieldPeekToken = () => state.mobileRouteFieldPeekToken;

// ── Semantic Lane ──
export const getSemanticLaneState = () => state.semanticLaneState;
export const getSemanticLaneProbePromise = () => state.semanticLaneProbePromise;
export const getSemanticLaneOpsMode = () => state.semanticLaneOpsMode;
export const getSemanticLaneOpsFetchPromise = () => state.semanticLaneOpsFetchPromise;
export const getSemanticLanePendingWarm = () => state.semanticLanePendingWarm;
export const getSemanticLaneSnapshot = () => state.semanticLaneSnapshot;

// ── Semantic Search Cache ──
export const getSemanticSearchResultCache = () => state.semanticSearchResultCache;
export const getSemanticResultContextByLeadId = () => state.semanticResultContextByLeadId;

// ── Semantic Guide ──
export const getSemanticGuideAbortController = () => state.semanticGuideAbortController;
export const getSemanticGuideRequestSequence = () => state.semanticGuideRequestSequence;
export const getCurrentSemanticGuide = () => state.currentSemanticGuide;
export const getSummaryCardTypeToken = () => state.summaryCardTypeToken;

// ── Trail Cue ──
export const getSemanticTrailCue = () => state.semanticTrailCue;
export const getTrailIndices = () => state.trailIndices;

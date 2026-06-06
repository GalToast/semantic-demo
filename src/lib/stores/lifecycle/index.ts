/**
 * @lib/stores/lifecycle/index.ts — Barrel export for lifecycle split modules
 *
 * Pattern decision: These are **pure helpers** (not Svelte stores).
 * Each module imports from existing stores (navStore, searchStore, focusStore,
 * journeyStore) and the orchestration event bus, then exports composed helper
 * functions and event subscriptions. They do not define writable/derived stores
 * because they orchestrate across multiple stores rather than owning a single
 * state slice. This matches the original JS extraction pattern where
 * lifecycle-modes.js, lifecycle-reset.js, and lifecycle-search-sync.js were
 * split from the monolithic lifecycle.js by concern, not by data ownership.
 *
 * NOTE: orchestration/lifecycle.ts contains the monolithic TS port of the
 * original lifecycle.js. These split files provide the same public API
 * organized by concern. The orchestration/lifecycle.ts may be deprecated
 * in favor of these splits in a future pass.
 */

// ── Modes / depth / composition ─────────────────────────────────────────────
export {
  MODE_DESCRIPTIONS,
  STORY_DESCRIPTIONS,
  refreshCompositionState,
  updateExplorationUi,
  setMyceliumMode,
  setTrailDepth,
  setSemanticDiveMode,
  getBloomIndices,
  getBridgeIndices
} from './modes';

// ── Reset / replay ──────────────────────────────────────────────────────────
export {
  resetExplorationFocus,
  resetNodePositions,
  resetExperienceState,
  returnToOverview
} from './reset';

// ── Search glow / trail review ──────────────────────────────────────────────
export {
  activateSearchGlow,
  recordEmptySearch,
  showExploreTrailReview,
  hideExploreTrailReview,
  getCurrentEmptyQuery
} from './search-sync';

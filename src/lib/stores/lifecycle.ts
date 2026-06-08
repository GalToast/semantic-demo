/**
 * @lib/stores/lifecycle — Barrel re-exporting lifecycle helpers.
 *
 * Some functions delegate to the actual Svelte stores below.
 * Full ports of the legacy js/modules/lifecycle-*.js modules
 * should land here incrementally during the migration.
 */
import { setTrailDepth as _setTrailDepth } from './journey.svelte';
import { setMyceliumMode as _setMyceliumMode } from './navigation.svelte';
import { setSemanticDiveMode as _setSemanticDiveMode } from './focus.svelte';

// ── Delegates to real stores ─────────────────────────────────────────────────

export const setTrailDepth = _setTrailDepth;
export const setSemanticDiveMode = _setSemanticDiveMode;
export const setMyceliumMode = _setMyceliumMode;

// ── Stubs (awaiting full Svelte migration from js/modules/lifecycle-*.js) ───────

export function resetNodePositions(_options?: object) {
  console.warn('[lifecycle]) resetNodePositions is a stub');
}

export function refreshCompositionState() {
  console.warn('[lifecycle]) refreshCompositionState is a stub');
}

export function updateExplorationUi() {
  console.warn('[lifecycle]) updateExplorationUi is a stub');
}

export function getBloomIndices(): number[] {
  return [];
}

export function getBridgeIndices(): number[] {
  return [];
}

export function resetExplorationFocus(_options?: { preserveSearch?: boolean }) {
  console.warn('[lifecycle]) resetExplorationFocus is a stub');
}

export function resetExperienceState() {
  console.warn('[lifecycle]) resetExperienceState is a stub');
}

export function returnToOverview() {
  console.warn('[lifecycle]) returnToOverview is a stub');
}

export function activateSearchGlow(_summary?: unknown) {
  console.warn('[lifecycle]) activateSearchGlow is a stub');
}

export function getCurrentEmptyQuery(): string | null {
  return null;
}

export function recordEmptySearch(_query?: string) {
  console.warn('[lifecycle]) recordEmptySearch is a stub');
}

export function showExploreTrailReview(_summary?: unknown) {
  console.warn('[lifecycle]) showExploreTrailReview is a stub');
}

export function hideExploreTrailReview() {
  console.warn('[lifecycle]) hideExploreTrailReview is a stub');
}

export const MODE_DESCRIPTIONS = {
  default: 'County-wide overview across all visible records.',
  bloom: 'Living records with high relationship potential.',
  bridge: 'Connective nodes linking disparate county themes.',
  trail: 'Focused path of related business entities.',
  inside: 'Immersive exploration of local neighborhoods.'
};

export const STORY_DESCRIPTIONS = {
  standard: 'A semantic journey through Montgomery County.'
};

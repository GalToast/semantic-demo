/**
 * @lib/journey/focus-pocket-personality.ts — Thin re-export from focus/pocket-personality.ts
 *
 * W7-B Pair 4 collapse: the canonical implementation lives in
 * @lib/focus/pocket-personality (Svelte 5 native). This file is kept
 * as a forwarding module so existing import paths continue to resolve.
 *
 * Once all consumers migrate to @lib/focus/pocket-personality,
 * this file can be deleted.
 */
export {
    type SemanticCandidate,
    type NeighborhoodPersonality,
    getSemanticCandidateSlice,
    getNeighborhoodPersonality
} from '@lib/focus/pocket-personality'

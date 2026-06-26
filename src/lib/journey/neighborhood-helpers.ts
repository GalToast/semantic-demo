/**
 * @lib/journey/neighborhood-helpers.ts — Pure array/value helpers for neighborhood.ts
 *
 * Extracted from `neighborhood.ts` (2026-06-25, Phase 5c) so both
 * `neighborhood.ts` and `neighborhood-manifest.ts` can share them without
 * duplication. Pure functions only — no module-level state, no Svelte store
 * reads.
 */

/** A thread candidate is either a numeric index or an object with an index field. */
export type ThreadCandidateLike = number | { index?: number }

/** Coerce any iterable-like value to an array. Handles arrays, Maps, iterables,
 *  and plain objects (via Object.values). */
export function valueArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value
    if (value instanceof Map) return [...value.values()]
    if (value && typeof (value as Iterable<unknown>)[Symbol.iterator] === 'function') {
        return [...(value as Iterable<unknown>)]
    }
    if (value && typeof value === 'object') return Object.values(value)
    return []
}

/** Extract an index from a thread candidate (either a number or {index, source}).
 *  Returns null if the value cannot be coerced to a finite number. */
export function candidateIndex(candidate: (ThreadCandidateLike & { source?: string }) | unknown): number | null {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate
    if (!candidate || typeof candidate !== 'object') return null
    const index = Number((candidate as { index?: unknown }).index)
    return Number.isFinite(index) ? index : null
}

/** Normalize a value (array of candidates, Map, iterable, etc.) to a list of
 *  finite candidate indices. */
export function normalizeThreadCandidates(value: unknown): number[] {
    return valueArray(value)
        .map(candidateIndex)
        .filter((index): index is number => index !== null)
}

/** Normalize a value to a list of finite numbers. */
export function finiteIndexList(value: unknown): number[] {
    return valueArray(value)
        .map((index) => Number(index))
        .filter((index) => Number.isFinite(index))
}

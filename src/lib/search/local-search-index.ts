/**
 * @lib/search/local-search-index.ts — Local in-memory index over the 8,406-record Montgomery County corpus
 *
 * When the live semantic-search API is unavailable in production, this module
 * walks the businessRecords array and builds a token → (record, field) inverted
 * index. The index is rebuilt only when the records array identity changes,
 * so subsequent queries are cheap.
 *
 * Search algorithm:
 *   1. Tokenize the query and look up each token in the index
 *   2. Aggregate per-record hits, dedupe, and score by token frequency +
 *      field boost (name > category > what > city)
 *   3. Fuzzy-expand hits to nearby terms via Levenshtein distance for typo
 *      tolerance ("cofee" → "coffee")
 *   4. Rank, slice for pagination, return typed SearchResult array
 *
 * Pure data + scoring — no state mutation, no Svelte store access.
 */

import type { SearchResult } from '@lib/types/state'
import type { BusinessRecord } from '@lib/types/business'
import { getBusinessRecords } from '@lib/data-store'
import { getEnvFlag } from '@lib/utils/env-flag'

// ── Local Index Search (8,406-record fallback) ────────────────────────────────

/**
 * A single normalized token entry in the local index.
 * Each record contributes one entry per token; we score by token-frequency.
 */
interface LocalIndexToken {
    /** The 0-based record index in `businessRecords`. */
    recordIndex: number
    /** Which field this token came from (boosts name hits). */
    field: 'name' | 'what' | 'category' | 'city'
}

/**
 * The local index: maps lowercased token → list of (recordIndex, field) hits.
 * Built lazily on first call, rebuilt if the records array identity changes.
 */
let _localIndex: Map<string, LocalIndexToken[]> | null = null
let _localIndexRecordCount = -1
let _localIndexRecordRef: readonly BusinessRecord[] | null = null

export function tokenize(value: string | null | undefined): string[] {
    if (!value || typeof value !== 'string') return []
    return value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length > 0)
}

export function buildLocalIndex(records: readonly BusinessRecord[]): Map<string, LocalIndexToken[]> {
    const index = new Map<string, LocalIndexToken[]>()
    for (let i = 0; i < records.length; i++) {
        const record = records[i]
        if (!record) continue
        const seenForRecord = new Set<string>()
        for (const field of ['name', 'what', 'category', 'city'] as const) {
            const tokens = tokenize(record[field])
            for (const token of tokens) {
                // Dedupe per (record, token) pair so "Pizza Pizza" doesn't double-count.
                const dedupeKey = `${field}:${token}`
                if (seenForRecord.has(dedupeKey)) continue
                seenForRecord.add(dedupeKey)
                const bucket = index.get(token)
                if (bucket) {
                    bucket.push({ recordIndex: i, field })
                } else {
                    index.set(token, [{ recordIndex: i, field }])
                }
            }
        }
    }
    return index
}

export function getLocalIndex(): { index: Map<string, LocalIndexToken[]>; records: readonly BusinessRecord[] } | null {
    const records = getBusinessRecords()
    if (!Array.isArray(records) || records.length === 0) return null
    if (_localIndex && _localIndexRecordCount === records.length && _localIndexRecordRef === records) {
        return { index: _localIndex, records }
    }
    _localIndex = buildLocalIndex(records)
    _localIndexRecordCount = records.length
    _localIndexRecordRef = records
    return { index: _localIndex, records }
}

/**
 * Cheap Levenshtein distance with an early-exit threshold. Bails out
 * (returns Infinity) as soon as the partial distance exceeds `max`.
 */
export function levenshteinCapped(a: string, b: string, max: number): number {
    if (a === b) return 0
    const aLen = a.length
    const bLen = b.length
    if (Math.abs(aLen - bLen) > max) return Infinity
    if (aLen === 0) return bLen
    if (bLen === 0) return aLen

    // Single-row rolling Levenshtein.
    let prev = new Array(bLen + 1)
    let curr = new Array(bLen + 1)
    for (let j = 0; j <= bLen; j++) prev[j] = j

    for (let i = 1; i <= aLen; i++) {
        curr[0] = i
        let rowMin = curr[0]
        const aChar = a.charCodeAt(i - 1)
        for (let j = 1; j <= bLen; j++) {
            const cost = aChar === b.charCodeAt(j - 1) ? 0 : 1
            curr[j] = Math.min(
                prev[j] + 1, // deletion
                curr[j - 1] + 1, // insertion
                prev[j - 1] + cost // substitution
            )
            if (curr[j] < rowMin) rowMin = curr[j]
        }
        if (rowMin > max) return Infinity
        ;[prev, curr] = [curr, prev]
    }
    return prev[bLen]
}

interface ScoredHit {
    score: number
    fieldBoost: number
}

/**
 * Score a record against the query. Returns null if the record doesn't match.
 *
 * Priority: exact name > name prefix > whole-word token match > substring.
 */
export function scoreRecord(record: BusinessRecord, query: string, queryTokens: string[]): ScoredHit | null {
    const nameLower = (record.name || '').toLowerCase().trim()
    const whatLower = (record.what || '').toLowerCase().trim()
    const categoryLower = (record.category || '').toLowerCase().trim()
    const cityLower = (record.city || '').toLowerCase().trim()

    // Field boost: name matches are the strongest signal.
    const fieldBoost = (field: 'name' | 'what' | 'category' | 'city'): number => {
        if (field === 'name') return 3.0
        if (field === 'what') return 1.6
        if (field === 'category') return 1.2
        return 0.9 // city
    }

    let total = 0
    let matchedAny = false

    // 1. Exact name match (case-insensitive)
    if (nameLower && nameLower === query) {
        total += 1.0 * fieldBoost('name')
        matchedAny = true
    } else if (nameLower && nameLower.startsWith(query)) {
        // 2. Name prefix match
        total += 0.78 * fieldBoost('name')
        matchedAny = true
    }

    // 3. Whole-word token match across fields
    for (const token of queryTokens) {
        if (nameLower && nameLower.split(/\s+/).includes(token)) {
            total += 0.62 * fieldBoost('name')
            matchedAny = true
        }
        if (whatLower && whatLower.split(/\s+/).includes(token)) {
            total += 0.32 * fieldBoost('what')
            matchedAny = true
        }
        if (categoryLower && categoryLower.split(/\s+/).includes(token)) {
            total += 0.28 * fieldBoost('category')
            matchedAny = true
        }
        if (cityLower && cityLower.split(/\s+/).includes(token)) {
            total += 0.2 * fieldBoost('city')
            matchedAny = true
        }
    }

    // 4. Substring fallback (only if no other match)
    if (!matchedAny) {
        if (nameLower && nameLower.includes(query)) {
            total += 0.55 * fieldBoost('name')
            matchedAny = true
        } else if (whatLower && whatLower.includes(query)) {
            total += 0.42 * fieldBoost('what')
            matchedAny = true
        } else if (categoryLower && categoryLower.includes(query)) {
            total += 0.38 * fieldBoost('category')
            matchedAny = true
        } else if (cityLower && cityLower.includes(query)) {
            total += 0.3 * fieldBoost('city')
            matchedAny = true
        }
    }

    if (!matchedAny) return null
    // Light per-record length normalization so a single-token "LLC" name
    // doesn't dominate. Short records with the term in the name are best.
    const nameLength = nameLower.length || 1
    const lengthPenalty = Math.min(1.0, 18 / Math.max(18, nameLength))
    return {
        score: total * lengthPenalty,
        fieldBoost: 1
    }
}

/**
 * Apply a single-token typo-tolerant search: if the literal token has zero
 * hits, look for tokens within Levenshtein distance N (1 for short, 2 for
 * long) and treat those as fuzzy matches. Returns a Map from fuzzy
 * token → list of (recordIndex, field) entries.
 */
export function expandFuzzyMatches(
    index: Map<string, LocalIndexToken[]>,
    token: string
): { fuzzyToken: string; hits: LocalIndexToken[] }[] {
    if (token.length < 3) return []
    const maxDistance = token.length <= 5 ? 1 : 2
    const matches: { fuzzyToken: string; hits: LocalIndexToken[] }[] = []
    // Linear scan is fine here: the index is small (8,406 unique tokens at
    // most), and this only runs when the literal token has zero hits.
    for (const [indexToken, hits] of index.entries()) {
        if (Math.abs(indexToken.length - token.length) > maxDistance) continue
        const distance = levenshteinCapped(token, indexToken, maxDistance)
        if (Number.isFinite(distance) && distance > 0 && distance <= maxDistance) {
            matches.push({ fuzzyToken: indexToken, hits })
        }
    }
    return matches
}

interface LocalSearchHit {
    recordIndex: number
    score: number
    field: 'name' | 'what' | 'category' | 'city'
}

/**
 * Walk the local index for a query, returning ranked hits.
 * Returns null when the index is unavailable (no records loaded yet) so
 * callers can decide to fall back to a different strategy.
 */
export function performLocalIndexSearch(query: string, offset = 0, limit = 18): LocalSearchHit[] | null {
    const idx = getLocalIndex()
    if (!idx) return null
    const { index, records } = idx
    const queryLower = query.toLowerCase().trim()
    if (!queryLower) return []
    const queryTokens = tokenize(queryLower)
    if (queryTokens.length === 0) return []

    // Aggregate score per record: name exact/prefix first, then whole-word,
    // then substring. Fuzzy fallback for any token with zero literal hits.
    const scored = new Map<number, LocalSearchHit>()
    // Bug #2 (bugsweep): track name-field records scored in step 1 so step 2
    // doesn't double-count them for single-token queries.
    const scoredNameRecords = new Set<number>()

    // 1. Exact name + name prefix (single-token query only — otherwise the
    //    whole-word / substring paths handle it cleanly).
    if (queryTokens.length === 1) {
        const exact = index.get(queryLower)
        if (exact) {
            for (const hit of exact) {
                if (hit.field !== 'name') continue
                scoredNameRecords.add(hit.recordIndex)
                const existing = scored.get(hit.recordIndex)
                const boost = existing ? existing.score : 0
                scored.set(hit.recordIndex, {
                    recordIndex: hit.recordIndex,
                    score: boost + 1.0 * 3.0,
                    field: hit.field
                })
            }
        }
    }

    // 2. Walk every query token; for each, find exact index hits, then fuzzy
    //    matches if the literal token has zero hits.
    for (const token of queryTokens) {
        const literal = index.get(token)
        if (literal && literal.length > 0) {
            for (const hit of literal) {
                // Bug #2 (bugsweep): skip name-field hits already scored in step 1
                // to avoid double-counting for single-token queries.
                if (queryTokens.length === 1 && hit.field === 'name' && scoredNameRecords.has(hit.recordIndex)) continue
                const fieldBoost =
                    hit.field === 'name' ? 3.0 : hit.field === 'what' ? 1.6 : hit.field === 'category' ? 1.2 : 0.9
                const weight = 0.62 * fieldBoost
                const existing = scored.get(hit.recordIndex)
                if (existing) {
                    existing.score += weight
                } else {
                    scored.set(hit.recordIndex, {
                        recordIndex: hit.recordIndex,
                        score: weight,
                        field: hit.field
                    })
                }
            }
        } else {
            // Fuzzy fallback
            const fuzzyMatches = expandFuzzyMatches(index, token)
            // Bug #3 (bugsweep): sort by Levenshtein distance, not token length.
            // The comment above said 'closest by edit distance' but the sort
            // used .length, which could discard closer matches for shorter ones.
            fuzzyMatches.sort((a, b) => {
                const da = levenshteinCapped(token, a.fuzzyToken, 2)
                const db = levenshteinCapped(token, b.fuzzyToken, 2)
                return (Number.isFinite(da) ? da : Infinity) - (Number.isFinite(db) ? db : Infinity)
            })
            const cap = fuzzyMatches.slice(0, 5)
            for (const fuzzy of cap) {
                for (const hit of fuzzy.hits) {
                    const fieldBoost =
                        hit.field === 'name' ? 3.0 : hit.field === 'what' ? 1.6 : hit.field === 'category' ? 1.2 : 0.9
                    // Fuzzy hits get ~0.55x the weight of exact hits, plus a distance
                    // penalty so a closer match ranks above a farther one.
                    const distance = levenshteinCapped(token, fuzzy.fuzzyToken, 2)
                    const distanceMultiplier = Number.isFinite(distance) ? 1 / (1 + distance) : 0.4
                    const weight = 0.55 * fieldBoost * distanceMultiplier
                    const existing = scored.get(hit.recordIndex)
                    if (existing) {
                        existing.score += weight
                    } else {
                        scored.set(hit.recordIndex, {
                            recordIndex: hit.recordIndex,
                            score: weight,
                            field: hit.field
                        })
                    }
                }
            }
        }
    }

    // 3. Substring fallback: if no whole-word hits scored > 0, scan for
    //    substring matches across name/what/category/city.
    if (scored.size === 0 && queryLower.length >= 2) {
        for (let i = 0; i < records.length; i++) {
            const record = records[i]
            if (!record) continue
            const s = scoreRecord(record, queryLower, queryTokens)
            if (s) {
                scored.set(i, { recordIndex: i, score: s.score, field: 'name' })
            }
        }
    }

    // 4. Rank + return top 18.
    const ranked = Array.from(scored.values()).sort((a, b) => b.score - a.score)
    return ranked.slice(offset, offset + limit)
}

/**
 * Translate ranked local hits to the public SearchResult shape.
 */
export function localHitsToResults(hits: LocalSearchHit[]): SearchResult[] {
    const records = getBusinessRecords()
    const out: SearchResult[] = []
    for (const hit of hits) {
        const record = records[hit.recordIndex]
        if (!record) continue
        const name = record.name?.trim() || `Record ${hit.recordIndex}`
        out.push({
            id: record.lead_id || record.id || `record-${hit.recordIndex}`,
            name,
            index: hit.recordIndex,
            score: Math.min(1, hit.score / 3.0), // normalize to a 0-1 confidence
            category: record.category || '',
            snippet: record.what || '',
            // Populate `point` so the local-index fallback path behaves like the
            // API path: clicking a result transitions to focus (orchestration's
            // beginSearchFocusTransition early-returns when point is undefined),
            // deep-link anchor restore by lead_id works, and trail cues show the
            // business name. Without this, API-down/staticDev search results are
            // rendered but unclickable.
            point: {
                lead_id: record.lead_id,
                name: record.name?.trim() || undefined,
                what: record.what?.trim() || undefined,
                cluster: record.cluster,
                city: record.city?.trim() || undefined,
                website: record.website ?? undefined,
                email: record.email ?? undefined,
                phone: record.phone ?? undefined
            }
        })
    }
    return out
}

/**
 * Get the top 5 most-common categories in the live records, used to
 * populate the empty-state suggestion chips. Returns [] when the records
 * aren't loaded yet.
 */
export function getSearchEngineEmptyStateSuggestions(): string[] {
    const records = getBusinessRecords()
    if (!Array.isArray(records) || records.length === 0) return []
    const counts = new Map<string, number>()
    for (const record of records) {
        const category = (record.category || '').trim()
        if (!category) continue
        counts.set(category, (counts.get(category) ?? 0) + 1)
    }
    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([category]) => category)
}

/**
 * When VITE_USE_LIVE_SEARCH === '1', the API is treated as the source of
 * truth and we only use the local index when the API errors. When unset
 * (the dev/static-dev default), the local index is always preferred because
 * the API is unreachable in those environments. This keeps production
 * semantic ranking from regressing while making every dev query feel alive.
 */
export function shouldPreferLiveSearch(): boolean {
    const flag = getEnvFlag('VITE_USE_LIVE_SEARCH')
    return flag === '1' || flag === 'true'
}

/**
 * @lib/search/semantic-search-mapper.ts — Pure-TS result mapping + pagination
 *
 * The mapper functions are intentionally duplicated here as pure TS to avoid
 * importing the legacy search-mapper.js (which depends on state.js Proxy
 * globals). They read only the row fields — no state, no side effects.
 *
 * Pagination helpers normalize user-supplied page/offset/limit into safe
 * integers for the rest of the pipeline.
 */

import type { SearchResult } from '@lib/types/state'
import type { RawServiceRow } from './semantic-search-types'
import { PAGE_SIZE } from './semantic-search-types'

export { PAGE_SIZE }

/**
 * Extract the results array from the API payload.
 * Accepts both `results` and `data` keys; filters out falsy entries.
 */
export function getPayloadResults(payload: unknown): RawServiceRow[] {
    if (!payload || typeof payload !== 'object') return []
    const p = payload as Record<string, unknown>
    const raw = (p.results ?? p.data ?? []) as unknown[]
    return Array.isArray(raw) ? (raw.filter(Boolean) as RawServiceRow[]) : []
}

/**
 * Map a single raw service row to a typed SearchResult.
 *
 * Corpus-index resolution (lead_id → canonical point position):
 *   When `leadToIndex` is provided, the function looks up `row.lead_id` in
 *   the map to set `result.index` to the actual corpus position. This is
 *   necessary because downstream consumers (focus, glow, trail, card, URL)
 *   use the corpus index, not the API page-order position.
 *
 *   The API response order (the `order` parameter) is the **fallback** for
 *   rows that lack a usable lead_id or have a lead_id not present in the
 *   canonical corpus map (e.g. name-only or malformed rows). Row-level
 *   `row.index` from the API is **never** treated as the corpus index — the
 *   API sends response-order positions, not the corpus index.
 *
 *   This is a deliberate, documented fallback so malformed or isolated
 *   mapper tests do not crash and name-only results survive.
 *
 * @param row         Raw service row from the API payload.
 * @param order       Position of this row in the API response array (fallback index).
 * @param leadToIndex Optional canonical map from lead_id → corpus point index.
 */
export function mapServiceRow(row: RawServiceRow, order: number, leadToIndex?: Map<string, number>): SearchResult | null {
    // Need at least a name or lead_id to produce a result
    if (!row || (!row.name && !row.lead_id)) return null

    // Resolve the corpus index: lead_id lookup in the canonical map first;
    // fall back to response order for rows without a usable lead_id.
    const resolvedIndex = resolveCorpusIndex(row, leadToIndex, order)

    return {
        id: String(row.lead_id ?? row.name ?? `result-${order}`),
        name: String(row.name || row.lead_id || 'Unknown'),
        index: resolvedIndex,
        score: Number(row.score ?? row.semantic_score ?? 0),
        category: String(row.category ?? ''),
        snippet: String(row.public_note ?? row.public_detail ?? row.address ?? ''),
        point: {
            lead_id: row.lead_id ? String(row.lead_id) : undefined,
            name: row.name ? String(row.name) : undefined,
            what:
                row.public_note || row.public_detail || row.address
                    ? String(row.public_note ?? row.public_detail ?? row.address ?? '')
                    : undefined,
            city: row.city ? String(row.city) : undefined,
            website: row.website ? String(row.website) : undefined,
            email: row.email ? String(row.email) : undefined,
            phone: row.phone ? String(row.phone) : undefined,
            cluster:
                typeof row.cluster === 'number'
                    ? Number.isInteger(row.cluster)
                        ? row.cluster
                        : undefined
                    : typeof row.cluster === 'string' &&
                        row.cluster.trim() !== '' &&
                        Number.isInteger(Number(row.cluster))
                      ? Number(row.cluster)
                      : undefined
        }
    }
}

/**
 * Resolve the corpus index for a raw API row.
 *
 * Priority:
 *   1. lead_id → canonical corpus map (most reliable)
 *   2. fallback order (API response position)
 *
 * The API's `row.index` field is deliberately rejected — the API returns
 * page-order positions, not corpus indices.
 */
function resolveCorpusIndex(row: RawServiceRow, leadToIndex?: Map<string, number>, fallback?: number): number {
    if (leadToIndex && row.lead_id) {
        const canonical = leadToIndex.get(String(row.lead_id))
        if (canonical !== undefined && Number.isFinite(canonical) && canonical >= 0) {
            return canonical
        }
    }
    return fallback ?? 0
}

export function normalizeSearchPage(page: number): number {
    return Number.isFinite(page) ? Math.max(0, Math.floor(page)) : 0
}

export function normalizeSearchOffset(page: number, offset: number): number {
    const explicitOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0
    if (explicitOffset > 0) return explicitOffset
    return normalizeSearchPage(page) * PAGE_SIZE
}

export function normalizeSearchLimit(limit: number): number {
    return Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : PAGE_SIZE
}

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
 * Pure function — reads only the row fields, no state dependency.
 */
export function mapServiceRow(row: RawServiceRow, order: number): SearchResult | null {
    // Need at least a name or lead_id to produce a result
    if (!row || (!row.name && !row.lead_id)) return null

    return {
        id: String(row.lead_id ?? row.name ?? `result-${order}`),
        name: String(row.name || row.lead_id || 'Unknown'),
        index: order,
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
            phone: row.phone ? String(row.phone) : undefined
        }
    }
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

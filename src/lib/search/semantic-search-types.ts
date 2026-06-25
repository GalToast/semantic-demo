/**
 * @lib/search/semantic-search-types.ts — Shared types for the semantic search pipeline
 *
 * Pure data structures — no runtime logic, no state. Consumed by
 * semantic-search-mapper.ts, mock-search-fallback.ts, local-search-index.ts,
 * and search-engine.ts (the orchestrator).
 */

export interface RawServiceRow {
    lead_id?: string
    name?: string
    index?: number
    score?: number
    semantic_score?: number
    category?: string
    public_note?: string
    public_detail?: string
    address?: string
    city?: string
    website?: string
    email?: string
    phone?: string
    isMock?: boolean
    [key: string]: unknown
}

export interface SemanticSearchPayload {
    ok: boolean
    query?: string
    results?: unknown[]
    is_mock?: boolean
    dev_mode?: string
    error?: string
    [key: string]: unknown
}

/** Default page size for search results. */
export const PAGE_SIZE = 18
/**
 * @lib/search/mock-search-fallback.ts — Static mock data + scoring for dev/static-dev mode
 *
 * When the live semantic-search API is unreachable (typical during dev work
 * against a static Python http.server without a PHP backend), this module
 * returns a small hand-curated set of mock businesses ranked by a simple
 * keyword-matching score. It is NOT a substitute for the local index search
 * (see local-search-index.ts) — those two layers serve different purposes.
 *
 * - Mock fallback: hand-curated dev data, returns within ~165ms (simulates API
 *   latency so the loading spinner has time to render in dev).
 * - Local index: walks the actual 8,406-record Montgomery County corpus, used
 *   when the API is genuinely down in production.
 *
 * The mock data + scoring are intentionally pure (no state mutation, no
 * Svelte store access) so they can be tested in isolation.
 */

import type { SearchResult } from '@lib/types/state'
import { debugWarn } from '@lib/utils/debug'
import { getEnvFlag } from '@lib/utils/env-flag'

interface MockBusiness {
    id: string
    name: string
    index: number
    category: string
    snippet: string
    keywords: string[]
}

const MOCK_BUSINESSES: readonly MockBusiness[] = [
    {
        id: 'b-001',
        name: 'Conroe Coffee Roasters',
        index: 42,
        category: 'Food & Beverage',
        snippet: 'Specialty coffee roasting in downtown Conroe',
        keywords: ['coffee', 'roasters', 'conroe', 'beverage', 'cafe']
    },
    {
        id: 'b-002',
        name: 'Lone Star HVAC Solutions',
        index: 187,
        category: 'Home Services',
        snippet: 'Residential and commercial HVAC installation and repair',
        keywords: ['hvac', 'lone', 'star', 'heating', 'cooling', 'air']
    },
    {
        id: 'b-003',
        name: 'The Woodlands Dental Group',
        index: 312,
        category: 'Healthcare',
        snippet: 'General and cosmetic dentistry serving The Woodlands area',
        keywords: ['dental', 'dentist', 'woodlands', 'healthcare', 'teeth']
    },
    {
        id: 'b-004',
        name: 'Montgomery County Auto Body',
        index: 55,
        category: 'Automotive',
        snippet: 'Full-service collision repair and paint matching',
        keywords: ['auto', 'body', 'montgomery', 'car', 'repair', 'paint']
    },
    {
        id: 'b-005',
        name: 'Cypress Creek Landscape Design',
        index: 203,
        category: 'Home Services',
        snippet: 'Custom landscape architecture and irrigation systems',
        keywords: ['landscape', 'creek', 'design', 'garden', 'irrigation']
    },
    {
        id: 'b-006',
        name: 'Magnolia BBQ & Catering',
        index: 78,
        category: 'Food & Beverage',
        snippet: 'Texas-style barbecue with full-service catering',
        keywords: ['bbq', 'barbecue', 'magnolia', 'catering', 'food']
    },
    {
        id: 'b-007',
        name: 'TX Legal Associates',
        index: 441,
        category: 'Professional Services',
        snippet: 'Business law, estate planning, and real estate closings',
        keywords: ['legal', 'law', 'attorney', 'tx', 'texas', 'lawyer']
    },
    {
        id: 'b-008',
        name: 'Spring Community Pharmacy',
        index: 129,
        category: 'Healthcare',
        snippet: 'Independent pharmacy with compounding and delivery services',
        keywords: ['pharmacy', 'spring', 'drug', 'medication', 'health']
    },
    {
        id: 'b-009',
        name: 'Conroe Construction Partners',
        index: 610,
        category: 'Construction',
        snippet: 'Commercial and residential general contracting',
        keywords: ['construction', 'conroe', 'contractor', 'builder', 'build']
    },
    {
        id: 'b-010',
        name: 'Lake Conroe Marina & Boat Works',
        index: 24,
        category: 'Recreation',
        snippet: 'Boat storage, slip rental, and marine repair on Lake Conroe',
        keywords: ['marina', 'boat', 'lake', 'conroe', 'marine', 'water']
    },
    {
        id: 'b-011',
        name: 'Woodlands Tech Consulting',
        index: 388,
        category: 'Professional Services',
        snippet: 'IT infrastructure, cloud migration, and managed services',
        keywords: ['tech', 'technology', 'consulting', 'woodlands', 'IT']
    },
    {
        id: 'b-012',
        name: 'Piney Woods Pet Grooming',
        index: 95,
        category: 'Animal Services',
        snippet: 'Full grooming, boarding, and daycare for dogs and cats',
        keywords: ['pet', 'grooming', 'dog', 'cat', 'animal', 'piney']
    },
    {
        id: 'b-013',
        name: 'Montgomery Tax Services',
        index: 501,
        category: 'Professional Services',
        snippet: 'Individual and business tax preparation, IRS representation',
        keywords: ['tax', 'taxes', 'montgomery', 'accounting', 'irs']
    },
    {
        id: 'b-014',
        name: 'Greater Houston Flooring',
        index: 167,
        category: 'Home Services',
        snippet: 'Hardwood, tile, and luxury vinyl plank installation',
        keywords: ['flooring', 'floor', 'tile', 'hardwood', 'houston']
    },
    {
        id: 'b-015',
        name: 'Panther Creek Urgent Care',
        index: 290,
        category: 'Healthcare',
        snippet: 'Walk-in clinic with X-ray and lab testing on-site',
        keywords: ['urgent', 'care', 'clinic', 'panther', 'medical']
    },
    {
        id: 'b-016',
        name: 'Cafe Ole on the Square',
        index: 11,
        category: 'Food & Beverage',
        snippet: 'Tex-Mex breakfast and lunch in historic downtown Conroe',
        keywords: ['cafe', 'mexican', 'food', 'conroe', 'square', 'breakfast']
    },
    {
        id: 'b-017',
        name: 'Woodlands Orthodontics',
        index: 420,
        category: 'Healthcare',
        snippet: 'Braces, Invisalign, and pediatric orthodontics',
        keywords: ['orthodontics', 'braces', 'invisalign', 'woodlands', 'dental']
    },
    {
        id: 'b-018',
        name: 'Conroe Ace Hardware',
        index: 33,
        category: 'Retail',
        snippet: 'Neighborhood hardware store with paint and tool rental',
        keywords: ['hardware', 'ace', 'conroe', 'store', 'retail', 'paint']
    },
    {
        id: 'b-019',
        name: 'Twisted T Iron Works',
        index: 577,
        category: 'Construction',
        snippet: 'Custom wrought iron gates, railings, and decorative metalwork',
        keywords: ['iron', 'wrought', 'metal', 'fence', 'gate', 'twisted']
    },
    {
        id: 'b-020',
        name: 'Harvest Green Veterinary Clinic',
        index: 305,
        category: 'Animal Services',
        snippet: 'Full-service veterinary care with emergency hours',
        keywords: ['veterinary', 'vet', 'clinic', 'harvest', 'animal']
    }
]

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
            reject(new DOMException('Aborted', 'AbortError'))
            return
        }
        // eslint-disable-next-line no-restricted-syntax -- one-shot timer scoped to local promise / effect cleanup
        const timer = setTimeout(resolve, ms)
        const onAbort = (): void => {
            clearTimeout(timer)
            signal.removeEventListener('abort', onAbort)
            reject(new DOMException('Aborted', 'AbortError'))
        }
        signal.addEventListener('abort', onAbort, { once: true })
    })
}

/**
 * Artificial latency for the mock search path (ms). Overridable at build
 * time via `VITE_MOCK_SEARCH_DELAY_MS`; defaults to 165ms so the dev loading
 * spinner has time to render. Negative or unparsable overrides fall back to
 * the default.
 */
const MOCK_SEARCH_DELAY_MS = (() => {
    const override = getEnvFlag('VITE_MOCK_SEARCH_DELAY_MS')
    const parsed = override !== undefined ? Number.parseInt(override, 10) : NaN
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 165
})()

export function scoreBusiness(biz: MockBusiness, queryLower: string): number {
    const nameLower = biz.name.toLowerCase()
    if (nameLower.includes(queryLower)) return 0.85 + (nameLower.startsWith(queryLower) ? 0.15 : 0)
    let keywordHits = 0
    for (const kw of biz.keywords) {
        if (kw.startsWith(queryLower)) keywordHits += 2
        else if (kw.includes(queryLower)) keywordHits += 1
    }
    if (keywordHits === 0) return biz.category.toLowerCase().includes(queryLower) ? 0.45 : 0
    return Math.min(0.8, 0.2 + keywordHits * 0.12)
}

export function performMockSearch(query: string, signal: AbortSignal, offset = 0, limit = 10): Promise<SearchResult[]> {
    const trimmed = query.trim()
    if (trimmed.length < 2) return Promise.resolve([])
    const queryLower = trimmed.toLowerCase()
    const scored = MOCK_BUSINESSES.map((biz) => ({ biz, score: scoreBusiness(biz, queryLower) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.biz.name.localeCompare(b.biz.name))
    return sleep(MOCK_SEARCH_DELAY_MS, signal).then(() =>
        scored.slice(offset, offset + limit).map(({ biz, score }) => ({
            id: biz.id,
            name: biz.name,
            index: biz.index,
            score,
            category: biz.category,
            snippet: biz.snippet
        }))
    )
}

/**
 * Whether the static-dev fallback path is allowed. Returns true when running
 * on a localhost loopback host and the URL has not disabled it via staticDev=0.
 */
export function canUseStaticDevFallback(): boolean {
    if (typeof window === 'undefined' || !window.location) return false
    const host = window.location.hostname
    if (!['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(host)) return false
    const params = new URLSearchParams(window.location.search || '')
    return !(params.get('staticDev') === '0')
}

/**
 * Whether contract tests want API failures surfaced as errors instead of
 * falling back to the local index. Triggered by ?staticDev=0 in the URL.
 */
export function shouldSurfaceApiFailures(): boolean {
    if (typeof window === 'undefined' || !window.location) return false
    const params = new URLSearchParams(window.location.search || '')
    return params.get('staticDev') === '0'
}

// PR-M: time-bounded sticky bypass. The flag is recorded with a timestamp
// so transient dev-server restarts (PHP CLI server, key router, etc.) don't
// permanently lock the tab into mock-catalog mode for the rest of the
// session. Default 60s — long enough to avoid hammering a freshly-crashed
// backend, short enough that a dev who fixes the server doesn't have to
// clear sessionStorage manually. The previous permanent flag was the root
// cause of the "I just restarted the key router and search is still using
// demo data" footgun.
export const API_BYPASS_STICKY_MS = 60_000

interface ApiUnreachableRecord {
    setAt: number
    reason: string
}

/**
 * Mark the search API as currently unreachable so subsequent searches in
 * this tab can skip the network call and go straight to the mock catalog.
 * The record carries a timestamp so the flag self-expires after
 * API_BYPASS_STICKY_MS — see isApiBypassStale for the read path.
 */
export function markApiUnreachable(reason: string): void {
    if (typeof window === 'undefined' || !window.sessionStorage) return
    try {
        const record: ApiUnreachableRecord = { setAt: Date.now(), reason }
        window.sessionStorage.setItem('api_unreachable', JSON.stringify(record))
    } catch (error) {
        debugWarn('[search-engine] session storage write-blocked:', error)
    }
}

/**
 * Clear the bypass flag. Called from the search-engine success path so
 * a single good API response immediately restores live-data behavior
 * without requiring the user to clear sessionStorage manually.
 */
export function clearApiUnreachable(): void {
    if (typeof window === 'undefined' || !window.sessionStorage) return
    try {
        window.sessionStorage.removeItem('api_unreachable')
    } catch (error) {
        debugWarn('[search-engine] session storage write-blocked:', error)
    }
}

/**
 * Read the stored bypass record. Returns null when no flag is set, when
 * the stored value is unreadable, or when the flag has expired. Backward
 * compat: legacy `'1'` values (pre-PR-M) are treated as expired so they
 * get a fresh timestamp on the next failure rather than locking the tab
 * forever.
 */
export function readApiUnreachable(): ApiUnreachableRecord | null {
    if (typeof window === 'undefined' || !window.sessionStorage) return null
    let raw: string | null
    try {
        raw = window.sessionStorage.getItem('api_unreachable')
    } catch (error) {
        debugWarn('[search-engine] storage disabled or forbidden in iframe:', error)
        return null
    }
    if (raw === null || raw === '') return null
    // Legacy format (pre-PR-M) was the literal string '1'. Treat as expired
    // and let the caller overwrite with a fresh timestamped record.
    if (raw === '1') return null
    try {
        const parsed = JSON.parse(raw) as ApiUnreachableRecord
        if (typeof parsed?.setAt !== 'number' || typeof parsed?.reason !== 'string') {
            return null
        }
        if (Date.now() - parsed.setAt > API_BYPASS_STICKY_MS) {
            return null
        }
        return parsed
    } catch {
        // Unparseable garbage — clear it so we don't keep failing the parse
        try {
            window.sessionStorage.removeItem('api_unreachable')
        } catch {
            /* storage disabled */
        }
        return null
    }
}

/**
 * Whether the live API should be skipped entirely. Triggered by the
 * staticOnly/offline/noApi URL params, or by a sticky sessionStorage flag
 * set the first time the API returned an unreachable response. The flag
 * expires after API_BYPASS_STICKY_MS (60s) so transient dev restarts
 * don't permanently lock the tab into mock-catalog mode.
 */
export function shouldBypassApiSearch(): boolean {
    if (typeof window === 'undefined' || !window.location) return false
    if (shouldSurfaceApiFailures()) return false
    if (readApiUnreachable() !== null) return true
    const params = new URLSearchParams(window.location.search || '')
    const bypass = params.get('staticOnly') === '1' || params.get('offline') === '1' || params.get('noApi') === '1'
    // URL params (staticOnly/offline/noApi) are an explicit, permanent bypass —
    // but they must NOT write the transient 60s sticky flag. The sticky
    // sessionStorage.api_unreachable record is only meant to capture *real*
    // API failures (the search-engine caller runs markApiUnreachable on a
    // genuine unreachable response), so that transient dev restarts don't
    // permanently lock the tab. Writing it here would let a permanent
    // url-param bypass pollute that transient flag.
    return bypass
}

/**
 * @lib/search/mock-catalog.ts — Mock catalog for development/fallback semantic search.
 *
 * Canonical home for the mock catalog previously exposed through
 * `` and its bridge.
 */

import { buildDatasetBackedMockResults } from './scoring'
import {
    MOCK_QUERY_ALIASES,
    MOCK_QUERY_NAICS_PREFIX,
    MOCK_QUERY_NAICS_DENY,
    EXPLICIT_EMPTY_QUERY_PATTERN,
    normalizeMockSearchText
} from './mock-constants'

// Re-export from mock-constants for backward compatibility
export {
    MOCK_QUERY_ALIASES,
    MOCK_QUERY_NAICS_PREFIX,
    MOCK_QUERY_NAICS_DENY,
    EXPLICIT_EMPTY_QUERY_PATTERN,
    normalizeMockSearchText
}

interface MockCatalogEntry {
    name: string
    city: string
    naics: string
    website: boolean
    email: boolean
    phone: boolean
}

export interface MockResult {
    lead_id: string
    name: string
    score: number
    provenance: string
    thread_type: string
    city: string
    naics: string
    public_note?: string
    website: boolean
    email: boolean
    phone: boolean
    isMock: boolean
}

const MOCK_CATALOG: Record<string, MockCatalogEntry[]> = {
    coffee: [
        {
            name: 'Third Gen Coffee',
            city: 'The Woodlands',
            naics: '722515 - Coffee Shops',
            website: true,
            email: true,
            phone: false
        },
        {
            name: 'Galavants Coffee',
            city: 'Conroe',
            naics: '722515 - Coffee Shops',
            website: true,
            email: false,
            phone: true
        },
        {
            name: 'Blue Door Coffee',
            city: 'Conroe',
            naics: '722515 - Coffee Shops',
            website: true,
            email: true,
            phone: true
        },
        {
            name: 'Dosey Doe Coffee',
            city: 'The Woodlands',
            naics: '722515 - Coffee Shops',
            website: true,
            email: false,
            phone: false
        },
        {
            name: 'Summer Moon Coffee',
            city: 'Magnolia',
            naics: '722515 - Coffee Shops',
            website: true,
            email: false,
            phone: true
        }
    ],
    roof: [
        {
            name: 'Conroe Roofing Co',
            city: 'Conroe',
            naics: '238160 - Roofing Contractors',
            website: true,
            email: true,
            phone: true
        },
        {
            name: 'Pine Valley Roofing',
            city: 'The Woodlands',
            naics: '238160 - Roofing Contractors',
            website: true,
            email: true,
            phone: false
        },
        {
            name: 'Lone Star Roofworks',
            city: 'Montgomery',
            naics: '238160 - Roofing Contractors',
            website: true,
            email: false,
            phone: true
        },
        {
            name: 'Magnolia Roofing Pros',
            city: 'Magnolia',
            naics: '238160 - Roofing Contractors',
            website: false,
            email: true,
            phone: true
        },
        {
            name: 'Shenandoah Roofing',
            city: 'Shenandoah',
            naics: '238160 - Roofing Contractors',
            website: true,
            email: false,
            phone: false
        }
    ],
    childcare: [
        {
            name: 'Magnolia Montessori Academy',
            city: 'Magnolia',
            naics: '624410 - Child Day Care Services',
            website: true,
            email: true,
            phone: true
        },
        {
            name: 'The Woodlands Early Learning',
            city: 'The Woodlands',
            naics: '624410 - Child Day Care Services',
            website: true,
            email: true,
            phone: false
        },
        {
            name: 'Conroe Childcare Center',
            city: 'Conroe',
            naics: '624410 - Child Day Care Services',
            website: false,
            email: true,
            phone: true
        },
        {
            name: 'Montgomery Little Stars',
            city: 'Montgomery',
            naics: '624410 - Child Day Care Services',
            website: true,
            email: false,
            phone: true
        },
        {
            name: 'Spring Branch Kids Academy',
            city: 'Spring',
            naics: '624410 - Child Day Care Services',
            website: true,
            email: true,
            phone: true
        }
    ],
    dog: [
        {
            name: 'Bark Avenue Grooming',
            city: 'Conroe',
            naics: '812910 - Pet Care Services',
            website: true,
            email: true,
            phone: true
        },
        {
            name: 'The Dog House of The Woodlands',
            city: 'The Woodlands',
            naics: '812910 - Pet Care Services',
            website: true,
            email: true,
            phone: false
        },
        {
            name: 'Paws & Claws Pet Resort',
            city: 'Magnolia',
            naics: '812910 - Pet Care Services',
            website: true,
            email: true,
            phone: true
        },
        {
            name: 'Conroe Pup Park',
            city: 'Conroe',
            naics: '812910 - Pet Care Services',
            website: false,
            email: true,
            phone: true
        },
        {
            name: 'Shenandoah Dog Lodge',
            city: 'Shenandoah',
            naics: '812910 - Pet Care Services',
            website: true,
            email: false,
            phone: true
        }
    ]
}

const MOCK_QUERY_TERMS: string[] = Object.keys(MOCK_CATALOG)

export function buildMockCatalogForQuery(query: string): MockResult[] {
    const q = (query || '').toLowerCase().trim()
    if (EXPLICIT_EMPTY_QUERY_PATTERN.test(q)) return []
    let bucket: MockCatalogEntry[] = MOCK_CATALOG.coffee!
    let matchedTerm: string | null = null
    let scoreBase = 0.95
    for (const term of MOCK_QUERY_TERMS) {
        if (q.includes(term)) {
            bucket = MOCK_CATALOG[term]!
            matchedTerm = term
            break
        }
    }
    if (!matchedTerm) {
        for (const term of MOCK_QUERY_TERMS) {
            if (q.startsWith(term) || q.split(/\s+/).some((tok) => tok === term)) {
                bucket = MOCK_CATALOG[term]!
                matchedTerm = term
                scoreBase = 0.85
                break
            }
        }
    }
    if (!matchedTerm) {
        scoreBase = 0.6
    }
    const datasetResults = buildDatasetBackedMockResults(query, matchedTerm, scoreBase)
    if (datasetResults.length) return datasetResults as MockResult[]

    return bucket.map((entry, i) => ({
        lead_id: `mock-${matchedTerm || 'generic'}-${i + 1}`,
        name: entry.name,
        score: Math.max(0.5, scoreBase - i * 0.05),
        provenance: 'Mock',
        thread_type: 'Search match',
        city: entry.city,
        naics: entry.naics,
        website: entry.website,
        email: entry.email,
        phone: entry.phone,
        isMock: true
    }))
}

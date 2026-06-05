import { buildDatasetBackedMockResults } from './semantic-search-scoring.js';

// Names are now normalized at load time by data-mapper.normalizeSlugName,
// so slug-style names from the corpus seed never reach the UI.
const MOCK_CATALOG = {
    coffee: [
        { name: 'Third Gen Coffee', city: 'The Woodlands', naics: '722515 - Coffee Shops', website: true, email: true, phone: false },
        { name: 'Galavants Coffee', city: 'Conroe', naics: '722515 - Coffee Shops', website: true, email: false, phone: true },
        { name: 'Blue Door Coffee', city: 'Conroe', naics: '722515 - Coffee Shops', website: true, email: true, phone: true },
        { name: 'Dosey Doe Coffee', city: 'The Woodlands', naics: '722515 - Coffee Shops', website: true, email: false, phone: false },
        { name: 'Summer Moon Coffee', city: 'Magnolia', naics: '722515 - Coffee Shops', website: true, email: false, phone: true }
    ],
    roof: [
        { name: 'Conroe Roofing Co', city: 'Conroe', naics: '238160 - Roofing Contractors', website: true, email: true, phone: true },
        { name: 'Pine Valley Roofing', city: 'The Woodlands', naics: '238160 - Roofing Contractors', website: true, email: true, phone: false },
        { name: 'Lone Star Roofworks', city: 'Montgomery', naics: '238160 - Roofing Contractors', website: true, email: false, phone: true },
        { name: 'Magnolia Roofing Pros', city: 'Magnolia', naics: '238160 - Roofing Contractors', website: false, email: true, phone: true },
        { name: 'Shenandoah Roofing', city: 'Shenandoah', naics: '238160 - Roofing Contractors', website: true, email: false, phone: false }
    ],
    childcare: [
        { name: 'Magnolia Montessori Academy', city: 'Magnolia', naics: '624410 - Child Day Care Services', website: true, email: true, phone: true },
        { name: 'The Woodlands Early Learning', city: 'The Woodlands', naics: '624410 - Child Day Care Services', website: true, email: true, phone: false },
        { name: 'Conroe Childcare Center', city: 'Conroe', naics: '624410 - Child Day Care Services', website: false, email: true, phone: true },
        { name: 'Montgomery Little Stars', city: 'Montgomery', naics: '624410 - Child Day Care Services', website: true, email: false, phone: true },
        { name: 'Spring Branch Kids Academy', city: 'Spring', naics: '624410 - Child Day Care Services', website: true, email: true, phone: true }
    ],
    dog: [
        { name: 'Bark Avenue Grooming', city: 'Conroe', naics: '812910 - Pet Care Services', website: true, email: true, phone: true },
        { name: 'The Dog House of The Woodlands', city: 'The Woodlands', naics: '812910 - Pet Care Services', website: true, email: true, phone: false },
        { name: 'Paws & Claws Pet Resort', city: 'Magnolia', naics: '812910 - Pet Care Services', website: true, email: true, phone: true },
        { name: 'Conroe Pup Park', city: 'Conroe', naics: '812910 - Pet Care Services', website: false, email: true, phone: true },
        { name: 'Shenandoah Dog Lodge', city: 'Shenandoah', naics: '812910 - Pet Care Services', website: true, email: false, phone: true }
    ]
};

const MOCK_QUERY_TERMS = Object.keys(MOCK_CATALOG);

export const MOCK_QUERY_ALIASES = {
    coffee: ['coffee', 'cafe', 'espresso', 'latte', 'roaster', 'bakery', 'brew'],
    roof: ['roof', 'roofing', 'roofer', 'shingle'],
    // Dropped 'learning' and 'montessori' — too broad, pulled in flight
    // schools and unrelated academies. Stick to the unambiguous terms.
    childcare: ['childcare', 'child care', 'daycare', 'day care'],
    dog: ['dog', 'pet', 'groom', 'grooming', 'paws', 'kennel']
};

// NAICS prefix per known catalog term. When a point has a NAICS code in
// `point.naics`, this is the strongest signal that the point belongs to the
// category (e.g. NAICS 624410 = Child Day Care Services). A prefix match
// wins over the text match, so an aviation school classified as cluster 12
// (Education & Childcare) but coded NAICS 611512 will not outrank a
// Montessori academy coded 624410. Records without a NAICS field still
// fall through to text matching (backwards-compat with the existing
// catalog, where every entry already has a NAICS string).
//
// Format: `point.naics` may be either "624410" or
// "624410 - Child Day Care Services"; we match on `startsWith(prefix)`.
export const MOCK_QUERY_NAICS_PREFIX = Object.freeze({
    coffee: '722515',
    roof: '238160',
    childcare: '624410',
    dog: '812910'
});

// NAICS prefix denylist per known catalog term. A record whose NAICS
// starts with any of these prefixes is *excluded* from that query's
// results, even if its name or what-text would otherwise match. This is
// the local-code defense against the upstream-data misclassification
// that produced the original "childcare returns aviation schools"
// problem: even if LeadOps tags a flight school as cluster 12 with
// NAICS 611512, the search code refuses to surface it for "childcare"
// because the NAICS prefix is on the denylist.
//
// Defense-in-depth: a record with NAICS 611512, 611710 (Educational
// Support Services), 812910 (Pet Care), etc. is not a Child Day Care
// provider, regardless of what its `what` text says.
export const MOCK_QUERY_NAICS_DENY = Object.freeze({
    childcare: ['611512', '611710', '812910', '611110', '611610'],
    dog: ['624410', '611512', '722515'],
    coffee: ['238160', '624410'],
    roof: ['722515', '624410', '812910']
});

export const EXPLICIT_EMPTY_QUERY_PATTERN = /^(?:__no_results__|none|empty|xj9k2l|nil|void|error)$/i;

export function normalizeMockSearchText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/[^a-z0-9\s]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function buildMockCatalogForQuery(query) {
    const q = (query || '').toLowerCase().trim();
    if (EXPLICIT_EMPTY_QUERY_PATTERN.test(q)) return [];
    let bucket = MOCK_CATALOG.coffee; // safe default
    let matchedTerm = null;
    let scoreBase = 0.95;
    for (const term of MOCK_QUERY_TERMS) {
        if (q.includes(term)) {
            bucket = MOCK_CATALOG[term];
            matchedTerm = term;
            break;
        }
    }
    if (!matchedTerm) {
        // Try partial / semantic-ish fallback: look at the first word
        for (const term of MOCK_QUERY_TERMS) {
            if (q.startsWith(term) || q.split(/\s+/).some((tok) => tok === term)) {
                bucket = MOCK_CATALOG[term];
                matchedTerm = term;
                scoreBase = 0.85;
                break;
            }
        }
    }
    if (!matchedTerm) {
        // Generic fallback — return one of the catalogs with a reduced score
        scoreBase = 0.6;
    }
    const datasetResults = buildDatasetBackedMockResults(query, matchedTerm, scoreBase);
    if (datasetResults.length) return datasetResults;

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
    }));
}

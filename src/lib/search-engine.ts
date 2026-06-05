/**
 * @lib/search-engine.ts — Stub search engine with mock data
 *
 * Pure TypeScript module. No Svelte, no DOM, no side effects.
 * Returns mock Montgomery County TX business results filtered by query.
 * Simulates a small network delay to exercise loading states.
 */
import type { SearchResult } from '@lib/types/state';

// ── Mock business corpus ──────────────────────────────────────────────────────

interface MockBusiness {
  id: string;
  name: string;
  index: number;
  category: string;
  snippet: string;
  keywords: string[];
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
];

// ── Search implementation ─────────────────────────────────────────────────────

/** Simulated network delay range in ms */
const MIN_DELAY_MS = 80;
const MAX_DELAY_MS = 250;

/**
 * Simple sleep that respects an AbortSignal.
 * Rejects with an AbortError if the signal fires before the timer completes.
 */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timer = setTimeout(resolve, ms);

    const onAbort = (): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Score a single mock business against a query string.
 * Returns 0 if no match, otherwise a score in (0, 1] weighted toward
 * prefix matches and exact keyword hits.
 */
function scoreBusiness(biz: MockBusiness, queryLower: string): number {
  const nameLower = biz.name.toLowerCase();

  // Exact substring in name → highest score
  if (nameLower.includes(queryLower)) {
    // Bonus for prefix match
    const prefixBonus = nameLower.startsWith(queryLower) ? 0.15 : 0;
    return 0.85 + prefixBonus;
  }

  // Keyword match — any keyword starts with or contains the query
  let keywordHits = 0;
  for (const kw of biz.keywords) {
    if (kw.startsWith(queryLower)) {
      keywordHits += 2; // prefix keyword hit counts double
    } else if (kw.includes(queryLower)) {
      keywordHits += 1;
    }
  }

  if (keywordHits === 0) {
    // Category match fallback
    if (biz.category.toLowerCase().includes(queryLower)) {
      return 0.45;
    }
    return 0;
  }

  // Scale keyword hits into (0, 0.80]
  return Math.min(0.80, 0.20 + keywordHits * 0.12);
}

/**
 * Perform a mock search against the local business corpus.
 *
 * @param query  The raw search query (will be trimmed internally).
 * @param signal An AbortSignal. If aborted mid-flight, the returned promise rejects.
 * @returns A promise resolving to a ranked array of SearchResult objects.
 *          Empty array means no matches (status should be set to 'empty' by the caller).
 */
export async function performSearch(
  query: string,
  signal: AbortSignal
): Promise<SearchResult[]> {
  const trimmed = query.trim();

  if (trimmed.length < 2) {
    return [];
  }

  // Simulate network latency
  const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
  await sleep(delay, signal);

  // Score every business in the corpus
  const queryLower = trimmed.toLowerCase();

  const scored: Array<{ biz: MockBusiness; score: number }> = [];
  for (const biz of MOCK_BUSINESSES) {
    const score = scoreBusiness(biz, queryLower);
    if (score > 0) {
      scored.push({ biz, score });
    }
  }

  // Sort by score descending, then by name for stability
  scored.sort((a, b) => b.score - a.score || a.biz.name.localeCompare(b.biz.name));

  // Map to SearchResult, capping at 10 results
  const results: SearchResult[] = scored.slice(0, 10).map(({ biz, score }) => ({
    id: biz.id,
    name: biz.name,
    index: biz.index,
    score,
    category: biz.category,
    snippet: biz.snippet
  }));

  return results;
}

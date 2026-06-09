/**
 * @lib/search-engine.ts — Real search engine for the semantic search API
 *
 * Executes live API searches against the Montgomery County business corpus and
 * falls back to local mock results if the API is unavailable.
 *
 * The mapper functions are duplicated here as pure TS to avoid importing the
 * legacy search-mapper.js which depends on state.js Proxy globals.
 */
import type { SearchResult } from '@lib/types/state';
import { debugWarn } from '@lib/utils/diagnostic-adapter';

// ── Result Mapping (pure TS, no legacy state dependency) ──────────────────────

interface RawServiceRow {
  lead_id?: string;
  name?: string;
  index?: number;
  score?: number;
  semantic_score?: number;
  category?: string;
  public_note?: string;
  public_detail?: string;
  address?: string;
  naics?: string;
  isMock?: boolean;
  [key: string]: unknown;
}

export interface SemanticSearchPayload {
  ok: boolean;
  query?: string;
  results?: unknown[];
  is_mock?: boolean;
  dev_mode?: string;
  error?: string;
  [key: string]: unknown;
}

/**
 * Extract the results array from the API payload.
 */
function getPayloadResults(payload: unknown): RawServiceRow[] {
  if (!payload || typeof payload !== 'object') return [];
  const p = payload as Record<string, unknown>;
  const raw = (p.results ?? p.data ?? []) as unknown[];
  return Array.isArray(raw) ? (raw.filter(Boolean) as RawServiceRow[]) : [];
}

/**
 * Get total matches from the payload.
 */
function getTotalMatches(
  payload: unknown,
  results: RawServiceRow[]
): number {
  if (!payload || typeof payload !== 'object') return results.length;
  const p = payload as Record<string, unknown>;
  if (typeof p.count === 'number') return p.count;
  if (typeof p.total === 'number') return p.total;
  return results.length;
}

async function fetchSemanticSearchResultsDirect(
  query: string,
  signal?: AbortSignal
): Promise<SearchResult[]> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);
  const onAbort = (): void => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const response = await fetch(
      `api.php?action=semantic_search&q=${encodeURIComponent(query)}&limit=18&offset=0`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal
      }
    );
    const responseText = await response.text();
    const trimmedText = responseText.trim();
    if (trimmedText.startsWith('<?php') || (trimmedText.includes('<?php') && trimmedText.indexOf('<?php') < 100)) {
      throw new Error('Semantic search returned raw PHP source.');
    }

    let payload: SemanticSearchPayload;
    try {
      payload = JSON.parse(responseText) as SemanticSearchPayload;
    } catch (jsonErr) {
      throw new Error('Semantic search returned invalid JSON.', { cause: jsonErr });
    }

    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || 'Semantic search is unavailable right now.');
    }

    const rawRows = getPayloadResults(payload);
    return rawRows
      .map((row, idx) => mapServiceRow(row, idx))
      .filter((r): r is SearchResult => r !== null)
      .slice(0, 18);
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Map a single raw service row to a typed SearchResult.
 * Pure function — reads only the row fields, no state dependency.
 */
function mapServiceRow(row: RawServiceRow, order: number): SearchResult | null {
  // Need at least a name or lead_id to produce a result
  if (!row || (!row.name && !row.lead_id)) return null;

  return {
    id: String(row.lead_id ?? row.name ?? `result-${order}`),
    name: String(row.name || row.lead_id || 'Unknown'),
    index: Number.isFinite(row.index) ? Number(row.index) : order,
    score: Number(row.score ?? row.semantic_score ?? 0),
    category: String(row.category ?? ''),
    snippet: String(row.public_note ?? row.public_detail ?? row.address ?? '')
  };
}

// ── Mock Fallback ─────────────────────────────────────────────────────────────

interface MockBusiness {
  id: string;
  name: string;
  index: number;
  category: string;
  snippet: string;
  keywords: string[];
}

const MOCK_BUSINESSES: readonly MockBusiness[] = [
  { id: 'b-001', name: 'Conroe Coffee Roasters', index: 42, category: 'Food & Beverage', snippet: 'Specialty coffee roasting in downtown Conroe', keywords: ['coffee', 'roasters', 'conroe', 'beverage', 'cafe'] },
  { id: 'b-002', name: 'Lone Star HVAC Solutions', index: 187, category: 'Home Services', snippet: 'Residential and commercial HVAC installation and repair', keywords: ['hvac', 'lone', 'star', 'heating', 'cooling', 'air'] },
  { id: 'b-003', name: 'The Woodlands Dental Group', index: 312, category: 'Healthcare', snippet: 'General and cosmetic dentistry serving The Woodlands area', keywords: ['dental', 'dentist', 'woodlands', 'healthcare', 'teeth'] },
  { id: 'b-004', name: 'Montgomery County Auto Body', index: 55, category: 'Automotive', snippet: 'Full-service collision repair and paint matching', keywords: ['auto', 'body', 'montgomery', 'car', 'repair', 'paint'] },
  { id: 'b-005', name: 'Cypress Creek Landscape Design', index: 203, category: 'Home Services', snippet: 'Custom landscape architecture and irrigation systems', keywords: ['landscape', 'creek', 'design', 'garden', 'irrigation'] },
  { id: 'b-006', name: 'Magnolia BBQ & Catering', index: 78, category: 'Food & Beverage', snippet: 'Texas-style barbecue with full-service catering', keywords: ['bbq', 'barbecue', 'magnolia', 'catering', 'food'] },
  { id: 'b-007', name: 'TX Legal Associates', index: 441, category: 'Professional Services', snippet: 'Business law, estate planning, and real estate closings', keywords: ['legal', 'law', 'attorney', 'tx', 'texas', 'lawyer'] },
  { id: 'b-008', name: 'Spring Community Pharmacy', index: 129, category: 'Healthcare', snippet: 'Independent pharmacy with compounding and delivery services', keywords: ['pharmacy', 'spring', 'drug', 'medication', 'health'] },
  { id: 'b-009', name: 'Conroe Construction Partners', index: 610, category: 'Construction', snippet: 'Commercial and residential general contracting', keywords: ['construction', 'conroe', 'contractor', 'builder', 'build'] },
  { id: 'b-010', name: 'Lake Conroe Marina & Boat Works', index: 24, category: 'Recreation', snippet: 'Boat storage, slip rental, and marine repair on Lake Conroe', keywords: ['marina', 'boat', 'lake', 'conroe', 'marine', 'water'] },
  { id: 'b-011', name: 'Woodlands Tech Consulting', index: 388, category: 'Professional Services', snippet: 'IT infrastructure, cloud migration, and managed services', keywords: ['tech', 'technology', 'consulting', 'woodlands', 'IT'] },
  { id: 'b-012', name: 'Piney Woods Pet Grooming', index: 95, category: 'Animal Services', snippet: 'Full grooming, boarding, and daycare for dogs and cats', keywords: ['pet', 'grooming', 'dog', 'cat', 'animal', 'piney'] },
  { id: 'b-013', name: 'Montgomery Tax Services', index: 501, category: 'Professional Services', snippet: 'Individual and business tax preparation, IRS representation', keywords: ['tax', 'taxes', 'montgomery', 'accounting', 'irs'] },
  { id: 'b-014', name: 'Greater Houston Flooring', index: 167, category: 'Home Services', snippet: 'Hardwood, tile, and luxury vinyl plank installation', keywords: ['flooring', 'floor', 'tile', 'hardwood', 'houston'] },
  { id: 'b-015', name: 'Panther Creek Urgent Care', index: 290, category: 'Healthcare', snippet: 'Walk-in clinic with X-ray and lab testing on-site', keywords: ['urgent', 'care', 'clinic', 'panther', 'medical'] },
  { id: 'b-016', name: 'Cafe Ole on the Square', index: 11, category: 'Food & Beverage', snippet: 'Tex-Mex breakfast and lunch in historic downtown Conroe', keywords: ['cafe', 'mexican', 'food', 'conroe', 'square', 'breakfast'] },
  { id: 'b-017', name: 'Woodlands Orthodontics', index: 420, category: 'Healthcare', snippet: 'Braces, Invisalign, and pediatric orthodontics', keywords: ['orthodontics', 'braces', 'invisalign', 'woodlands', 'dental'] },
  { id: 'b-018', name: 'Conroe Ace Hardware', index: 33, category: 'Retail', snippet: 'Neighborhood hardware store with paint and tool rental', keywords: ['hardware', 'ace', 'conroe', 'store', 'retail', 'paint'] },
  { id: 'b-019', name: 'Twisted T Iron Works', index: 577, category: 'Construction', snippet: 'Custom wrought iron gates, railings, and decorative metalwork', keywords: ['iron', 'wrought', 'metal', 'fence', 'gate', 'twisted'] },
  { id: 'b-020', name: 'Harvest Green Veterinary Clinic', index: 305, category: 'Animal Services', snippet: 'Full-service veterinary care with emergency hours', keywords: ['veterinary', 'vet', 'clinic', 'harvest', 'animal'] }
];

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const timer = setTimeout(resolve, ms);
    const onAbort = (): void => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); reject(new DOMException('Aborted', 'AbortError')); };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function scoreBusiness(biz: MockBusiness, queryLower: string): number {
  const nameLower = biz.name.toLowerCase();
  if (nameLower.includes(queryLower)) return 0.85 + (nameLower.startsWith(queryLower) ? 0.15 : 0);
  let keywordHits = 0;
  for (const kw of biz.keywords) {
    if (kw.startsWith(queryLower)) keywordHits += 2;
    else if (kw.includes(queryLower)) keywordHits += 1;
  }
  if (keywordHits === 0) return biz.category.toLowerCase().includes(queryLower) ? 0.45 : 0;
  return Math.min(0.80, 0.20 + keywordHits * 0.12);
}

function performMockSearch(query: string, signal: AbortSignal): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return Promise.resolve([]);
  const queryLower = trimmed.toLowerCase();
  const scored = MOCK_BUSINESSES
    .map((biz) => ({ biz, score: scoreBusiness(biz, queryLower) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.biz.name.localeCompare(b.biz.name));
  return sleep(80 + Math.random() * 170, signal).then(() =>
    scored.slice(0, 10).map(({ biz, score }) => ({
      id: biz.id,
      name: biz.name,
      index: biz.index,
      score,
      category: biz.category,
      snippet: biz.snippet
    }))
  );
}

function canUseStaticDevFallback(): boolean {
  if (typeof window === 'undefined' || !window.location) return false;
  const host = window.location.hostname;
  if (!['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(host)) return false;
  const params = new URLSearchParams(window.location.search || '');
  return params.get('staticDev') !== '0';
}

function raceWithStaticFallback<T>(
  primary: Promise<T>,
  fallback: Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const finish = (value: T): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      resolve(value);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    fallback.then(finish, () => undefined);
    primary.then(finish, () => undefined);
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialize the search engine.
 * Kept as a no-op compatibility hook for callers that previously warmed the
 * legacy search cache.
 */
export async function initSearchEngine(): Promise<void> {
  void 0;
}

/**
 * Execute a semantic search against the business corpus.
 *
 * Tries the real legacy API first. If the legacy module is unavailable
 * (static dev server, no PHP backend), falls back to local mock results.
 *
 * @param query   The raw search query string.
 * @param signal  AbortSignal for cancellation.
 * @returns A promise resolving to a ranked array of SearchResult objects.
 */
export async function performSearch(
  query: string,
  signal: AbortSignal
): Promise<SearchResult[]> {
  const trimmed = query.trim();

  if (trimmed.length < 2) {
    return [];
  }

  // Try the live API first. On localhost static-dev runs, race the API with the
  // deterministic mock fallback so unavailable PHP does not strand search state.
  const apiResults = fetchSemanticSearchResultsDirect(trimmed, signal);

  if (canUseStaticDevFallback()) {
    return raceWithStaticFallback(
      apiResults,
      performMockSearch(trimmed, signal),
      signal
    );
  }

  return apiResults;
}

/**
 * Get diagnostic info about the search engine state.
 */
export function getSearchEngineDiagnostics(): {
  canUseStaticDevFallback: boolean;
} {
  return {
    canUseStaticDevFallback: canUseStaticDevFallback()
  };
}

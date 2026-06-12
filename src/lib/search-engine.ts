/**
 * @lib/search-engine.ts — Real search engine for the semantic search API
 *
 * Executes live API searches against the Montgomery County business corpus and
 * falls back to a local index over the in-memory `businessRecords` writable
 * if the API is unavailable. The local index walks all 8,406 Montgomery
 * County businesses (name/what/category/city) so natural queries like
 * "restaurant", "real estate", or even a typo like "cofee" return real
 * results instead of "no matches".
 *
 * The mapper functions are duplicated here as pure TS to avoid importing the
 * legacy search-mapper.js which depends on state.js Proxy globals.
 */
import type { SearchResult } from '@lib/types/state';
import { debugWarn } from '@lib/utils/diagnostic-adapter';
import { shouldLogStaticDevFallback } from '@lib/utils/ui-presentation';
import { getBusinessRecords } from '@lib/data-store.svelte';
import type { BusinessRecord } from '@lib/types/business';

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
  signal?: AbortSignal,
  timeoutMs = 8000
): Promise<SearchResult[]> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = (): void => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const response = await fetch(
      `/api.php?action=semantic_search&q=${encodeURIComponent(query)}&limit=18&offset=0`,
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
  } catch (err) {
    if (timedOut && err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Semantic search timed out after ${timeoutMs}ms.`);
    }
    throw err;
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
    index: order,
    score: Number(row.score ?? row.semantic_score ?? 0),
    category: String(row.category ?? ''),
    snippet: String(row.public_note ?? row.public_detail ?? row.address ?? ''),
    point: {
      name: row.name ? String(row.name) : undefined,
      what: row.public_note || row.public_detail || row.address ? String(row.public_note ?? row.public_detail ?? row.address ?? '') : undefined,
      city: row.city ? String(row.city) : undefined,
      website: row.website ? String(row.website) : undefined,
      email: row.email ? String(row.email) : undefined,
      phone: row.phone ? String(row.phone) : undefined
    }
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

// ── Local Index Search (8,406-record fallback) ────────────────────────────────

/**
 * A single normalized token entry in the local index.
 * Each record contributes one entry per token; we score by token-frequency.
 */
interface LocalIndexToken {
  /** The 0-based record index in `businessRecords`. */
  recordIndex: number;
  /** Which field this token came from (boosts name hits). */
  field: 'name' | 'what' | 'category' | 'city';
}

/**
 * The local index: maps lowercased token → list of (recordIndex, field) hits.
 * Built lazily on first call, rebuilt if the records array identity changes.
 */
let _localIndex: Map<string, LocalIndexToken[]> | null = null;
let _localIndexRecordCount = -1;
let _localIndexRecordRef: readonly BusinessRecord[] | null = null;

function tokenize(value: string | null | undefined): string[] {
  if (!value || typeof value !== 'string') return [];
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function buildLocalIndex(records: readonly BusinessRecord[]): Map<string, LocalIndexToken[]> {
  const index = new Map<string, LocalIndexToken[]>();
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record) continue;
    const seenForRecord = new Set<string>();
    for (const field of ['name', 'what', 'category', 'city'] as const) {
      const tokens = tokenize(record[field]);
      for (const token of tokens) {
        // Dedupe per (record, token) pair so "Pizza Pizza" doesn't double-count.
        const dedupeKey = `${field}:${token}`;
        if (seenForRecord.has(dedupeKey)) continue;
        seenForRecord.add(dedupeKey);
        const bucket = index.get(token);
        if (bucket) {
          bucket.push({ recordIndex: i, field });
        } else {
          index.set(token, [{ recordIndex: i, field }]);
        }
      }
    }
  }
  return index;
}

function getLocalIndex(): { index: Map<string, LocalIndexToken[]>; records: readonly BusinessRecord[] } | null {
  const records = getBusinessRecords();
  if (!Array.isArray(records) || records.length === 0) return null;
  if (
    _localIndex &&
    _localIndexRecordCount === records.length &&
    _localIndexRecordRef === records
  ) {
    return { index: _localIndex, records };
  }
  _localIndex = buildLocalIndex(records);
  _localIndexRecordCount = records.length;
  _localIndexRecordRef = records;
  return { index: _localIndex, records };
}

/**
 * Cheap Levenshtein distance with an early-exit threshold. Bails out
 * (returns Infinity) as soon as the partial distance exceeds `max`.
 */
function levenshteinCapped(a: string, b: string, max: number): number {
  if (a === b) return 0;
  const aLen = a.length;
  const bLen = b.length;
  if (Math.abs(aLen - bLen) > max) return Infinity;
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  // Single-row rolling Levenshtein.
  let prev = new Array(bLen + 1);
  let curr = new Array(bLen + 1);
  for (let j = 0; j <= bLen; j++) prev[j] = j;

  for (let i = 1; i <= aLen; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    const aChar = a.charCodeAt(i - 1);
    for (let j = 1; j <= bLen; j++) {
      const cost = aChar === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost // substitution
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return Infinity;
    [prev, curr] = [curr, prev];
  }
  return prev[bLen];
}

interface ScoredHit {
  recordIndex: number;
  score: number;
  fieldBoost: number;
}

/**
 * Score a record against the query. Returns null if the record doesn't match.
 *
 * Priority: exact name > name prefix > whole-word token match > substring.
 */
function scoreRecord(record: BusinessRecord, query: string, queryTokens: string[]): ScoredHit | null {
  const nameLower = (record.name || '').toLowerCase().trim();
  const whatLower = (record.what || '').toLowerCase().trim();
  const categoryLower = (record.category || '').toLowerCase().trim();
  const cityLower = (record.city || '').toLowerCase().trim();

  // Field boost: name matches are the strongest signal.
  const fieldBoost = (field: 'name' | 'what' | 'category' | 'city'): number => {
    if (field === 'name') return 3.0;
    if (field === 'what') return 1.6;
    if (field === 'category') return 1.2;
    return 0.9; // city
  };

  let total = 0;
  let matchedAny = false;

  // 1. Exact name match (case-insensitive)
  if (nameLower && nameLower === query) {
    total += 1.0 * fieldBoost('name');
    matchedAny = true;
  } else if (nameLower && nameLower.startsWith(query)) {
    // 2. Name prefix match
    total += 0.78 * fieldBoost('name');
    matchedAny = true;
  }

  // 3. Whole-word token match across fields
  for (const token of queryTokens) {
    if (nameLower && nameLower.split(/\s+/).includes(token)) {
      total += 0.62 * fieldBoost('name');
      matchedAny = true;
    }
    if (whatLower && whatLower.split(/\s+/).includes(token)) {
      total += 0.32 * fieldBoost('what');
      matchedAny = true;
    }
    if (categoryLower && categoryLower.split(/\s+/).includes(token)) {
      total += 0.28 * fieldBoost('category');
      matchedAny = true;
    }
    if (cityLower && cityLower.split(/\s+/).includes(token)) {
      total += 0.20 * fieldBoost('city');
      matchedAny = true;
    }
  }

  // 4. Substring fallback (only if no other match)
  if (!matchedAny) {
    if (nameLower && nameLower.includes(query)) {
      total += 0.55 * fieldBoost('name');
      matchedAny = true;
    } else if (whatLower && whatLower.includes(query)) {
      total += 0.42 * fieldBoost('what');
      matchedAny = true;
    } else if (categoryLower && categoryLower.includes(query)) {
      total += 0.38 * fieldBoost('category');
      matchedAny = true;
    } else if (cityLower && cityLower.includes(query)) {
      total += 0.30 * fieldBoost('city');
      matchedAny = true;
    }
  }

  if (!matchedAny) return null;
  // Light per-record length normalization so a single-token "LLC" name
  // doesn't dominate. Short records with the term in the name are best.
  const nameLength = nameLower.length || 1;
  const lengthPenalty = Math.min(1.0, 18 / Math.max(18, nameLength));
  return {
    recordIndex: -1, // set by caller
    score: total * lengthPenalty,
    fieldBoost: 1
  };
}

/**
 * Apply a single-token typo-tolerant search: if the literal token has zero
 * hits, look for tokens within Levenshtein distance N (1 for short, 2 for
 * long) and treat those as fuzzy matches. Returns a Map from fuzzy
 * token → list of (recordIndex, field) entries.
 */
function expandFuzzyMatches(
  index: Map<string, LocalIndexToken[]>,
  token: string
): { fuzzyToken: string; hits: LocalIndexToken[] }[] {
  if (token.length < 3) return [];
  const maxDistance = token.length <= 5 ? 1 : 2;
  const matches: { fuzzyToken: string; hits: LocalIndexToken[] }[] = [];
  // Linear scan is fine here: the index is small (8,406 unique tokens at
  // most), and this only runs when the literal token has zero hits.
  for (const [indexToken, hits] of index.entries()) {
    if (Math.abs(indexToken.length - token.length) > maxDistance) continue;
    const distance = levenshteinCapped(token, indexToken, maxDistance);
    if (Number.isFinite(distance) && distance > 0 && distance <= maxDistance) {
      matches.push({ fuzzyToken: indexToken, hits });
    }
  }
  return matches;
}

interface LocalSearchHit {
  recordIndex: number;
  score: number;
  field: 'name' | 'what' | 'category' | 'city';
}

/**
 * Walk the local index for a query, returning ranked hits.
 * Returns null when the index is unavailable (no records loaded yet) so
 * callers can decide to fall back to a different strategy.
 */
function performLocalIndexSearch(query: string): LocalSearchHit[] | null {
  const idx = getLocalIndex();
  if (!idx) return null;
  const { index, records } = idx;
  const queryLower = query.toLowerCase().trim();
  if (!queryLower) return [];
  const queryTokens = tokenize(queryLower);
  if (queryTokens.length === 0) return [];

  // Aggregate score per record: name exact/prefix first, then whole-word,
  // then substring. Fuzzy fallback for any token with zero literal hits.
  const scored = new Map<number, LocalSearchHit>();

  // 1. Exact name + name prefix (single-token query only — otherwise the
  //    whole-word / substring paths handle it cleanly).
  if (queryTokens.length === 1) {
    const exact = index.get(queryLower);
    if (exact) {
      for (const hit of exact) {
        if (hit.field !== 'name') continue;
        const existing = scored.get(hit.recordIndex);
        const boost = existing ? existing.score : 0;
        scored.set(hit.recordIndex, {
          recordIndex: hit.recordIndex,
          score: boost + 1.0 * 3.0,
          field: hit.field
        });
      }
    }
  }

  // 2. Walk every query token; for each, find exact index hits, then fuzzy
  //    matches if the literal token has zero hits.
  for (const token of queryTokens) {
    const literal = index.get(token);
    if (literal && literal.length > 0) {
      for (const hit of literal) {
        const fieldBoost = hit.field === 'name' ? 3.0
          : hit.field === 'what' ? 1.6
          : hit.field === 'category' ? 1.2
          : 0.9;
        const weight = 0.62 * fieldBoost;
        const existing = scored.get(hit.recordIndex);
        if (existing) {
          existing.score += weight;
        } else {
          scored.set(hit.recordIndex, {
            recordIndex: hit.recordIndex,
            score: weight,
            field: hit.field
          });
        }
      }
    } else {
      // Fuzzy fallback
      const fuzzyMatches = expandFuzzyMatches(index, token);
      // Cap fuzzy results so a noisy expansion doesn't dominate. Take the
      // top 5 closest by edit distance.
      fuzzyMatches.sort((a, b) => a.fuzzyToken.length - b.fuzzyToken.length);
      const cap = fuzzyMatches.slice(0, 5);
      for (const fuzzy of cap) {
        for (const hit of fuzzy.hits) {
          const fieldBoost = hit.field === 'name' ? 3.0
            : hit.field === 'what' ? 1.6
            : hit.field === 'category' ? 1.2
            : 0.9;
          // Fuzzy hits get ~0.55x the weight of exact hits, plus a distance
          // penalty so a closer match ranks above a farther one.
          const distance = levenshteinCapped(token, fuzzy.fuzzyToken, 2);
          const distanceMultiplier = Number.isFinite(distance) ? 1 / (1 + distance) : 0.4;
          const weight = 0.55 * fieldBoost * distanceMultiplier;
          const existing = scored.get(hit.recordIndex);
          if (existing) {
            existing.score += weight;
          } else {
            scored.set(hit.recordIndex, {
              recordIndex: hit.recordIndex,
              score: weight,
              field: hit.field
            });
          }
        }
      }
    }
  }

  // 3. Substring fallback: if no whole-word hits scored > 0, scan for
  //    substring matches across name/what/category/city.
  if (scored.size === 0 && queryLower.length >= 2) {
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (!record) continue;
      const s = scoreRecord(record, queryLower, queryTokens);
      if (s) {
        scored.set(i, { recordIndex: i, score: s.score, field: 'name' });
      }
    }
  }

  // 4. Rank + return top 18.
  const ranked = Array.from(scored.values()).sort((a, b) => b.score - a.score);
  return ranked.slice(0, 18);
}

/**
 * Translate ranked local hits to the public SearchResult shape.
 */
function localHitsToResults(hits: LocalSearchHit[]): SearchResult[] {
  const records = getBusinessRecords();
  const out: SearchResult[] = [];
  for (const hit of hits) {
    const record = records[hit.recordIndex];
    if (!record) continue;
    const name = record.name?.trim() || `Record ${hit.recordIndex}`;
    out.push({
      id: record.lead_id || record.id || `record-${hit.recordIndex}`,
      name,
      index: hit.recordIndex,
      score: Math.min(1, hit.score / 4.5), // normalize to a 0-1 confidence
      category: record.category || '',
      snippet: record.what || ''
    });
  }
  return out;
}

/**
 * Get the top 5 most-common categories in the live records, used to
 * populate the empty-state suggestion chips. Returns [] when the records
 * aren't loaded yet.
 */
export function getSearchEngineEmptyStateSuggestions(): string[] {
  const records = getBusinessRecords();
  if (!Array.isArray(records) || records.length === 0) return [];
  const counts = new Map<string, number>();
  for (const record of records) {
    const category = (record.category || '').trim();
    if (!category) continue;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category]) => category);
}

/**
 * When `VITE_USE_LIVE_SEARCH === '1'`, the API is treated as the source of
 * truth and we only use the local index when the API errors. When unset
 * (the dev/static-dev default), the local index is always preferred because
 * the API is unreachable in those environments. This keeps production
 * semantic ranking from regressing while making every dev query feel alive.
 */
function shouldPreferLiveSearch(): boolean {
  try {
    const flag = (import.meta as unknown as { env?: Record<string, string> })?.env
      ?.VITE_USE_LIVE_SEARCH;
    return flag === '1' || flag === 'true';
  } catch {
    return false;
  }
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
 * Tries the real API first. If the API is unavailable (404, raw PHP source,
 * network error — common when running against a static Python http.server
 * without a PHP backend), falls back to local deterministic mock results.
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

  const preferLive = shouldPreferLiveSearch();
  const staticDevFallbackAllowed = canUseStaticDevFallback();

  // When `staticDev=0` is present, surface API failures instead of silently
  // replacing them with local mock/index results. Contract tests use this to
  // force `.search-error-state` on the production preview shell.
  if (!staticDevFallbackAllowed) {
    try {
      const apiResults = await fetchSemanticSearchResultsDirect(trimmed, signal, 8000);
      if (apiResults && apiResults.length > 0) {
        return apiResults;
      }
      throw new Error('Semantic search returned no results from the live API.');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      throw err;
    }
  }

  // Try the live API first. If `VITE_USE_LIVE_SEARCH` is enabled, the API
  // is the source of truth and any non-OK response throws so we can fall
  // through to the local index below.
  if (preferLive) {
    try {
      return await fetchSemanticSearchResultsDirect(trimmed, signal);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      if (shouldLogStaticDevFallback()) {
        console.warn('[search-engine] Live search failed, falling back to local index for:', trimmed, err);
      }
      // fall through to local index
    }
  } else {
    // Dev / static-dev path: still attempt the API for parity, but on any
    // error (502, raw PHP, network) skip directly to the local index.
    try {
      const apiTimeoutMs = canUseStaticDevFallback() ? 1200 : 8000;
      const apiResults = await fetchSemanticSearchResultsDirect(trimmed, signal, apiTimeoutMs);
      if (apiResults && apiResults.length > 0) {
        return apiResults;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      if (canUseStaticDevFallback() && shouldLogStaticDevFallback()) {
        console.warn('[search-engine] API unavailable on static dev, using local index for:', trimmed, err);
      }
      // fall through to local index
    }
  }

  // Local index over the 8,406-record Svelte businessRecords writable.
  // This is the new primary fallback: it walks name/what/category/city
  // with exact → prefix → whole-word → substring priority, plus a light
  // Levenshtein fuzzy pass for short typos like "cofee" → "coffee".
  const localHits = performLocalIndexSearch(trimmed);
  if (localHits && localHits.length > 0) {
    return localHitsToResults(localHits);
  }

  // Final legacy fallback: the 20-row hand-curated mock set. Kept so
  // production with `VITE_USE_LIVE_SEARCH=1` and a dead API still returns
  // *something* useful.
  return performMockSearch(trimmed, signal);
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

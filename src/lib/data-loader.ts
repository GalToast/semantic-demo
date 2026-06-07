/**
 * @lib/data-loader.ts — Async data fetching and parsing
 *
 * Ported from js/modules/data-loader.js and js/modules/semantic-threads.js.
 * Pure async functions — no global state mutation. Returns typed results
 * that the data-store populates into Svelte stores.
 */

import type {
  BusinessRecord,
  BusinessDataResult,
  LeadEnrichment,
  SemanticThreadBundle,
  SemanticThreadDataResult,
  SemanticNeighborEntry,
  SemanticNeighborDetail,
  LayoutManifest,
} from '@lib/types/business';
import { debugWarn } from '@lib/utils/diagnostic-adapter';
import { cleanOptionalValue } from '@lib/utils/dom-formatters';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Positional column indices matching data-schema.js DATA_COLUMNS */
const COL = {
  X: 0,
  Y: 1,
  Z: 2,
  CLUSTER: 3,
  NAME: 4,
  WHAT: 5,
  CITY: 6,
  LEAD_ID: 7,
  LAT: 8,
  LNG: 9,
  WEBSITE: 10,
  EMAIL: 11,
  PHONE: 12,
  TRIVIA: 13,
  STATUS: 14,
  NAICS: 15,
} as const;

const MAX_BUSINESS_RETRIES = 3;

const THREAD_REQUEST_URLS_REL = [
  'semantic_threads_ui.dat',
  'semantic_threads.dat',
];

const THREAD_FETCH_CONFIGS: RequestInit[] = [
  { cache: 'default' },
  { cache: 'force-cache' },
  { cache: 'reload' },
  { cache: 'no-store' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildAssetUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  return new URL(path, window.location.href).href;
}

const cleanOptional = cleanOptionalValue;

function parseFinite(value: unknown): number | null {
  const num = parseFloat(String(value));
  return Number.isFinite(num) ? num : null;
}

/**
 * Normalizes a slug-style business name to a clean display name.
 * Matches data-mapper.js normalizeSlugName.
 */
function normalizeSlugName(name: string | null): string | null {
  if (!name || typeof name !== 'string') return name;
  if (!/^(\d+-)?[a-z]+(-[a-z]+)+$/.test(name)) return name;
  name = name.replace(/^\d+-/, '');
  name = name.replace(/-/g, ' ');
  return name.replace(/\b\w/g, (c) => c.toUpperCase());
}

function cacheBustParam(): string {
  return `v=${Math.floor(Date.now() / (1000 * 60 * 60))}`;
}

function artifactNameFromUrl(url: string): string {
  try {
    return new URL(url, window.location.href).pathname.split('/').pop() || url;
  } catch {
    return url.split('?')[0] ?? url;
  }
}

// ── Business Data Loading ─────────────────────────────────────────────────────

/**
 * Fetches and parses business records from data.dat (array-of-arrays format).
 *
 * The data.dat file contains rows of positional arrays:
 *   [x, y, z, cluster, name, what, city, lead_id, lat, lng,
 *    website, email, phone, trivia, status, naics]
 *
 * Returns typed records, Float32Array position buffer, Uint16Array cluster
 * buffer, and a lead_id-to-index lookup map.
 */
export async function loadBusinessData(): Promise<BusinessDataResult> {
  const dataUrl = buildAssetUrl(`data.dat?${cacheBustParam()}`);
  const enrichmentUrl = buildAssetUrl(
    `scripts/leadEnrichment.public.json?${cacheBustParam()}`
  );

  // Fetch business records and enrichment in parallel
  const [raw, enrichment] = await Promise.all([
    fetchWithRetries(dataUrl, MAX_BUSINESS_RETRIES),
    fetchEnrichment(enrichmentUrl).catch((err) => {
      debugWarn('[data-loader] Enrichment fetch failed, continuing without it.', err);
      return null;
    }),
  ]);

  if (!raw || !Array.isArray(raw) || raw.length === 0) {
    throw new Error(
      `[data-loader] data.dat returned no records (got ${typeof raw})`
    );
  }

  const count = raw.length;
  const positionsBuffer = new Float32Array(count * 3);
  const clustersBuffer = new Uint16Array(count);
  const pointIndexByLeadId = new Map<string, number>();

  const records: BusinessRecord[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const p = raw[i] as unknown[];
    const x = parseFinite(p[COL.X]) ?? 0;
    const y = parseFinite(p[COL.Y]) ?? 0;
    const z = parseFinite(p[COL.Z]) ?? 0;
    const cluster = parseInt(String(p[COL.CLUSTER] ?? '0'), 10) || 0;

    positionsBuffer[i * 3] = x;
    positionsBuffer[i * 3 + 1] = y;
    positionsBuffer[i * 3 + 2] = z;
    clustersBuffer[i] = cluster;

    const rawName = cleanOptional(p[COL.NAME]);
    const name = normalizeSlugName(rawName);
    const leadId = cleanOptional(p[COL.LEAD_ID]) ?? '';

    records[i] = {
      id: `point-${i}`,
      lead_id: leadId,
      name: name ?? 'Unnamed business',
      what: cleanOptional(p[COL.WHAT]) ?? 'Montgomery County business',
      public_note: '',
      public_detail: '',
      status: (cleanOptional(p[COL.STATUS]) as BusinessRecord['status']) ?? 'active',
      category: '',
      cluster,
      city: cleanOptional(p[COL.CITY]) ?? 'Montgomery County',
      zip: '',
      website: cleanOptional(p[COL.WEBSITE]),
      email: cleanOptional(p[COL.EMAIL]),
      phone: cleanOptional(p[COL.PHONE]),
      lat: parseFinite(p[COL.LAT]),
      lng: parseFinite(p[COL.LNG]),
      geocoded: parseFinite(p[COL.LAT]) !== null && parseFinite(p[COL.LNG]) !== null,
    };

    if (leadId) {
      pointIndexByLeadId.set(leadId, i);
    }
  }

  checkDataBounds(positionsBuffer);

  debugWarn(
    `[data-loader] Loaded ${count.toLocaleString()} business records, ` +
    `${pointIndexByLeadId.size.toLocaleString()} with lead IDs`
  );

  return {
    records,
    positionsBuffer,
    clustersBuffer,
    pointIndexByLeadId,
    enrichment,
  };
}

// ── Semantic Thread Loading ───────────────────────────────────────────────────

/**
 * Fetches semantic thread neighbor data from semantic_threads.dat
 * (or semantic_threads_ui.dat as primary).
 *
 * The bundle contains a `nodes` object keyed by fallback lead_id,
 * each with neighbors that describe semantic relationships.
 *
 * Returns a normalized neighbor map keyed by lead_id.
 */
export async function loadSemanticThreads(): Promise<SemanticThreadDataResult> {
  const requestUrls = THREAD_REQUEST_URLS_REL.map((rel) =>
    buildAssetUrl(`${rel}?${cacheBustParam()}`)
  );

  let bundle: SemanticThreadBundle | null = null;
  let artifactName: string | null = null;
  let lastError: Error | null = null;

  // Try each URL with escalating fetch configs
  for (const url of requestUrls) {
    const name = artifactNameFromUrl(url);
    for (const config of THREAD_FETCH_CONFIGS) {
      try {
        const response = await fetch(url, config);
        if (!response.ok) {
          throw new Error(
            `[data-loader] Semantic thread artifact unavailable (${response.status})`
          );
        }
        bundle = (await response.json()) as SemanticThreadBundle;
        artifactName = name;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // Small delay between attempts within same URL
        await delay(220 * (THREAD_FETCH_CONFIGS.indexOf(config) + 1));
      }
    }
    if (bundle) break;
  }

  if (!bundle || !artifactName) {
    throw (
      lastError ??
      new Error('[data-loader] Semantic thread artifact unavailable')
    );
  }

  // Validate bundle structure
  if (!bundle.nodes || typeof bundle.nodes !== 'object') {
    throw new Error('[data-loader] Semantic thread bundle has no nodes object');
  }

  // Build normalized neighbor map
  const neighborMap = buildSemanticNeighborMap(bundle);

  debugWarn(
    `[data-loader] Loaded semantic threads: ${artifactName}, ` +
    `${neighborMap.size.toLocaleString()} node entries`
  );

  return {
    bundle,
    artifactName,
    neighborMap,
    layoutManifest: null, // loaded separately by initLayoutManifest if needed
  };
}

/**
 * Load the semantic space layout manifest for validation.
 * Non-critical — returns null on failure.
 */
export async function loadLayoutManifest(): Promise<LayoutManifest | null> {
  try {
    const url = buildAssetUrl(
      `semantic_space_layout_manifest.json?${cacheBustParam()}`
    );
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    const manifest = (await response.json()) as LayoutManifest;
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      return null;
    }
    return manifest;
  } catch {
    return null;
  }
}

// ── Internal Helpers ──────────────────────────────────────────────────────────

async function fetchWithRetries(url: string, maxAttempts: number): Promise<unknown> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      try {
        return await response.json();
      } catch (jsonErr) {
        throw new Error(
          `Invalid JSON: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`
        );
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      debugWarn(
        `[data-loader] Fetch attempt ${attempt}/${maxAttempts} failed for ${url}:`,
        lastError.message
      );
      if (attempt < maxAttempts) {
        await delay(500 * attempt);
      }
    }
  }
  throw new Error(
    `[data-loader] Failed to fetch ${url} after ${maxAttempts} attempts` +
      (lastError ? `: ${lastError.message}` : '')
  );
}

async function fetchEnrichment(url: string): Promise<Record<string, LeadEnrichment> | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = (await response.json()) as Record<string, LeadEnrichment>;
    return data;
  } catch {
    return null;
  }
}

function checkDataBounds(buffer: Float32Array): void {
  if (!buffer || buffer.length === 0) return;

  // Stride-sample the full buffer: check up to 600 floats spread evenly
  // across the entire positions array so out-of-bounds values at the end
  // of large datasets are no longer missed.
  const MAX_SAMPLES = 600;
  const totalFloats = buffer.length;
  const step = totalFloats <= MAX_SAMPLES ? 1 : Math.ceil(totalFloats / MAX_SAMPLES);
  const oobValues: Array<{ index: number; value: number }> = [];

  for (let i = 0; i < totalFloats; i += step) {
    const val = buffer[i]!;
    if (val < -0.1 || val > 1.1) {
      oobValues.push({ index: i, value: val });
    }
  }

  if (oobValues.length > 0) {
    const samples = oobValues.slice(0, 10).map(
      (o) => `  index ${o.index}: ${o.value}`
    ).join('\n');
    const more = oobValues.length > 10
      ? `\n  ...and ${oobValues.length - 10} more out-of-bounds values.`
      : '';
    debugWarn(
      `[data-loader] Positions out of bounds: ${oobValues.length} value(s) outside [0, 1]:\n` +
      `${samples}${more}\n` +
      `Expected [0, 1] range. MYCELIUM_FIELD_SCALE will cause extreme camera scaling.`
    );
  }
}

function buildSemanticNeighborMap(
  bundle: SemanticThreadBundle
): Map<string, SemanticNeighborEntry> {
  const map = new Map<string, SemanticNeighborEntry>();
  const nodes = bundle.nodes;

  for (const [fallbackLeadId, node] of Object.entries(nodes)) {
    const leadId = normalizeLeadId(node?.lead_id ?? fallbackLeadId);
    if (!leadId) continue;

    const neighbors: SemanticNeighborDetail[] = Array.isArray(node?.neighbors)
      ? node.neighbors
          .map((n) => {
            const nLeadId = normalizeLeadId(n?.lead_id);
            if (!nLeadId) return null;
            return {
              leadId: nLeadId,
              score: Number(n?.score ?? 0),
              semanticScore: Number(n?.semantic_score ?? 0),
              sameCity: Boolean(n?.same_city),
              sameStatus: Boolean(n?.same_status),
              bridgeScore: Number(n?.bridge_score ?? 0),
              signalScore: Number(n?.signal_score ?? 0),
              threadType: cleanOptional(n?.thread_type) ?? 'local_semantic_neighbor',
              relationshipRole: normalizeRole(n?.relationship_role),
              relationshipAxis: cleanOptional(n?.relationship_axis) ?? '',
              roleReason: cleanOptional(n?.role_reason) ?? '',
              reason: cleanOptional(n?.reason) ?? 'semantic neighbor',
            };
          })
          .filter((n): n is SemanticNeighborDetail => n !== null)
      : [];

    map.set(leadId, {
      leadId,
      name: node?.name ?? null,
      city: node?.city ?? null,
      status: node?.status ?? null,
      signalScore: Number(node?.signal_score ?? 0),
      neighbors,
    });
  }

  return map;
}

function normalizeLeadId(id: unknown): string | null {
  if (id === null || id === undefined) return null;
  const s = String(id).trim();
  return s.length > 0 ? s : null;
}

function normalizeRole(
  role: unknown
): 'direct' | 'support' | 'civic' | 'geometric-fallback' {
  const s = String(role ?? '').trim().toLowerCase();
  if (s === 'direct') return 'direct';
  if (s === 'support') return 'support';
  if (s === 'civic') return 'civic';
  return 'geometric-fallback';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * search-mapper.ts
 *
 * Pure functions for transforming API search results into hydrated application models.
 * Typed sibling of search-mapper.js.
 */

import { state } from '../state.ts';
import { sanitizePublicFacingNote, cleanPublicNoteText } from './utils/dom-formatters.ts';
import { isPointVisible } from './utils/geo-data.ts';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ServiceResultRow {
    lead_id?: string | number;
    name?: string;
    score?: number;
    semantic_score?: number;
    lexical_bonus?: number;
    public_note?: string;
    public_detail?: string;
    address?: string;
    naics?: string;
    isMock?: boolean;
    city?: string;
    index?: number;
}

interface Point {
    lead_id?: string | number;
    name?: string;
    what?: string;
    city?: string;
    lat?: number;
    lng?: number;
    cluster?: number;
    status?: string;
    website?: string;
    email?: string;
    phone?: string;
    visible?: boolean;
    [key: string]: unknown;
}

interface SearchResult {
    point: Point;
    index: number;
    score: number;
    semanticScore: number;
    lexicalBonus: number;
    publicNote: string;
    publicDetail: string;
    address: string;
    naics: string;
    isMock: boolean;
}

// ── Functions ──────────────────────────────────────────────────────────────

export function getSemanticSearchServiceResults(payload: { results?: ServiceResultRow[] } | null): ServiceResultRow[] {
    return Array.isArray(payload?.results) ? payload.results : [];
}

export function getSemanticSearchTotalMatches(payload: { count?: number } | null | undefined, serviceResults: ServiceResultRow[]): number {
    return Number.isFinite(Number(payload?.count)) ? Number(payload!.count) : serviceResults.length;
}

export function isNumericOnlySearchQuery(query: unknown): boolean {
    const digits = String(query || '').replace(/\D/g, '');
    return digits.length >= 3 && digits.length <= 10 && /^[\d\s\-+().#]+$/.test(String(query || '').trim());
}

export function resultMatchesNumericSearchQuery(result: { point?: Point; address?: string; publicNote?: string; publicDetail?: string; naics?: string } | null, query: unknown): boolean {
    const digits = String(query || '').replace(/\D/g, '');
    if (!digits || !result?.point) return false;
    const point = result.point;
    const exactFields = [point.lead_id, point.phone, point.lat, point.lng].map((v) => String(v || '').replace(/\D/g, ''));
    if (exactFields.some((v) => v && v.includes(digits))) return true;
    const contextualDigits = [result.address, result.publicNote, result.publicDetail, result.naics]
        .map((v) => String(v || '').replace(/\D/g, '')).filter(Boolean);
    return contextualDigits.some((v) => v.includes(digits));
}

function normalizeMockSearchText(value: unknown): string {
    return String(value || '')
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/[^a-z0-9\s]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getMockRowTerms(row: ServiceResultRow): string[] {
    const text = normalizeMockSearchText([
        row?.name,
        row?.naics,
        row?.public_note,
        row?.public_detail,
        row?.city
    ].filter(Boolean).join(' '));
    const weakTerms = new Set(['and', 'the', 'llc', 'inc', 'co', 'company', 'shops', 'services', 'local', 'business']);
    return [...new Set(text.split(/\s+/).filter((term) => term.length >= 3 && !weakTerms.has(term)))];
}

function scoreMockPointForRow(point: Point, terms: string[]): number {
    if (!point || !terms.length) return 0;
    const text = normalizeMockSearchText([
        point.name,
        point.what,
        point.city,
        point.naics,
        point.trivia
    ].filter(Boolean).join(' '));
    return terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
}

function getMockFallbackPointIndex(row: ServiceResultRow, order: number = 0): number | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = state as any;
    if (!Array.isArray(s.points) || s.points.length === 0) return null;
    const points: Point[] = s.points;
    const terms = getMockRowTerms(row);
    const hintedIndex = Number(row?.index);
    if (
        Number.isFinite(hintedIndex)
        && hintedIndex >= 0
        && hintedIndex < points.length
        && isPointVisible(hintedIndex, points, s.activeClusterFilter, s.activeFilters)
        && (!terms.length || scoreMockPointForRow(points[hintedIndex]!, terms) > 0)
    ) {
        return hintedIndex;
    }

    const visibleIndices: number[] = [];
    points.forEach((point: Point, index: number) => {
        if (point && isPointVisible(index, points, s.activeClusterFilter, s.activeFilters)) {
            visibleIndices.push(index);
        }
    });
    if (!visibleIndices.length) return null;
    const scoredIndices = terms.length
        ? visibleIndices
            .map((index) => ({ index, score: scoreMockPointForRow(points[index]!, terms) }))
            .filter((entry) => entry.score > 0)
            .sort((a, b) => b.score - a.score || a.index - b.index)
            .map((entry) => entry.index)
        : [];
    if (scoredIndices.length) {
        return scoredIndices[Math.max(0, order) % scoredIndices.length];
    }
    return visibleIndices[Math.max(0, order) % visibleIndices.length];
}

export function mapSemanticSearchServiceResult(row: ServiceResultRow, order: number = 0): SearchResult | null {
    // For mock-fallback rows, use the supplied metadata directly so the demo reads believably
    // even when data.dat has slug-style names. For real rows, look up the hydrated point.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = state as any;
    const points: Point[] = s.points;
    const isMockRow = String(row.lead_id || '').startsWith('mock-');
    let point: Point;
    let rawPointIndex: number | null | undefined;

    if (isMockRow) {
        rawPointIndex = getMockFallbackPointIndex(row, order);
        if (!(Number.isFinite(rawPointIndex) && rawPointIndex! >= 0 && rawPointIndex! < points.length)) return null;
        point = points[rawPointIndex!];
    } else {
        rawPointIndex = s.pointIndexByLeadId.get(String(row.lead_id));
        if (rawPointIndex === undefined || rawPointIndex === null) return null;
        if (!(Number.isFinite(rawPointIndex) && rawPointIndex >= 0 && rawPointIndex < points.length)) return null;
        const sourcePoint: Point | undefined = points[rawPointIndex] as Point | undefined;
        if (!sourcePoint || !isPointVisible(rawPointIndex, points, s.activeClusterFilter, s.activeFilters)) return null;
        point = (row.name && row.name !== sourcePoint.name)
            ? { ...sourcePoint, name: row.name }
            : sourcePoint;
    }

    return {
        point,
        index: rawPointIndex!,
        score: Number(row.score || row.semantic_score || 0),
        semanticScore: Number(row.semantic_score || 0),
        lexicalBonus: Number(row.lexical_bonus || 0),
        publicNote: sanitizePublicFacingNote(row.public_note || ''),
        publicDetail: sanitizePublicFacingNote(row.public_detail || ''),
        address: cleanPublicNoteText(row.address || ''),
        naics: cleanPublicNoteText(row.naics || ''),
        isMock: row.isMock === true
    };
}

export function mapSemanticSearchResults(serviceResults: ServiceResultRow[]): SearchResult[] {
    return (serviceResults || [])
        .map((row, order) => mapSemanticSearchServiceResult(row, order))
        .filter((r): r is SearchResult => r !== null);
}

function hydrateSemanticResultContext(result: SearchResult): void {
    if (!state.semanticResultContextByLeadId) state.semanticResultContextByLeadId = new Map();
    state.semanticResultContextByLeadId.set(String(result.point.lead_id), {
        lead_id: result.point.lead_id,
        name: result.point.name,
        city: result.point.city,
        status: result.point.status,
        public_note: result.publicNote,
        public_detail: result.publicDetail,
        address: result.address,
        naics: result.naics
    });
}

export function hydrateSemanticResultContexts(results: SearchResult[]): void {
    results.forEach(hydrateSemanticResultContext);
}

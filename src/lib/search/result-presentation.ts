/**
 * @lib/search/result-presentation.ts — Pure (no-DOM, no-appState) helpers
 * for rendering search result presentation strings (count lines, strength
 * labels, card classes, snippets, rank labels).
 *
 * Extracted from result-renderer.ts to separate pure presentation logic
 * from DOM-mutating functions. All functions here are deterministic:
 * same input → same output, no side effects.
 *
 * result-renderer.ts re-exports these so existing import paths are
 * preserved.
 */

import { sanitizePublicFacingNote, cleanPublicNoteText } from '../utils/dom-formatters'

// ── TYPES (re-exported from canonical source) ──────────────────────────────
// SearchResultPoint and SearchResult are now defined in
// @lib/state/types/search-types.ts — the single canonical home.
// Import for local use (function signatures) + re-export for consumers
// (search/state.ts, result-renderer.ts).
import type { SearchResultPoint, SearchResult } from '../state/types/search-types'
export type { SearchResultPoint, SearchResult }

export interface SearchRankParams {
    index: number | string | null | undefined
    order: number
    topIndex: number | null | undefined
    anchorIndex?: number | null
    exploreIndex?: number | null
}

// ── PRIVATE HELPERS ─────────────────────────────────────────────────────────

function humanizeSearchSnippetCase(value: string): string {
    const clean = cleanPublicNoteText(value)
    if (!clean) return ''
    return clean
        .toLowerCase()
        .replace(/\b([a-z])/g, (match) => match.toUpperCase())
        .replace(/\b(Llc|Lp|Ltd|Pc|Pllc|Inc)\b/g, (match) => match.toUpperCase())
}

function compactSearchSnippetText(value: string, _max: number = 128): string {
    const clean = sanitizePublicFacingNote(value)
    return clean || ''
}

function buildCategoryLocationSnippet(point: SearchResultPoint): string {
    const category = humanizeSearchSnippetCase(sanitizePublicFacingNote(point?.what || ''))
    const city = cleanPublicNoteText(point?.city || '')
    const hasUsefulCategory =
        category && !/^(local business|montgomery county business|registry or thin business record)$/i.test(category)
    if (hasUsefulCategory && city) return `${category} in ${city}.`
    if (hasUsefulCategory) return category
    if (city) return `Montgomery County business in ${city}.`
    return 'Montgomery County business.'
}

function buildOfficialSiteSnippet(note: string, point: SearchResultPoint): string {
    const category = humanizeSearchSnippetCase(sanitizePublicFacingNote(point?.what || '')).toLowerCase()
    const city = cleanPublicNoteText(point?.city || '')
    if (category && city) return `Official site confirms this ${category} in ${city}.`
    if (category) return `Official site confirms this ${category}.`
    return compactSearchSnippetText(note)
}

// ── PUBLIC PURE HELPERS ────────────────────────────────────────────────────

export function renderResultCountLine(total: number, currentVisibleCount: number, mode: string = 'initial'): string {
    if (total === 0) return ''
    if (total === 1) return '1 anchor'
    const hidden = total - currentVisibleCount
    if (mode === 'peek') {
        return `Anchor · ${hidden} more`
    }
    if (currentVisibleCount >= total) {
        return `All ${total} matches`
    }
    return `${currentVisibleCount} of ${total} · ${hidden} behind`
}

export function getSearchResultStrength(result: SearchResult | null, topScore: number): number {
    if (!Number.isFinite(topScore) || topScore <= 0) return 14
    if (!Number.isFinite(result?.score)) return 14
    return Math.max(14, Math.min(100, Math.round((result!.score / topScore) * 100)))
}

export function getSearchResultStrengthLabel(order: number, strength: number): string {
    if (order === 0) return 'Best match'
    if (strength >= 90) return 'Strong match'
    if (strength >= 75) return 'Good match'
    if (strength >= 50) return 'Related'
    return 'Broader match'
}

export function getSearchResultCardClasses(order: number, isAnchor: boolean): string {
    return ['search-result-item', order === 0 ? 'top-result' : '', isAnchor ? 'is-anchor' : 'is-secondary']
        .filter(Boolean)
        .join(' ')
}

export function buildSearchResultSnippet(result: SearchResult | null): string {
    const point: SearchResultPoint = result?.point || {}
    const rawNote = result?.publicNote || result?.publicDetail || ''
    if (!rawNote) return buildCategoryLocationSnippet(point)

    const sanitized = sanitizePublicFacingNote(rawNote)
    const lower = cleanPublicNoteText(rawNote).toLowerCase()

    if (sanitized && (sanitized !== rawNote || /^legal name:/i.test(rawNote))) {
        return sanitized
    }

    if (
        lower === 'pending research.' ||
        lower === 'pending research' ||
        lower.startsWith('no public') ||
        lower.startsWith('no verified') ||
        lower.startsWith('no verifiable') ||
        lower.startsWith('official texas comptroller') ||
        lower.startsWith('texas taxpayer record') ||
        lower.startsWith('registry-only') ||
        lower.startsWith('search for exact') ||
        lower.includes('no reliable public business contact')
    ) {
        return buildCategoryLocationSnippet(point)
    }

    if (/^official .*site identifies/i.test(rawNote) || /^official .*site confirms/i.test(rawNote)) {
        return buildOfficialSiteSnippet(rawNote, point)
    }

    return compactSearchSnippetText(rawNote)
}

export function buildSearchRankLabel({
    index,
    order,
    topIndex,
    anchorIndex = null,
    exploreIndex = null
}: SearchRankParams): string {
    if (index === null || index === undefined) return 'Match'
    if (exploreIndex !== null && exploreIndex !== undefined && index === exploreIndex) return 'Current stop'
    if (anchorIndex !== null && anchorIndex !== undefined && index === anchorIndex) {
        if (exploreIndex !== null && exploreIndex !== undefined && exploreIndex !== anchorIndex)
            return 'Original anchor'
        return 'Anchor'
    }
    if (topIndex !== null && topIndex !== undefined && index === topIndex) {
        return exploreIndex !== null && exploreIndex !== undefined && exploreIndex !== topIndex
            ? 'Original top match'
            : 'Top match'
    }
    const orderNum = Number(order)
    return orderNum === 0 ? 'Top result' : `Result ${orderNum + 1}`
}

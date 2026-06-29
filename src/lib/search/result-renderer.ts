/**
 * @lib/search/result-renderer.ts — Dedicated module for rendering search result
 * HTML and managing the result list DOM.
 *
 * Port of
 */

import { appState } from '@lib/state/app.svelte'
import { getViewportSize } from '../utils/environment'
import { isCompactSearchViewport } from '@lib/utils/ui-presentation'
import { sanitizePublicFacingNote, cleanPublicNoteText } from '../utils/dom-formatters'

// ── PRIVATE HELPERS — typed accessors (Phase 17 cast consolidation) ───────

/**
 * Some host elements carry a `_searchStateNamespace` data slot populated by
 * the search-result DOM lifecycle. The slot is optional and unstructured at
 * the DOM type level; this interface narrows what we actually read.
 */
interface SearchStateNamespacedElement {
    _searchStateNamespace?: Record<string, unknown>
}

function getSearchStateNamespace(el: HTMLElement): SearchStateNamespacedElement {
    return el as unknown as SearchStateNamespacedElement
}

// ── Types ──────────────────────────────────────────────────────────────────

interface SearchResultPoint {
    lead_id?: string | number
    name?: string
    what?: string
    city?: string
    lat?: number
    lng?: number
    cluster?: number
    status?: string
    website?: string
    email?: string
    phone?: string
    trivia?: string
    [key: string]: unknown
}

interface SearchResult {
    point: SearchResultPoint
    index: number
    score: number
    publicNote?: string
    publicDetail?: string
    [key: string]: unknown
}

interface SearchRankParams {
    index: number | string | null | undefined
    order: number
    topIndex: number | null | undefined
    anchorIndex?: number | null
    exploreIndex?: number | null
}

interface SearchSummary {
    query?: string
    anchorIndex: number | null
    topIndex: number | null | undefined
    resultIndices?: number[]
    dedupedResultCount?: number
}

// ── PRIVATE HELPERS ────────────────────────────────────────────────────────

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

// ── SEARCH RENDERERS ────────────────────────────────────────────────────────

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

export function buildSearchStageLabel(
    index: number | string | null | undefined,
    topIndex: number | null | undefined,
    anchorIndex: number | null = null,
    exploreIndex: number | null = null
): string {
    if (exploreIndex !== null && exploreIndex !== undefined && index === exploreIndex) {
        return exploreIndex === anchorIndex ? 'Centered' : 'Current stop'
    }
    if (anchorIndex !== null && anchorIndex !== undefined && index === anchorIndex) {
        if (exploreIndex !== null && exploreIndex !== undefined && exploreIndex !== anchorIndex)
            return 'Original anchor'
        return index === topIndex ? 'Anchor' : 'Centered'
    }
    if (index === topIndex) {
        return exploreIndex !== null && exploreIndex !== undefined && exploreIndex !== topIndex
            ? 'Original closest'
            : 'Closest match'
    }
    if (!appState.points) return 'Related match'
    const inBounds = Number.isFinite(index) && Number(index) >= 0 && Number(index) < appState.points.length
    const point = inBounds ? appState.points[Number(index)] : null
    if (!point) return 'Related match'
    if (
        Number.isFinite(topIndex) &&
        topIndex! >= 0 &&
        topIndex! < appState.points.length &&
        appState.points[topIndex!]?.cluster === point.cluster
    )
        return 'Same theme'
    return 'Related match'
}

// ── DOM UPDATERS ───────────────────────────────────────────────────────────

export function revealActiveSearchResultOnCompact(
    resultsEl: HTMLElement,
    activeRow: HTMLElement | null = null
): boolean {
    if (!resultsEl || !isCompactSearchViewport()) return false
    if (document.body?.dataset?.mobileSearchSheet === 'peek') return false

    const content = document.getElementById('info-panel-content')
    const row = activeRow || (resultsEl.querySelector('.search-result-item') as HTMLElement | null)
    if (!content || !row) return false

    const rowRect = row.getBoundingClientRect()
    const contentRect = content.getBoundingClientRect()
    if (!rowRect.width || !rowRect.height || !contentRect.height) return false

    const targetTop = Math.min(
        getViewportSize().height * 0.52,
        Math.max(contentRect.top + 16, contentRect.bottom - rowRect.height - 36)
    )
    const nextScrollTop = Math.max(0, content.scrollTop + rowRect.top - targetTop)
    content.scrollTo({ top: nextScrollTop, behavior: 'auto' })
    return true
}

export function clearCompactSearchResultRevealTimers(): void {
    appState.compactSearchRevealToken = (appState.compactSearchRevealToken || 0) + 1
    if (appState.compactSearchRevealTimers) {
        appState.compactSearchRevealTimers.forEach((timerId) => window.clearTimeout(timerId))
        appState.compactSearchRevealTimers = []
    }
}

export function scheduleCompactSearchResultReveal(resultsEl: HTMLElement, activeIndex: number | null = null): void {
    if (!resultsEl || !isCompactSearchViewport()) return

    clearCompactSearchResultRevealTimers()
    const token = appState.compactSearchRevealToken
    const reveal = (): void => {
        if (token !== appState.compactSearchRevealToken || !isCompactSearchViewport()) return
        const row =
            activeIndex !== null && activeIndex !== undefined
                ? (resultsEl.querySelector(
                      `.search-result-item[data-index="${CSS.escape(String(activeIndex))}"]`
                  ) as HTMLElement | null)
                : (resultsEl.querySelector(
                      '.search-result-item.active-focus, .search-result-item'
                  ) as HTMLElement | null)
        revealActiveSearchResultOnCompact(resultsEl, row)
    }

    requestAnimationFrame(() => requestAnimationFrame(reveal))
    if (!appState.compactSearchRevealTimers) appState.compactSearchRevealTimers = []
    ;[80, 240, 520].forEach((delay: number) => {
        appState.compactSearchRevealTimers.push(window.setTimeout(reveal, delay) as unknown as ReturnType<typeof setTimeout>)
    })
}

export function setActiveSearchResultRow(
    resultsEl: HTMLElement,
    activeIndex: number | null = null,
    { reveal = true }: { reveal?: boolean } = {}
): void {
    if (!resultsEl) return
    const navState = appState.navState
    const isCommittedExplore = navState?.mode === 'trail' && (navState.explorationHistoryIndices || []).length > 1
    const summaryResultIndices: number[] = Array.isArray(
        (appState.searchState.currentSearchSummary as SearchSummary | null)?.resultIndices
    )
        ? ((appState.searchState.currentSearchSummary as SearchSummary).resultIndices as number[])
        : []
    const focusedIndex = Number.isFinite(appState.focusedNode)
        ? (appState.focusedNode as number)
        : Number.isFinite(navState?.focusedIndex)
          ? (navState!.focusedIndex as number)
          : null
    const focusIsOutsideSearchTrail =
        Number.isFinite(focusedIndex) &&
        summaryResultIndices.length > 0 &&
        !summaryResultIndices.includes(focusedIndex!)
    const effectiveIndex = focusIsOutsideSearchTrail
        ? null
        : isCommittedExplore && Number.isFinite(navState?.focusedIndex)
          ? (navState!.focusedIndex as number)
          : activeIndex
    const activeKey = effectiveIndex !== null ? String(effectiveIndex) : null
    let activeRow: HTMLElement | null = null

    resultsEl.querySelectorAll('.search-result-item').forEach((row: Element) => {
        const htmlRow = row as HTMLElement
        const isActive = activeKey !== null && htmlRow.dataset.index === activeKey
        htmlRow.classList.toggle('active-focus', isActive)
        htmlRow.classList.toggle('active-explore', isActive && isCommittedExplore)
        if (isActive) {
            htmlRow.setAttribute('aria-current', 'true')
            activeRow = htmlRow
        } else {
            htmlRow.removeAttribute('aria-current')
        }
    })

    if (typeof window.refreshSearchResultHierarchy === 'function') {
        window.refreshSearchResultHierarchy(resultsEl)
    }

    if (reveal && activeRow) {
        const searchState = getSearchStateNamespace(resultsEl)._searchStateNamespace
        if (
            searchState &&
            typeof searchState.isMobileRouteFieldPeekActive === 'function' &&
            searchState.isMobileRouteFieldPeekActive()
        ) {
            return
        }
        const rowToReveal: HTMLElement = activeRow
        if (!revealActiveSearchResultOnCompact(resultsEl, rowToReveal)) {
            rowToReveal.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        }
        scheduleCompactSearchResultReveal(resultsEl, effectiveIndex)
    }
}

export function refreshSearchResultHierarchy(resultsEl: HTMLElement): void {
    if (!resultsEl || !appState.searchState.currentSearchSummary) return
    const summary: SearchSummary = appState.searchState.currentSearchSummary
    const anchorIndex = summary.anchorIndex
    const topIndex = summary.topIndex ?? null
    const navState = appState.navState
    const isCommittedExplore = navState?.mode === 'trail' && (navState.explorationHistoryIndices || []).length > 1
    const exploreIndex =
        isCommittedExplore && Number.isFinite(navState?.focusedIndex) ? (navState!.focusedIndex as number) : null

    resultsEl.querySelectorAll('.search-result-item').forEach((row: Element) => {
        const htmlRow = row as HTMLElement
        const index = Number.isFinite(+htmlRow.dataset.index!) ? +htmlRow.dataset.index! : null
        const order = Number.isFinite(+htmlRow.dataset.order!) ? +htmlRow.dataset.order! : null
        const rankEl = htmlRow.querySelector('.search-result-rank')
        const stageEl = htmlRow.querySelector('.search-result-stage')

        const isOriginAnchor =
            isCommittedExplore && anchorIndex !== null && index === anchorIndex && index !== exploreIndex
        const isOriginTop =
            isCommittedExplore &&
            topIndex !== null &&
            index === topIndex &&
            index !== exploreIndex &&
            index !== anchorIndex

        htmlRow.classList.toggle('is-origin-anchor', isOriginAnchor)
        htmlRow.classList.toggle('is-origin-top', isOriginTop)

        if (rankEl && Number.isFinite(order)) {
            rankEl.textContent = buildSearchRankLabel({ index, order: order!, topIndex, anchorIndex, exploreIndex })
        }
        if (stageEl) {
            stageEl.textContent = buildSearchStageLabel(index, topIndex, anchorIndex, exploreIndex)
        }
    })
}

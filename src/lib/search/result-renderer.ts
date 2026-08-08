/**
 * @lib/search/result-renderer.ts — DOM-mutating search result list management.
 *
 * Pure presentation helpers (renderResultCountLine, getSearchResultStrength,
 * getSearchResultStrengthLabel, getSearchResultCardClasses,
 * buildSearchResultSnippet, buildSearchRankLabel) were extracted to
 * result-presentation.ts and are re-exported here for backward compatibility.
 *
 * buildSearchStageLabel remains here because it reads appState.points
 * (state-dependent, not pure).
 *
 * Port of
 */

import { appState } from '@lib/state/app.svelte'
import { getViewportSize, prefersReducedMotion } from '../utils/environment'
import { isCompactSearchViewport } from '@lib/utils/ui-presentation'

// Re-export pure helpers + types (extracted to result-presentation.ts)
import {
    renderResultCountLine,
    getSearchResultStrength,
    getSearchResultStrengthLabel,
    getSearchResultCardClasses,
    buildSearchResultSnippet,
    buildSearchRankLabel,
    type SearchResultPoint,
    type SearchResult,
    type SearchRankParams
} from './result-presentation'

export {
    renderResultCountLine,
    getSearchResultStrength,
    getSearchResultStrengthLabel,
    getSearchResultCardClasses,
    buildSearchResultSnippet,
    buildSearchRankLabel,
    type SearchResultPoint,
    type SearchResult,
    type SearchRankParams
}

// ── TYPES (state-dependent, stays here) ────────────────────────────────────

interface SearchSummary {
    query?: string
    anchorIndex: number | null
    topIndex: number | null | undefined
    resultIndices?: number[]
    dedupedResultCount?: number
}

// ── STATE-DEPENDENT LABEL (reads appState.points) ──────────────────────────

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
        appState.compactSearchRevealTimers.push(globalThis.setTimeout(reveal, delay))
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

    refreshSearchResultHierarchy(resultsEl)

    if (reveal && activeRow) {
        const rowToReveal: HTMLElement = activeRow
        if (!revealActiveSearchResultOnCompact(resultsEl, rowToReveal)) {
            rowToReveal.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
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

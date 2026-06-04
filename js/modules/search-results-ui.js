import { state } from '../state.js'
import { publish, subscribe, EVENTS } from './event-bus.js'
import { escapeHtml } from './utils/dom-formatters.js'
import { describeCluster, isCompactSearchViewport } from './utils/ui-presentation.js'
import { setSearchContainerState, setupMobileSearchSheetToggle } from './search-panel-adapter.js'
import { recordSemanticLaneSnapshot } from './semantic-lane.js'

function syncSearchResultsA11y(resultsEl) {
    if (!resultsEl) return;
    const hasContent = resultsEl.children.length > 0;
    resultsEl.setAttribute('aria-hidden', hasContent ? 'false' : 'true');
}
import {
    buildSearchResultItemHtml,
    buildSearchLoadingMarkup,
    buildSearchErrorInlineMarkup,
    buildSearchErrorFullMarkup,
    buildSearchSuggestionChips,
    buildSearchEmptyStateMarkup,
    renderResultCountLine,
    renderResultCountLineMarkup,
    refreshSearchResultHierarchy,
    setActiveSearchResultRow,
    updateSearchTrailCue
} from './ui-renderers.js'
import { isMobileViewport } from './environment.js'

/**
 * search-results-ui.js
 *
 * DOM orchestration for the search results panel.
 * RENDERING: Delegated to search-result-renderer.js via ui-renderers facade.
 */

export function setSearchPanelState(options = {}) {
    let hasQuery = options.hasQuery
    if (typeof hasQuery !== 'boolean') {
        const input = document.getElementById('search-input')
        if (input) hasQuery = Boolean(input.value.trim())
    }
    setSearchContainerState({ ...options, hasQuery })
}

export function renderSearchResultItems(resultsEl, results, renderContext, statusEl) {
    const INITIAL_SHOW = 5
    const dedupedResults = dedupeNearDuplicateResults(results)
    const total = dedupedResults.length
    const savedCount = (() => {
        try {
            return Number.parseInt(sessionStorage.getItem('searchVisibleCount') || '0', 10)
        } catch {
            return 0
        }
    })()
    const visibleCount = Math.min(
        total,
        Math.max(INITIAL_SHOW, Number.isFinite(savedCount) && savedCount > 0 ? savedCount : INITIAL_SHOW)
    )
    const visible = dedupedResults.slice(0, visibleCount)

    const setExpandedResultState = (expanded) => {
        const isExpanded = !!expanded && total > INITIAL_SHOW
        resultsEl.classList.toggle('is-expanded', isExpanded)
        const searchContainer = resultsEl.closest?.('.search-container')
        if (searchContainer) searchContainer.classList.toggle('has-expanded-results', isExpanded)
    }

    const renderResultsMarkup = (resultSlice, currentVisibleCount) => {
        const isPeek = document.body?.dataset?.panelSurfaceDetail === 'peek'
        const mode = currentVisibleCount >= total ? 'expanded' : isPeek ? 'peek' : 'initial'
        const statusText = renderResultCountLine(total, currentVisibleCount, mode)
        const statusMarkup = renderResultCountLineMarkup(total, currentVisibleCount, mode)
        resultsEl.innerHTML = `
            <div id="search-results-count" class="search-results-count" role="status" aria-live="polite" aria-atomic="true">${statusMarkup}</div>
            <div id="search-result-list" class="search-result-list" role="list" aria-label="Search result businesses">
                ${resultSlice.map((r, i) => buildSearchResultItemHtml(r, i, renderContext)).join('')}
            </div>
        `
        resultsEl.setAttribute('aria-describedby', 'search-results-count')
        syncSearchResultsA11y(resultsEl)
        if (statusEl) statusEl.textContent = statusText
        const liveEl = document.getElementById('search-status-live')
        if (liveEl) liveEl.textContent = statusText
        return statusText
    }

    setExpandedResultState(visibleCount >= total)
    renderResultsMarkup(visible, visibleCount)
    // Persist the post-dedup count so the H1 ("Found N spots") matches what
    // the user sees in the list. The summary's resultIndices array still holds
    // the pre-dedup set (used for search-glow effects on the mycelium, which
    // is fine to keep broader than the rendered list).
    if (state.currentSearchSummary) {
        state.currentSearchSummary.dedupedResultCount = total;
    }
    setupMobileSearchSheetToggle({ isCompactSearchViewport })

    if (total > visibleCount) {
        const remaining = total - visibleCount
        const btn = document.createElement('button')
        btn.className = 'search-show-more-btn'
        btn.type = 'button'
        btn.setAttribute('aria-label', `Show ${remaining} more search results`)
        btn.setAttribute('aria-expanded', 'false')
        btn.setAttribute('aria-controls', 'search-result-list')
        btn.setAttribute('aria-describedby', 'search-results-count')
        btn.textContent = `Show ${remaining} more results`
        btn.onclick = () => {
            const nextVisibleCount = dedupedResults.length
            const firstNewIndex = visibleCount
            btn.setAttribute('aria-expanded', 'true')
            try {
                sessionStorage.setItem('searchVisibleCount', String(nextVisibleCount))
            } catch {}
            publish(EVENTS.URL_SYNC_REQUESTED, { params: { offset: null }, reason: 'search-more' })
            setExpandedResultState(true)
            renderResultsMarkup(dedupedResults.slice(0, nextVisibleCount), nextVisibleCount)
            publish(EVENTS.SEARCH_UI_SYNC_REQUESTED, { resultsEl, statusEl, results: dedupedResults, renderContext })
            refreshSearchResultHierarchy(resultsEl)
            const activeIndex =
                state.currentSearchSummary?.anchorIndex ?? renderContext.anchorIndex ?? renderContext.topIndex
            if (Number.isFinite(activeIndex)) setActiveSearchResultRow(resultsEl, activeIndex, { reveal: false })

            requestAnimationFrame(() => {
                const firstNewItem = resultsEl.querySelector(`[data-index="${dedupedResults[firstNewIndex]?.index}"]`)
                if (firstNewItem) firstNewItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
            })
        }
        resultsEl.appendChild(btn)
    }
    resultsEl.scrollTop = 0
}

// ── Dedupe near-duplicate results ───────────────────────────────────────────

/**
 * Some records in the dataset are near-duplicates of each other (e.g.
 * "BLUE Willow Coffee" and "BLUE Willow Coffee LLC") — same business,
 * different legal suffix. Without dedup, the same neighborhood/business
 * shows up as two separate results. We collapse these by normalized
 * name+city, keeping the higher-scored copy.
 */
function dedupeNearDuplicateResults(results) {
    if (!Array.isArray(results) || results.length < 2) return results;
    const seen = new Map();
    const out = [];
    for (const result of results) {
        if (!result?.point) { out.push(result); continue; }
        const key = nearDuplicateKey(result.point);
        if (!key) { out.push(result); continue; }
        if (seen.has(key)) {
            const prev = seen.get(key);
            if ((result.score || 0) > (prev.score || 0)) {
                const idx = out.indexOf(prev);
                if (idx >= 0) out[idx] = result;
                seen.set(key, result);
            }
            continue;
        }
        seen.set(key, result);
        out.push(result);
    }
    return out;
}

function nearDuplicateKey(point) {
    const name = String(point?.name || '')
        .toLowerCase()
        .replace(/\b(llc|inc|co|company|lp|pc|pllc|ltd)\b\.?/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const city = String(point?.city || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!name) return null;
    return `${name}::${city}`;
}

export function beginSemanticSearchUiState(resultsEl, statusEl, trimmedQuery) {
    const preservingSameQuery = state.currentSearchSummary?.query === trimmedQuery
    publish(EVENTS.TOOLTIP_HIDE_REQUESTED)

    const spinner = document.getElementById('search-spinner')
    if (spinner) spinner.hidden = false

    if (!preservingSameQuery) {
        clearMobileRouteFieldPeek()
        state.currentSearchSummary = null
        publish(EVENTS.COMPOSITION_UPDATED)
        state.searchAnchorIndex = null
        state.searchPreviewIndex = null

        resultsEl.classList.add('is-searching-skeleton')
        resultsEl.setAttribute('aria-busy', 'true')
        resultsEl.scrollTop = 0

        if (resultsEl.children.length === 0) {
            resultsEl.innerHTML = buildSearchLoadingMarkup()
        }
        syncSearchResultsA11y(resultsEl)
        resultsEl.hidden = false
        clearSearchGlow()
    }
    setSearchPanelState({ searching: true, focusing: false, hasQuery: true, resultsRendered: false, degraded: false })
    publish(EVENTS.COMPOSITION_UPDATED)
    resetSemanticGuideUi({ hideTrigger: true })
    statusEl.textContent = `Searching for businesses related to "${trimmedQuery}"...`
    updateSearchTrailCue({ stage: 'query' })
    resultsEl.classList.add('searching')
    publish(EVENTS.COMPOSITION_UPDATED)
}

export function updateSemanticSearchRetryState({ statusEl, trimmedQuery, attempt, nextAttempt, delayMs, retryTotal }) {
    const retryDelayLabel = delayMs >= 1000 ? `${Math.round((delayMs / 1000) * 10) / 10}s` : `${delayMs}ms`
    const preservingSameQuery = state.currentSearchSummary?.query === trimmedQuery

    recordSemanticLaneSnapshot({
        state: 'reconnecting',
        attempted_warm: true,
        query: trimmedQuery,
        provenance: {
            label: 'Search reconnecting',
            detail: 'Public semantic search is retrying while the current result rail stays visible.'
        },
        retry_source: 'search',
        retry_count: attempt,
        retry_total: retryTotal,
        retry_wait_until: new Date(Date.now() + delayMs).toISOString(),
        cooldown_wait_until: null
    })
    publish(EVENTS.SEMANTIC_LANE_STATE_REQUESTED, {
        laneState: 'reconnecting',
        options: {
            label: 'Search reconnecting',
            title: 'Public semantic search is retrying while the current result rail stays visible.'
        }
    })
    publish(EVENTS.COMPOSITION_UPDATED, { reason: 'search-retry' })

    statusEl.textContent = preservingSameQuery
        ? `Semantic search is reconnecting for "${trimmedQuery}"... keeping ${state.currentSearchSummary.visibleMatches} matches visible while retry ${nextAttempt} starts in ${retryDelayLabel}.`
        : `Semantic search is reconnecting for "${trimmedQuery}"... retry ${nextAttempt} starts in ${retryDelayLabel}.`
}

export function applySemanticSearchDegradedState(resultsEl, statusEl, trimmedQuery, _error) {
    clearMobileRouteFieldPeek()
    clearSearchPreviewHoverTimer()

    resultsEl.classList.remove('searching', 'is-searching-skeleton')
    resultsEl.setAttribute('aria-busy', 'false')
    resultsEl.classList.add('active')

    const spinner = document.getElementById('search-spinner')
    if (spinner) spinner.hidden = true

    setSearchPanelState({ searching: false, focusing: false, hasQuery: true, resultsRendered: false, degraded: true })
    publish(EVENTS.COMPOSITION_UPDATED)
    const preservingSameQuery = state.currentSearchSummary?.query === trimmedQuery
    if (!preservingSameQuery) {
        state.currentSearchSummary = null
        publish(EVENTS.COMPOSITION_UPDATED)
        clearSearchGlow()
    }

    recordSemanticLaneSnapshot({
        state: 'degraded',
        search_ok: false,
        query: trimmedQuery,
        provenance: { label: 'Search paused', detail: 'Live semantic search is recovering after client retries.' },
        rail_mode: preservingSameQuery ? 'stale' : 'none',
        retry_wait_until: null,
        cooldown_wait_until: null
    })
    publish(EVENTS.SEMANTIC_LANE_STATE_REQUESTED, {
        laneState: 'degraded',
        options: { label: 'Search paused', title: 'Live semantic search is recovering after client retries.' }
    })
    publish(EVENTS.COMPOSITION_UPDATED, { reason: 'search-degraded' })

    statusEl.textContent = preservingSameQuery
        ? `Search is still getting ready for "${trimmedQuery}". Keeping the last ${state.currentSearchSummary?.visibleMatches} matches visible.`
        : `Search paused for "${trimmedQuery}". Try again in a moment.`
    statusEl.hidden = false
    statusEl.classList.add('search-status-compact')

    const escapedQuery = escapeHtml(trimmedQuery)
    if (preservingSameQuery) {
        resultsEl.querySelector('.search-error-inline-retry')?.remove()
        resultsEl.insertAdjacentHTML('afterbegin', buildSearchErrorInlineMarkup(escapedQuery))
        const btn = resultsEl.querySelector('.search-error-inline-retry .search-error-retry-btn')
        if (btn) {
            btn.onclick = () => {
                const searchState = resultsEl._searchStateNamespace
                if (searchState) searchState.search(trimmedQuery, { preferCachedResults: false })
            }
        }
    } else {
        resultsEl.innerHTML = buildSearchErrorFullMarkup(escapedQuery)
        syncSearchResultsA11y(resultsEl)
        const retryBtn = resultsEl.querySelector('.search-error-retry-btn')
        const dismissBtn = resultsEl.querySelector('.search-error-dismiss-btn')
        const searchState = resultsEl._searchStateNamespace
        if (retryBtn && searchState)
            retryBtn.onclick = () => searchState.search(trimmedQuery, { preferCachedResults: false })
        if (dismissBtn && searchState) dismissBtn.onclick = () => searchState.clearSearch()
    }
    resultsEl.hidden = false
    publish(EVENTS.URL_SYNC_REQUESTED, { params: {}, reason: 'search-degraded' })
    resetSemanticGuideUi({ hideTrigger: true })
}

export function finishSemanticSearchSuccessState(resultsEl, trimmedQuery, cacheSource = 'network') {
    const spinner = document.getElementById('search-spinner')
    if (spinner) spinner.hidden = true

    recordSemanticLaneSnapshot({
        state: 'healthy',
        search_ok: true,
        embed_ok: true,
        attempted_warm: false,
        query: trimmedQuery,
        client_cache_source: cacheSource,
        provenance: null,
        retry_source: null,
        retry_count: null,
        retry_total: null,
        retry_wait_until: null,
        cooldown_wait_until: null
    })
    publish(EVENTS.COMPOSITION_UPDATED, { reason: 'search-success' })
    setSearchPanelState({ searching: false, focusing: false, degraded: false })
    resultsEl.classList.remove('searching', 'is-searching-skeleton')
    resultsEl.setAttribute('aria-busy', 'false')
}

export function applyEmptySemanticSearchState(resultsEl, statusEl, trimmedQuery, requestedAnchorLeadId) {
    state.currentSearchSummary = null
    publish(EVENTS.COMPOSITION_UPDATED)
    recordSemanticLaneSnapshot({
        rail_mode: 'none',
        anchor_lead_id: null,
        requested_anchor_lead_id: requestedAnchorLeadId
    })
    state.searchAnchorIndex = null
    state.searchPreviewIndex = null

    const suggestions = ['coffee', 'plumber', 'restaurant', 'healthcare', 'auto repair']
    if (state.points?.length > 0) {
        ;[0, 1, 2].forEach((c) => {
            const label = describeCluster(c).toLowerCase()
            if (!suggestions.includes(label)) suggestions.push(label)
        })
    }

    resultsEl.innerHTML = buildSearchEmptyStateMarkup(buildSearchSuggestionChips(suggestions))
    syncSearchResultsA11y(resultsEl)
    resultsEl.querySelectorAll('.search-suggestion-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
            const term = btn.dataset.suggestion
            const input = document.getElementById('search-input')
            if (input && term) {
                input.value = term
                input.dispatchEvent(new Event('input', { bubbles: true }))
            }
        })
    })

    resultsEl.hidden = false
    resultsEl.classList.add('active')
    resultsEl.classList.remove('searching', 'is-searching-skeleton')
    resultsEl.setAttribute('aria-busy', 'false')
    const spinner = document.getElementById('search-spinner')
    if (spinner) spinner.hidden = true
    setSearchPanelState({ searching: false, focusing: false, hasQuery: true, resultsRendered: true, degraded: false })
    clearSearchGlow()
    const statusText = `No matching records found for "${trimmedQuery}".`
    statusEl.textContent = statusText
    const liveEl = document.getElementById('search-status-live')
    if (liveEl) liveEl.textContent = statusText

    updateSearchTrailCue({
        beat: 'query',
        kicker: 'No results trail',
        title: `No results trail for "${trimmedQuery}"`,
        note: 'Try a concrete service, place type, or business need.',
        immediate: true
    })
    publish(EVENTS.URL_SYNC_REQUESTED, { params: {}, reason: 'search-empty' })
    resetSemanticGuideUi({ hideTrigger: true })
}

export function stopSearchVectorScramble() {
    if (state.searchVectorScrambleInterval) {
        clearInterval(state.searchVectorScrambleInterval)
        state.searchVectorScrambleInterval = null
    }
    if (state.searchVectorScrambleTimer) {
        clearTimeout(state.searchVectorScrambleTimer)
        state.searchVectorScrambleTimer = null
    }
    const overlay = document.getElementById('search-vector-scramble')
    if (overlay) {
        overlay.classList.remove('active')
        overlay.textContent = ''
    }
}

export function startSearchVectorScramble() {
    const overlay = document.getElementById('search-vector-scramble')
    if (!overlay) return
    stopSearchVectorScramble()

    const chars = '0123456789ABCDEF<>[]|{}#*@'
    const generateVector = () => {
        const length = isMobileViewport() ? 6 : 10
        const parts = Array.from({ length }, () => (Math.random() * 2 - 1).toFixed(3))
        const noise = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
        return `[${parts.join(', ')}] ${noise}`
    }

    overlay.classList.add('active')
    overlay.textContent = generateVector()

    let count = 0
    state.searchVectorScrambleInterval = setInterval(() => {
        overlay.textContent = generateVector()
        if (++count > 18) stopSearchVectorScramble()
    }, 32)

    state.searchVectorScrambleTimer = setTimeout(stopSearchVectorScramble, 800)
}

export function updateSearchPreviewOverlay(index = null) {
    state.searchPreviewIndex = Number.isFinite(index) ? index : null
    publish(EVENTS.COMPOSITION_UPDATED, { reason: 'search-preview' })
}

export function activateSearchGlow(resultIndices, anchorIndex) {
    state.searchGlowActive = true
    state.searchAnchorIndex = anchorIndex
    if (Array.isArray(resultIndices)) {
        state.searchGlowIndices = new Set(resultIndices)
    }
}

export function clearSearchGlow() {
    state.searchGlowActive = false
    state.searchAnchorIndex = null
    if (state.searchGlowIndices?.clear) state.searchGlowIndices.clear()
}

export function resetSemanticGuideUi({ hideTrigger = false } = {}) {
    if (state.semanticGuideAbortController) {
        state.semanticGuideAbortController.abort()
        state.semanticGuideAbortController = null
    }
    if (state.semanticTrailStoryAbortController) {
        state.semanticTrailStoryAbortController.abort()
        state.semanticTrailStoryAbortController = null
    }
    state.semanticGuideRequestSequence = (state.semanticGuideRequestSequence || 0) + 1
    state.semanticTrailStoryRequestSequence = (state.semanticTrailStoryRequestSequence || 0) + 1
    state.currentSemanticGuide = null
    publish(EVENTS.SUMMARY_CARD_HIDE_REQUESTED)

    if (hideTrigger) {
        const trigger = document.getElementById('synthesize-trigger')
        if (trigger) trigger.hidden = true
    }

    const titleEl = document.getElementById('summary-card-title-text')
    if (titleEl) titleEl.textContent = 'Search'
    const statusEl = document.getElementById('summary-lane-status')
    if (statusEl) statusEl.textContent = 'Ready'

    const btn = document.getElementById('btn-synthesize')
    if (btn) {
        publish(EVENTS.SEMANTIC_GUIDE_BUTTON_STATE_REQUESTED, {
            button: btn,
            mode: 'ready',
            options: { disabled: !state.currentSearchSummary }
        })
    }
}

export function clearShortSemanticSearchState(_resultsEl, _statusEl) {
    clearMobileRouteFieldPeek()
    state.currentSearchSummary = null
    setSearchPanelState({ searching: false, focusing: false, resultsRendered: false, degraded: false })
    const spinner = document.getElementById('search-spinner')
    if (spinner) spinner.hidden = true
    if (_resultsEl) {
        _resultsEl.innerHTML = ''
        _resultsEl.classList.remove('active', 'searching', 'is-searching-skeleton')
        _resultsEl.setAttribute('aria-busy', 'false')
        syncSearchResultsA11y(_resultsEl)
    }
    if (_statusEl) {
        _statusEl.textContent = 'Type to find businesses by need, place, or trade.'
        _statusEl.hidden = false
        _statusEl.classList.remove('search-status-compact')
    }
    const liveEl = document.getElementById('search-status-live')
    if (liveEl) {
        liveEl.textContent = 'Search cleared. Returning to county view.'
    }
    clearSearchGlow()
    publish(EVENTS.COMPOSITION_UPDATED)
}

export function clearSearch(options = {}) {
    const resultsEl = document.getElementById('search-results')
    const statusEl = document.getElementById('search-status')
    if (!options.preserveSearch) {
        const input = document.getElementById('search-input')
        if (input) input.value = ''
    }
    clearShortSemanticSearchState(resultsEl, statusEl)

    if (!options.skipResetFocus) {
        publish(EVENTS.SEARCH_STATE_RESET_REQUESTED, { preserveSearch: true, skipUrlSync: true })
    }

    publish(EVENTS.URL_SYNC_REQUESTED, {
        params: { q: null, anchor: null, offset: null, record: null },
        reason: 'search-clear'
    })
    publish(EVENTS.COMPOSITION_UPDATED)
}

export function startMobileRouteFieldPeek({
    resultsEl = null,
    activeIndex: _activeIndex = null,
    reason = 'search-corridor'
} = {}) {
    if (!isCompactSearchViewport() || !resultsEl) {
        clearMobileRouteFieldPeek()
        return false
    }

    clearMobileRouteFieldPeek()
    const token = (state.mobileRouteFieldPeekToken = (state.mobileRouteFieldPeekToken || 0) + 1)
    document.body.dataset.mobileRoutePeek = 'active'
    document.body.dataset.mobileRoutePeekReason = reason

    state.mobileRouteFieldPeekTimer = window.setTimeout(() => {
        if (token !== state.mobileRouteFieldPeekToken) return
        clearMobileRouteFieldPeek()
    }, state.MOBILE_ROUTE_FIELD_PEEK_MS || 1550)
    return true
}

export function clearSearchPreviewHoverTimer() {
    if (state.searchPreviewHoverTimer) {
        window.clearTimeout(state.searchPreviewHoverTimer)
        state.searchPreviewHoverTimer = null
    }
}

export function clearMobileRouteFieldPeek() {
    if (state.mobileRouteFieldPeekTimer) {
        window.clearTimeout(state.mobileRouteFieldPeekTimer)
        state.mobileRouteFieldPeekTimer = null
    }
    if (document.body) {
        delete document.body.dataset.mobileRoutePeek
        delete document.body.dataset.mobileRoutePeekReason
    }
}

export function updateSearchStatusMessage(totalMatches) {
    const statusEl = document.getElementById('search-status')
    if (!statusEl) return

    if (totalMatches === undefined) {
        if (state.currentSearchSummary) {
            totalMatches = state.currentSearchSummary.totalMatches
        } else {
            statusEl.textContent = 'Type to find businesses by need, place, or trade.'
            return
        }
    }

    const count = Number(totalMatches) || 0
    if (count === 0) {
        statusEl.textContent = 'No matching records found.'
    } else if (count === 1) {
        statusEl.textContent = '1 matching record found.'
    } else {
        statusEl.textContent = `${count.toLocaleString()} matching records found.`
    }
}

export function isMobileRouteFieldPeekActive() {
    return document.body?.dataset.mobileRoutePeek === 'active'
}

export function focusSearchInputForReplacement() {
    const input = document.getElementById('search-input')
    if (input) {
        input.focus()
        input.select()
    }
}

// Event Bus Subscriptions
subscribe(EVENTS.SEARCH_STARTED, ({ resultsEl, statusEl, query }) => {
    beginSemanticSearchUiState(resultsEl, statusEl, query)
})

subscribe(EVENTS.SEARCH_SUCCESS, ({ resultsEl, query, source }) => {
    finishSemanticSearchSuccessState(resultsEl, query, source)
})

subscribe(EVENTS.SEARCH_EMPTY, ({ resultsEl, statusEl, query, restoreAnchorLeadId }) => {
    applyEmptySemanticSearchState(resultsEl, statusEl, query, restoreAnchorLeadId)
})

subscribe(EVENTS.SEARCH_DEGRADED, ({ resultsEl, statusEl, query, error }) => {
    applySemanticSearchDegradedState(resultsEl, statusEl, query, error)
})

subscribe(EVENTS.SEARCH_CLEARED, (options = {}) => {
    clearSearchPreviewHoverTimer()
    const resultsEl = document.getElementById('search-results')
    const statusEl = document.getElementById('search-status')
    if (!options.preserveSearch) {
        const input = document.getElementById('search-input')
        if (input) input.value = ''
        clearShortSemanticSearchState(resultsEl, statusEl)
    } else {
        clearSearchGlow()
    }
})

subscribe(EVENTS.SEARCH_FOCUS_TRANSITION_STARTED, ({ resultsEl, resultIndices, targetIndex, el }) => {
    clearMobileRouteFieldPeek()
    clearSearchPreviewHoverTimer()

    resultsEl
        .querySelectorAll('.search-result-item')
        .forEach((r) => r.classList.remove('active-preview', 'active-focus', 'active-explore', 'is-processing'))

    if (el) {
        el.classList.add('is-processing', 'active-focus')
    }
    refreshSearchResultHierarchy(resultsEl)
    activateSearchGlow(resultIndices, targetIndex)
    updateSearchPreviewOverlay(targetIndex)
    setSearchPanelState({ focusing: true })
})

subscribe(EVENTS.SEARCH_FOCUS_TRANSITION_SETTLED, () => {
    setSearchPanelState({ focusing: false })
})

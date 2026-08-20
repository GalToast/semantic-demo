/**
 * @lib/focus/stage-renderer.ts — Focus stage canvas rendering
 *
 * Port of
 *
 * Provides type-checked rendering logic for the "Focus Stage" business detail
 * card and selected-card container management.
 *
 * **DOM ownership boundary (structural slot management only):**
 * This module manages visibility and metadata attributes on *structural
 * containers* declared by InfoPanelSelectionSurface.svelte:
 *   - `#selected-card` — outer card region, contentVariant/contentOwner dataset
 *   - `#selected-empty` — empty-state slot visibility
 *   - `#selected-details` — Svelte island mount-point visibility
 *   - `#selected-card-title` — panel section title text
 *   - `#vector-cascade-bg` — cascade animation background visibility
 *
 * It does NOT write to Svelte-internal child elements owned by
 * SelectedBusinessDetails.svelte (selected-name, selected-what,
 * selected-meta-strip, selected-badges, selected-facts, selected-match-panel,
 * selected-action-row, btn-selected-map, selected-theme, selected-status,
 * selected-map, selected-thread). Those are rendered declaratively by the
 * Svelte component from the `selectedPointStore`.
 */

import type { Point } from '@lib/state/state-types'
import { appState } from '@lib/state/app.svelte'
import { getPanelSurface, prefersReducedMotion } from '@lib/utils/environment'
import { DisposableRegistry } from '@lib/utils/disposable-registry'

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Resolve a point against the canonical list without relying solely on object
 * identity. Svelte 5 can proxy one side of this comparison, while lead_id is
 * the stable record key shared by the search and data-loader paths.
 */
export function resolvePointIndex(points: readonly Point[], point: Point | null): number {
    if (!point) return -1

    const directIndex = points.indexOf(point)
    if (directIndex >= 0) return directIndex

    const leadId = point.lead_id
    if (leadId === undefined || leadId === null || leadId === '') return -1

    return points.findIndex(
        (candidate) =>
            candidate?.lead_id !== undefined &&
            candidate.lead_id !== null &&
            candidate.lead_id !== '' &&
            String(candidate.lead_id) === String(leadId)
    )
}

// ── Renderers ──────────────────────────────────────────────────────────────

export function renderSignalBadges(point: Point | null): string {
    if (appState.currentView === 'map') return ''
    if (!point) return ''
    const badges: string[] = []
    if (point.website) badges.push('<span class="signal-badge meta" title="Website present">Website present</span>')
    if (point.email) badges.push('<span class="signal-badge fact" title="Email present">Email present</span>')
    if (point.phone) badges.push('<span class="signal-badge ai" title="Phone present">Phone present</span>')
    return badges.join('')
}

export function updateSelectedCardHeading(point: Point | null = null): void {
    const titleEl = document.getElementById('selected-card-title')
    if (!titleEl) return

    const activePoint = point || appState.focusState.selectedPoint || null
    const points = Array.isArray(appState.points) ? (appState.points as Point[]) : []
    const activeIndex = activePoint ? resolvePointIndex(points, activePoint) : -1
    const summary = appState.searchState.currentSearchSummary
    const resultIndices = summary && Array.isArray(summary.resultIndices) ? (summary.resultIndices as number[]) : []

    if (!activePoint) {
        titleEl.textContent = appState.currentView === 'map' ? 'Map Selection' : 'Selection'
    } else if (summary && Number.isFinite(summary.anchorIndex) && activeIndex === summary.anchorIndex) {
        titleEl.textContent = 'Search Anchor'
    } else if (resultIndices.includes(activeIndex)) {
        titleEl.textContent = 'Related Match'
    } else if (appState.currentView === 'map') {
        titleEl.textContent = 'Map Selection'
    } else {
        titleEl.textContent = 'Focused Business'
    }
}

export function renderSelectedMetaStrip(point: Point | null): void {
    void point
    // Compatibility shim: SelectedBusinessDetails.svelte owns this markup.
}

export function renderSelectedMatchPanel(point: Point | null): void {
    void point
    // Compatibility shim: SelectedBusinessDetails.svelte owns this markup.
}

export function renderSelectedActionRow(point: Point | null): void {
    void point
    // Compatibility shim: SelectedBusinessDetails.svelte owns this markup.
}

function setSurfaceHidden(el: HTMLElement | null, hidden: boolean): void {
    if (!el) return
    if (hidden) {
        el.hidden = true
        el.setAttribute('aria-hidden', 'true')
    } else {
        el.hidden = false
        el.setAttribute('aria-hidden', 'false')
    }
}

function scheduleFrame(callback: FrameRequestCallback | (() => void)): void {
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(callback as FrameRequestCallback)
        return
    }
    const reg = new DisposableRegistry({ label: 'stage-renderer-fallback' })
    reg.schedule(0, callback as () => void)
}

export function triggerSelectedCardFade(cardEl: HTMLElement): void {
    if (!cardEl) return
    if (prefersReducedMotion()) {
        cardEl.style.setProperty('--selected-card-fade-ms', '0ms')
        return
    }
    cardEl.style.setProperty('--selected-card-fade-ms', `${appState.SELECTED_CARD_FADE_MS}ms`)
    cardEl.classList.add('is-fading')
    scheduleFrame(() => {
        scheduleFrame(() => {
            cardEl.classList.remove('is-fading')
        })
    })
}

function focusStageOwnsSelectedContent(surface: string): boolean {
    return appState.currentView === 'galaxy' && ['focus', 'focus-search', 'semantic-dive'].includes(surface)
}

/**
 * Synchronize selected-card structural container visibility and metadata.
 *
 * This function is the **single authority** for structural slot visibility
 * orchestration across the selected-card surface. It manages:
 * - `#selected-card` contentVariant/contentOwner dataset + aria/inert
 * - `#selected-empty` visibility
 * - `#selected-details` visibility
 * - `#selected-card-title` visibility
 * - `#vector-cascade-bg` visibility
 *
 * journey-selected-card.js delegates container-slot toggling to this function
 * rather than doing its own DOM queries — preserving a single writer per slot.
 */
export function syncSelectedCardContentVariant(
    point: Point | null = null,
    els?: {
        cardEl?: HTMLElement | null
        emptyEl?: HTMLElement | null
        detailsEl?: HTMLElement | null
        titleEl?: HTMLElement | null
        cascadeEl?: HTMLElement | null
    }
): void {
    const cardEl = els?.cardEl ?? document.getElementById('focus-card-selected')
    const emptyEl = els?.emptyEl ?? document.getElementById('selected-empty')
    const detailsEl = els?.detailsEl ?? document.getElementById('selected-details')
    const titleEl = els?.titleEl ?? document.getElementById('selected-card-title')
    const cascadeEl = els?.cascadeEl ?? document.getElementById('vector-cascade-bg')
    const surface = getPanelSurface()
    const isFocusStageOwner = Boolean(point) && focusStageOwnsSelectedContent(surface)

    if (cardEl) {
        const isEmpty = !point
        cardEl.dataset.contentVariant = isFocusStageOwner ? 'focus-stage' : 'info-panel'
        cardEl.dataset.contentOwner = isFocusStageOwner ? 'focus-stage' : 'info-panel'
        if (isFocusStageOwner || isEmpty) {
            // Empty / focus-stage variants carry only placeholder H3s ("Business
            // Name", "Semantic Connection Path"). Inert keeps them out of the
            // heading outline and tab order until a real point is selected.
            cardEl.setAttribute('aria-hidden', 'true')
            cardEl.inert = true
        } else {
            cardEl.removeAttribute('aria-hidden')
            cardEl.inert = false
        }
    }

    if (cascadeEl) {
        const suppressCascade = isFocusStageOwner || !point
        cascadeEl.hidden = suppressCascade
        if (suppressCascade) {
            cascadeEl.classList.remove('active')
            cascadeEl.replaceChildren()
        }
    }

    if (isFocusStageOwner) {
        setSurfaceHidden(titleEl as HTMLElement | null, true)
        setSurfaceHidden(detailsEl as HTMLElement | null, true)
        if (emptyEl) setSurfaceHidden(emptyEl as HTMLElement | null, true)
        return
    }

    setSurfaceHidden(titleEl as HTMLElement | null, false)

    if (point) {
        setSurfaceHidden(detailsEl as HTMLElement | null, false)
        if (emptyEl) setSurfaceHidden(emptyEl as HTMLElement | null, true)
    } else {
        setSurfaceHidden(detailsEl as HTMLElement | null, true)
        if (emptyEl) setSurfaceHidden(emptyEl as HTMLElement | null, false)
    }
}

/**
 * Trivia surface (TRIVIA_BLOCKLIST, rejectsTrivia, getInterestingBusinessNote).
 * Canonical implementation lives in @lib/ui/renderers (Bug Sweep 33
 * enrichment-first). Re-exported here so the stage-renderer module surface
 * stays stable for existing importers/tests.
 */
export { TRIVIA_BLOCKLIST, rejectsTrivia, getInterestingBusinessNote } from '@lib/ui/renderers'

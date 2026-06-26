/**
 * @lib/stores/legend-panel.svelte.ts — Legend panel UI (build + open/close/keyboard)
 *
 * Replaces kernel (308 LOC).
 * Panel state lives in the existing `legendOpen` store (legend.svelte.ts).
 * This module provides the imperative action surface that legacy importers
 * need: open/close transitions, guide management, canvas color key, and
 * keyboard handling.
 */

import { get } from 'svelte/store'
import { legendOpen, setLegendOpen } from './legend.svelte'
import { appState } from '@lib/state/app.svelte'
import { describeCluster } from '@lib/utils/ui-presentation'
import { getSemanticGuideTitle } from '@lib/journey/semantic-guide'
import { CONFIG } from '@lib/engine/config'
import { getFilteredClusterCounts, setClusterFilter } from '@lib/orchestration/cluster-filter-controller'
import { getActiveClusterFilter } from '@lib/stores/filter.svelte'
import { subscribe, EVENTS } from '@lib/orchestration/event-bus'

type CloseLegendGuideOptions = {
    restoreFocusPanel?: boolean
    restoreFocus?: boolean
}

/** Returns true if the legend panel is currently open. */
export function isLegendPanelOpen(): boolean {
    return get(legendOpen)
}

/** Opens the legend panel. Safe to call when already open. */
export function openLegendPanel(): void {
    if (get(legendOpen)) return
    setLegendOpen(true)

    if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.classList.add('legend-panel-open')
    }

    const legendPanel = document.getElementById('legend-panel')
    if (!legendPanel) return
    legendPanel.classList.add('open')
    legendPanel.removeAttribute('hidden')
    legendPanel.setAttribute('aria-hidden', 'false')

    const legendToggle = document.getElementById('btn-legend')
    if (legendToggle) legendToggle.setAttribute('aria-expanded', 'true')

    // Focus first item for keyboard users
    const firstItem = legendPanel.querySelector('[data-legend-cluster]') as HTMLElement | null
    if (firstItem) firstItem.focus()
}

/** Closes the legend panel. Safe to call when already closed. */
export function closeLegendPanel(): void {
    if (!get(legendOpen)) return
    setLegendOpen(false)

    if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.classList.remove('legend-panel-open')
    }

    const legendPanel = document.getElementById('legend-panel')
    if (!legendPanel) return
    legendPanel.classList.remove('open')
    legendPanel.setAttribute('hidden', '')
    legendPanel.setAttribute('aria-hidden', 'true')

    const legendToggle = document.getElementById('btn-legend')
    if (legendToggle) legendToggle.setAttribute('aria-expanded', 'false')
}

/** Toggle the legend panel open/closed. */
export function toggleLegendPanel(): void {
    if (isLegendPanelOpen()) {
        closeLegendPanel()
    } else {
        openLegendPanel()
    }
}

// ── Build legend DOM (safe, no innerHTML) ───────────────────────────────────

export function buildLegend(): void {
    const legendPanel = document.getElementById('legend-panel')
    if (!legendPanel) return

    const counts = getFilteredClusterCounts()
    const rows = Array.from(counts.entries())
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])

    const guide = appState.semanticGuideState.config as Record<string, any> | null
    const guideTitle = guide ? getSemanticGuideTitle(guide) : 'Read the scene'
    const guideNote: string =
        (guide?.text as string) ||
        'Neighborhood colors group records by shared language, trade, civic role, and business texture.'
    const activeCluster = getActiveClusterFilter()

    // Clear and rebuild with DOM API (avoids innerHTML slop warning)
    legendPanel.replaceChildren()

    // ── Guide section ──────────────────────────────────────────────────────
    const guideSection = document.createElement('div')
    guideSection.className = 'legend-guide'

    const guideHead = document.createElement('div')
    guideHead.className = 'legend-guide-head'

    const kicker = document.createElement('span')
    kicker.className = 'legend-guide-kicker'
    kicker.textContent = guide?.laneStatus || 'Field Guide'
    guideHead.appendChild(kicker)

    const badge = document.createElement('span')
    badge.className = 'legend-state-badge'
    badge.textContent = activeCluster === null ? 'County overview' : 'Filtered neighborhood'
    guideHead.appendChild(badge)
    guideSection.appendChild(guideHead)

    const title = document.createElement('div')
    title.className = 'legend-guide-title'
    title.textContent = guideTitle
    guideSection.appendChild(title)

    const note = document.createElement('div')
    note.className = 'legend-guide-note'
    note.textContent = guideNote
    guideSection.appendChild(note)

    if (guide?.nextLabel) {
        const next = document.createElement('div')
        next.className = 'legend-guide-next'
        next.textContent = guide.nextLabel
        guideSection.appendChild(next)
    }
    legendPanel.appendChild(guideSection)

    // ── Lens truth ─────────────────────────────────────────────────────────
    const lensTruth = document.createElement('div')
    lensTruth.className = 'legend-lens-truth'

    const lensMark = document.createElement('span')
    lensMark.className = 'legend-lens-truth-mark'
    lensMark.setAttribute('aria-hidden', 'true')
    lensTruth.appendChild(lensMark)

    const lensText = document.createElement('span')
    lensText.textContent =
        'Glowing lines show semantic relationships; the constellation shape is staged for readability.'
    lensTruth.appendChild(lensText)
    legendPanel.appendChild(lensTruth)

    // ── Divider ──────────────────────────────────────────────────────────────
    const divider = document.createElement('div')
    divider.className = 'legend-divider'
    legendPanel.appendChild(divider)

    // ── Section title ────────────────────────────────────────────────────────
    const sectionTitle = document.createElement('div')
    sectionTitle.className = 'legend-section-title'
    sectionTitle.textContent = 'Neighborhood palette'
    legendPanel.appendChild(sectionTitle)

    const subtitle = document.createElement('div')
    subtitle.className = 'legend-subtitle'
    subtitle.textContent =
        'Semantic neighborhoods group businesses by shared language, trade, civic role & business texture'
    legendPanel.appendChild(subtitle)

    // ── Legend list ──────────────────────────────────────────────────────────
    const list = document.createElement('div')
    list.className = 'legend-list'
    list.id = 'legend-list'

    for (const [cluster, count] of rows) {
        const active = activeCluster !== null && activeCluster === cluster
        const colors = CONFIG.COLORS as string[]
        const color = colors[cluster % colors.length] || '#4ecdc4'

        const item = document.createElement('button')
        item.className = 'legend-item' + (active ? ' active' : '')
        item.type = 'button'
        item.dataset.legendCluster = String(cluster)
        item.setAttribute('aria-pressed', String(active))

        const dot = document.createElement('span')
        dot.className = 'legend-dot'
        dot.style.background = color
        item.appendChild(dot)

        const name = document.createElement('span')
        name.className = 'legend-name'
        name.textContent = describeCluster(cluster)
        item.appendChild(name)

        const countEl = document.createElement('span')
        countEl.className = 'legend-count'
        countEl.textContent = String(count)
        item.appendChild(countEl)

        list.appendChild(item)
    }
    legendPanel.appendChild(list)

    // Attach click handlers
    legendPanel.querySelectorAll('[data-legend-cluster]').forEach((item) => {
        item.addEventListener('click', () => _setClusterFilter(Number((item as HTMLElement).dataset.legendCluster)))
    })
    // Rebuild the always-visible compact key from current cluster counts.
    buildCanvasColorLegend()
}

export function updateLegendGuideState(): void {
    const guide = appState.semanticGuideState.config as Record<string, any> | null
    if (!guide) {
        if (isLegendPanelOpen()) closeLegendPanel()
        return
    }
    // F1: Don't auto-open the legend on mobile (compact) where the panel
    // would block the "Enter 3D Scene" CTA on the Placeholder2D.
    // Desktop still auto-opens for discoverability.
    if (appState.viewportIsCompact) {
        buildLegend()
        return
    }
    // Auto-open the legend panel when guide data is available (desktop only)
    if (!isLegendPanelOpen()) openLegendPanel()
    buildLegend()
}

export function closeLegendGuide(options: CloseLegendGuideOptions = {}): void {
    const legendToggle = document.getElementById('btn-legend')
    if (!isLegendPanelOpen()) return

    closeLegendPanel()

    if (options.restoreFocusPanel !== false) {
        // audit-ok: plain function, not transformed
        const infoPanel = document.querySelector('.info-panel') as HTMLElement | null
        const panelBtn = document.getElementById('btn-panel')
        restoreLegendCollapsedPanel(infoPanel, panelBtn)
    }

    if (options.restoreFocus !== false) {
        if (legendToggle) legendToggle.focus()
    }
}

export function restoreLegendCollapsedPanel(infoPanel: HTMLElement | null, panelBtn: HTMLElement | null): void {
    if (!infoPanel) return

    if (!infoPanel.classList.contains('active')) {
        infoPanel.classList.add('active')
    }
    if (panelBtn) {
        panelBtn.setAttribute('aria-expanded', 'true')
    }
}

export function setPreviouslyFocusedLegend(element: HTMLElement | null): void {
    const legendToggle = document.getElementById('btn-legend')
    if (legendToggle && element) {
        legendToggle.dataset.previousFocus = element.id || ''
    }
}

export function getPreviouslyFocusedLegend(): HTMLElement | null {
    const legendToggle = document.getElementById('btn-legend')
    if (!legendToggle || !legendToggle.dataset.previousFocus) return null
    const el = document.getElementById(legendToggle.dataset.previousFocus)
    if (el) el.focus()
    return el
}

export function buildCanvasColorLegend(): void {
    const canvas = document.getElementById('canvas-color-legend') as HTMLCanvasElement | null
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const counts = getFilteredClusterCounts()
    const dpr = window.devicePixelRatio || 1
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    const colors = CONFIG.COLORS as string[]
    const activeCluster = getActiveClusterFilter()
    let x = 0
    const total = Array.from(counts.values()).reduce((a, b) => a + b, 0) || 1

    for (const [cluster, count] of counts) {
        const color = colors[cluster % colors.length] || '#4ecdc4'
        const w = (count / total) * width
        ctx.fillStyle = color
        ctx.fillRect(x, 0, w, height)
        if (activeCluster !== null && activeCluster === cluster) {
            ctx.strokeStyle = '#ffffff'
            ctx.lineWidth = 2
            ctx.strokeRect(x + 1, 1, w - 2, height - 2)
        }
        x += w
    }
}

// ── Keyboard shortcut ───────────────────────────────────────────────────────

export function initLegendKeyboardShortcut(): () => void {
    if (typeof document === 'undefined') return () => {}

    const handler = (e: KeyboardEvent) => {
        if (e.key === 'l' && !e.metaKey && !e.ctrlKey && !e.altKey) {
            const target = e.target as HTMLElement | null
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                return
            }
            e.preventDefault()
            toggleLegendPanel()
        }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
}

/** Subscribe to nav/reset events that should close the legend. */
export function initLegendEventBusSubscriptions(): void {
    subscribe(EVENTS.VIEW_CHANGED, () => {
        setLegendOpen(false)
    })

    subscribe(EVENTS.STATE_RESET, () => {
        setLegendOpen(false)
    })
}

// ── Cluster filter click ────────────────────────────────────────────────────

function _setClusterFilter(cluster: number): void {
    setClusterFilter(cluster)
}

// ── Re-export helpers needed by legend-bindings ───────────────────────────

// restoreLegendCollapsedPanel already exported above

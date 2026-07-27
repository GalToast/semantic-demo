/**
 * @lib/journey/canvas-hover-preview.ts — DOM tooltip overlay for canvas node hovers
 *
 * The 3D canvas itself can't show HTML tooltips (no DOM rendering inside WebGL).
 * When the user hovers over a node on the canvas, this module creates and
 * positions a positioned `<div role="tooltip">` near the cursor showing:
 *   - Business name
 *   - Cluster color (matches the legend palette)
 *   - Signal score
 *   - Short cluster description
 *
 * Singleton lifecycle: one tooltip element per page. Created lazily on first
 * hover, reused across hovers, destroyed when no longer needed (e.g. on route
 * change or scene disposal).
 *
 * Accessibility:
 *   - `role="tooltip"` + `aria-hidden="true"` (the tooltip is decorative; the
 *     underlying semantic content is in the InfoPanel)
 *   - The tooltip is positioned via `position: fixed` with z-index 9999
 *   - Transitions are CSS-only (no JS animation frames)
 *
 * Cluster colors match `src/lib/utils/design-tokens.ts` SCENE_PALETTE.
 *
 * # Keyboard / AT parity (W48-B)
 *
 * Mouse hover drives the preview via pointermove. To give AT users and
 * keyboard-only users an equivalent (cluster context + signal score for the
 * focused business, not just the hovered one), we *also* subscribe to
 * `CAMERA_NODE_FOCUSED` (fired by `focusOnNode(index)`). When a business is
 * focused — via search-result Enter, click, or any path — the same preview
 * is shown, but pinned to the top-right of `#canvas-container` instead of
 * cursor-following (no cursor to follow). The `#canvas-container` element
 * has `aria-describedby="canvas-hover-preview"` so screen readers hear the
 * focused business's context when focus arrives.
 */
import { businessRecords } from '@lib/data-store'
import { get } from 'svelte/store'
import { describeCluster } from '@lib/utils/ui-presentation'
import { calculateSignalScore } from '@lib/utils/geo-data'
import { subscribeKeyed, EVENTS } from '@lib/orchestration/event-bus'
import type { BusinessRecord } from '@lib/types/business'

// Cluster colors matching the legend palette
const CLUSTER_COLORS: string[] = [
    '#4ecdc4',
    '#ff6b6b',
    '#ffd93d',
    '#6bcb77',
    '#4d96ff',
    '#ff8c42',
    '#a66cff',
    '#ff6b9d',
    '#45b7d1',
    '#96ceb4',
    '#ffeaa7',
    '#74b9ff',
    '#fd79a8',
    '#00b894',
    '#e17055'
]

let _previewEl: HTMLElement | null = null

function getPreviewElement(): HTMLElement {
    if (_previewEl) return _previewEl
    const el = document.createElement('div')
    el.id = 'canvas-hover-preview'
    el.className = 'canvas-hover-preview'
    el.setAttribute('role', 'tooltip')
    el.setAttribute('aria-hidden', 'true')
    el.style.cssText = `
    position: fixed; z-index: var(--z-max); pointer-events: none;
    opacity: 0; transform: translateY(8px) scale(0.96);
    transition: opacity 0.18s ease, transform 0.18s ease;
    max-width: 260px; padding: 0;`
    document.body.appendChild(el)
    _previewEl = el
    return el
}

function removePreviewElement(): void {
    if (_previewEl) {
        _previewEl.remove()
        _previewEl = null
    }
}

function svgIcon(pathD: string, width = 12, height = 12): SVGSVGElement {
    const ns = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(ns, 'svg')
    svg.setAttribute('width', String(width))
    svg.setAttribute('height', String(height))
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('fill', 'none')
    svg.setAttribute('stroke', 'currentColor')
    svg.setAttribute('stroke-width', '2')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('stroke-linejoin', 'round')
    svg.setAttribute('aria-hidden', 'true')
    const path = document.createElementNS(ns, 'path')
    path.setAttribute('d', pathD)
    svg.appendChild(path)
    return svg
}

function buildPreviewContent(record: BusinessRecord | null, index: number, container: HTMLElement): void {
    container.replaceChildren()
    if (!record) {
        const span = document.createElement('span')
        span.className = 'preview-name'
        span.textContent = `Business #${index}`
        container.appendChild(span)
        return
    }

    const clusterName = describeCluster(record.cluster ?? 0)
    const clusterColor = CLUSTER_COLORS[record.cluster ?? 0] ?? CLUSTER_COLORS[0]!
    const signalScore = calculateSignalScore(record as unknown as Record<string, unknown>)

    const header = document.createElement('div')
    header.className = 'preview-header'
    header.style.background = clusterColor + '20'

    const swatch = document.createElement('span')
    swatch.className = 'preview-cluster-swatch'
    swatch.style.background = clusterColor
    header.appendChild(swatch)

    const clusterLabel = document.createElement('span')
    clusterLabel.className = 'preview-cluster-label'
    clusterLabel.textContent = clusterName
    header.appendChild(clusterLabel)

    const statusDot = document.createElement('span')
    statusDot.className = 'status-dot ' + (record.status === 'active' ? 'active' : 'inactive')
    statusDot.setAttribute('aria-label', record.status === 'active' ? 'Active' : 'Inactive')
    header.appendChild(statusDot)
    container.appendChild(header)

    const body = document.createElement('div')
    body.className = 'preview-body'

    const nameEl = document.createElement('div')
    nameEl.className = 'preview-name'
    nameEl.textContent = record.name
    body.appendChild(nameEl)

    if (record.what) {
        const whatEl = document.createElement('div')
        whatEl.className = 'preview-what'
        whatEl.textContent = record.what
        body.appendChild(whatEl)
    }

    const meta = document.createElement('div')
    meta.className = 'preview-meta'

    if (record.city) {
        const cityEl = document.createElement('span')
        cityEl.className = 'preview-city'
        const pin = svgIcon('M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z M12 10a3 3 0 1 0 0 6 3 3 0 1 0 0-6', 10, 10)
        pin.style.display = 'inline-block'
        pin.style.verticalAlign = 'middle'
        pin.style.marginRight = '4px'
        cityEl.appendChild(pin)
        cityEl.appendChild(document.createTextNode(record.city))
        meta.appendChild(cityEl)
    }

    const contactIcons = document.createElement('span')
    contactIcons.className = 'preview-contact'
    if (record.website) {
        const icon = document.createElement('span')
        icon.className = 'contact-icon'
        icon.title = 'Has website'
        icon.appendChild(
            svgIcon(
                'M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20z M2 12h20 M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'
            )
        )
        contactIcons.appendChild(icon)
    }
    if (record.email) {
        const icon = document.createElement('span')
        icon.className = 'contact-icon'
        icon.title = 'Has email'
        icon.appendChild(svgIcon('M2 5h20v14H2z M2 5l10 7 10-7'))
        contactIcons.appendChild(icon)
    }
    if (record.phone) {
        const icon = document.createElement('span')
        icon.className = 'contact-icon'
        icon.title = 'Has phone'
        icon.appendChild(
            svgIcon(
                'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.3 12.3 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.3 12.3 0 0 0 2.81.7A2 2 0 0 1 22 16.92z'
            )
        )
        contactIcons.appendChild(icon)
    }
    if (contactIcons.children.length > 0) meta.appendChild(contactIcons)
    body.appendChild(meta)

    const signal = document.createElement('div')
    signal.className = 'preview-signal'
    const signalLabel = document.createElement('span')
    signalLabel.className = 'signal-label'
    signalLabel.textContent = 'Match strength'
    signal.appendChild(signalLabel)
    const bars = document.createElement('span')
    bars.className = 'signal-bars'
    const barCount = Math.min(5, Math.max(1, Math.round(signalScore)))
    bars.textContent = '▪'.repeat(barCount) + '▫'.repeat(5 - barCount)
    bars.setAttribute('aria-label', `Match strength ${barCount} of 5`)
    signal.appendChild(bars)
    body.appendChild(signal)
    container.appendChild(body)
}

export function showCanvasHoverPreview(index: number, screenX: number, screenY: number): void {
    const records = get(businessRecords)
    const record = records[index] ?? null
    const el = getPreviewElement()
    buildPreviewContent(record, index, el)
    el.style.opacity = '1'
    el.style.transform = 'translateY(0) scale(1)'
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth,
        vh = window.innerHeight
    let left = screenX + 16,
        top = screenY + 16
    if (left + rect.width > vw - 8) left = screenX - rect.width - 8
    if (top + rect.height > vh - 8) top = screenY - rect.height - 8
    if (left < 8) left = 8
    if (top < 8) top = 8
    el.style.left = `${left}px`
    el.style.top = `${top}px`
    el.setAttribute('aria-hidden', 'false')
}

export function hideCanvasHoverPreview(): void {
    if (!_previewEl) return
    _previewEl.style.opacity = '0'
    _previewEl.style.transform = 'translateY(8px) scale(0.96)'
    _previewEl.setAttribute('aria-hidden', 'true')
}

/**
 * W48-B: show the preview for the FOCUSED business (no cursor — pinned to
 * the top-right of `#canvas-container`). Triggered by `focusOnNode(index)`
 * via the `CAMERA_NODE_FOCUSED` event subscription in
 * `initCanvasHoverPreviewSubscription()` below.
 *
 * Reuses the same DOM element + content builder as the cursor-following
 * `showCanvasHoverPreview(index, x, y)`. The only differences:
 *   1. Position: top-right of canvas-container instead of near cursor
 *   2. Animation state: same fade-in/out as the cursor variant
 *   3. The aria-hidden flips to false, so AT users focusing the canvas hear
 *      the content via `aria-describedby` on `#canvas-container`.
 */
export function showCanvasHoverPreviewForFocused(index: number): void {
    const records = get(businessRecords)
    const record = records[index] ?? null
    const el = getPreviewElement()
    buildPreviewContent(record, index, el)
    el.style.opacity = '1'
    el.style.transform = 'translateY(0) scale(1)'

    // Pin to top-right of canvas-container (or viewport top-right if the
    // container isn't found — e.g., during route changes). Reset the
    // cursor-style `left` to `auto` so the previous `left` value doesn't
    // conflict with the new `right` value.
    const container = document.getElementById('canvas-container')
    const containerRect = container?.getBoundingClientRect()
    el.style.left = 'auto'
    el.style.right = '16px'
    if (containerRect) {
        el.style.top = `${Math.max(16, containerRect.top + 16)}px`
    } else {
        el.style.top = '16px'
    }
    el.setAttribute('aria-hidden', 'false')
}

// ── Focused-business subscription (W48-B) ──────────────────────────────────────────

let _focusUnsub: (() => void) | null = null

/**
 * Subscribe to `CAMERA_NODE_FOCUSED` so keyboard / AT users get the same
 * cluster-context preview that mouse users get on hover. Wired by
 * `initAdapters()` in `src/lib/orchestration/adapters.ts` alongside the
 * other engine-kernel adapters; torn down by `destroyCanvasHoverPreview()`.
 *
 * The event payload carries `index: number | null` — `null` clears the focus,
 * so we hide the preview. A defined `index` shows the preview pinned to the
 * canvas-container's top-right (no cursor to follow for keyboard users).
 */
export function initCanvasHoverPreviewSubscription(): void {
    if (_focusUnsub) return
    _focusUnsub = subscribeKeyed(
        'canvas-hover-preview:focused-business',
        EVENTS.CAMERA_NODE_FOCUSED,
        ({ index }: { index?: unknown; point?: unknown }) => {
            if (typeof index === 'number' && Number.isFinite(index)) {
                showCanvasHoverPreviewForFocused(index)
            } else {
                hideCanvasHoverPreview()
            }
        }
    )
}

export function destroyCanvasHoverPreview(): void {
    if (_focusUnsub) {
        _focusUnsub()
        _focusUnsub = null
    }
    removePreviewElement()
}

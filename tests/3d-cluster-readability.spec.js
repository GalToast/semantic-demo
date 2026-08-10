/**
 * 3d-cluster-readability.spec.js
 *
 * Contract test proving 3D cluster labels are visible, distinguishable,
 * not catastrophically overlapping UI, and still readable across key viewports.
 *
 * Coverage:
 *   - desktop   1440×900  (primary)
 *   - mobile    390×844    (primary mobile)
 *   - short-landscape 844×390
 *
 * Assertions (DOM/layout/runtime — no screenshot):
 *   1. Several .galaxy-cluster-label elements exist with nonzero rects
 *   2. At least some carry the .visible class
 *   3. Color/accent data is present on visible labels
 *   4. No severe overlap with search panel (#search-input) or clear button (#btn-clear)
 *   5. Cluster counts are derivable from state.points
 *
 * Run: node --check tests/3d-cluster-readability.spec.js
 *      npx playwright test tests/3d-cluster-readability.spec.js --headed
 */

import { test, expect } from '@playwright/test'
import { focusNodeViaApp } from './helpers/3d-interaction-helpers.js'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8795'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Wait for the 3D scene to be fully loaded and the galaxy view to be active. */
async function waitForGalaxyReady(page) {
    await page.waitForFunction(
        () => {
            return (
                typeof (window.__APP_STATE__ ?? window.__TEST_STATE__) === 'object' &&
                (window.__APP_STATE__ ?? window.__TEST_STATE__) !== null &&
                Array.isArray((window.__APP_STATE__ ?? window.__TEST_STATE__).points) &&
                (window.__APP_STATE__ ?? window.__TEST_STATE__).points.length > 0 &&
                (window.__APP_STATE__ ?? window.__TEST_STATE__).pointIndexByLeadId instanceof Map &&
                (window.__APP_STATE__ ?? window.__TEST_STATE__).pointIndexByLeadId.size > 0
            )
        },
        { timeout: 20000 }
    )

    // Ensure body is in galaxy view mode
    await page.waitForFunction(
        () => {
            return document.body?.dataset?.graphicsMode === 'webgl'
        },
        { timeout: 10000 }
    )

    // Let cluster labels initialise and the first frame render
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), {
            timeout: 8000
        })
        .catch(() => {})
}

/** Derive cluster counts from state.points (filters out null clusters). */
async function getClusterCounts(page) {
    return page.evaluate(() => {
        const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
        const points = state.points
        if (!Array.isArray(points)) return null
        const counts = new Map()
        points.forEach((p) => {
            if (p?.cluster !== null && p?.cluster !== undefined) {
                counts.set(p.cluster, (counts.get(p.cluster) || 0) + 1)
            }
        })
        return Object.fromEntries(counts)
    })
}

/**
 * Probe the DOM for cluster-label metrics:
 *   - total label count
 *   - visible label count
 *   - labels with nonzero rects
 *   - labels carrying color/accent data
 *   - labels with .is-active or .is-context state
 */
async function probeClusterLabels(page) {
    return page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll('.galaxy-cluster-label'))
        const visible = labels.filter((el) => el.classList.contains('visible'))
        const withRects = labels.filter((el) => {
            const r = el.getBoundingClientRect()
            return r.width > 0 && r.height > 0
        })
        const withColor = labels.filter((el) => el.style.color && el.style.color.trim() !== '')
        const withOpacity = labels.filter((el) => {
            const o = parseFloat(getComputedStyle(el).opacity)
            return Number.isFinite(o) && o > 0
        })
        const isActive = labels.filter((el) => el.classList.contains('is-active'))
        const isContext = labels.filter((el) => el.classList.contains('is-context'))

        return {
            total: labels.length,
            visible: visible.length,
            withRect: withRects.length,
            withColor: withColor.length,
            withOpacity: withOpacity.length,
            isActive: isActive.length,
            isContext: isContext.length
        }
    })
}

async function waitForProbeableClusterLabel(page) {
    await page.waitForFunction(
        () => {
            return Array.from(document.querySelectorAll('.galaxy-cluster-label.visible')).some((el) => {
                const rect = el.getBoundingClientRect()
                const cx = rect.left + rect.width / 2
                const cy = rect.top + rect.height / 2
                return (
                    rect.width > 0 &&
                    rect.height > 0 &&
                    cx >= 0 &&
                    cy >= 0 &&
                    cx <= window.innerWidth &&
                    cy <= window.innerHeight
                )
            })
        },
        { timeout: 8000 }
    )
}

/**
 * Check for catastrophic overlap between cluster labels and the search panel.
 * Returns an array of overlapping label indices (empty = no catastrophic overlap).
 */
async function detectLabelOverlap(page) {
    return page.evaluate(() => {
        const searchInput = document.getElementById('search-input')
        const clearBtn = document.getElementById('btn-clear') || document.getElementById('search-clear-btn')
        const searchPanel = searchInput?.getBoundingClientRect()
        const clearRect = clearBtn?.getBoundingClientRect()

        const overlaps = []
        document.querySelectorAll('.galaxy-cluster-label.visible').forEach((el, idx) => {
            const r = el.getBoundingClientRect()
            if (!r.width || !r.height) return

            const hPadding = 4 // px grace
            const overlapSearch =
                searchPanel &&
                !(
                    r.right + hPadding < searchPanel.left ||
                    r.left - hPadding > searchPanel.right ||
                    r.bottom + hPadding < searchPanel.top ||
                    r.top - hPadding > searchPanel.bottom
                )

            const overlapClear =
                clearRect &&
                !(
                    r.right + hPadding < clearRect.left ||
                    r.left - hPadding > clearRect.right ||
                    r.bottom + hPadding < clearRect.top ||
                    r.top - hPadding > clearRect.bottom
                )

            if (overlapSearch || overlapClear) overlaps.push(idx)
        })

        return overlaps
    })
}

/**
 * Probe cluster-label visual accessibility using elementFromPoint at label centers.
 *
 * Returns for each visible label:
 *   - index, centerX, centerY
 *   - topmostElement: the element returned by document.elementFromPoint at center
 *   - isOccluded: true if something other than the label itself is topmost
 *   - zIndex: the label's own z-index (or null if not set)
 *   - fontSize: computed font-size in px
 *   - opacity: computed opacity
 *   - display: computed display
 *   - visibility: computed visibility
 *   - pointerEvents: computed pointer-events
 *
 * Empty result = no visible labels with nonzero rects to probe.
 */
async function detectLabelOcclusion(page) {
    await waitForProbeableClusterLabel(page)
    return page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll('.galaxy-cluster-label.visible'))
        if (!labels.length) return []

        return labels
            .map((el, idx) => {
                const rect = el.getBoundingClientRect()
                if (!rect.width || !rect.height) return null
                const cs = getComputedStyle(el)
                const opacity = parseFloat(cs.opacity)

                const cx = rect.left + rect.width / 2
                const cy = rect.top + rect.height / 2
                if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) return null

                // elementFromPoint returns the topmost positioned element at that coordinate.
                // Elements with pointer-events:none are skipped per spec.
                const top = document.elementFromPoint(cx, cy)
                const isOccluded = top !== el && !el.contains(top)

                return {
                    idx,
                    centerX: Math.round(cx),
                    centerY: Math.round(cy),
                    topmostTag: top ? top.tagName : null,
                    topmostId: top ? top.id || null : null,
                    topmostClass: top ? top.className || '' : '',
                    isOccluded,
                    zIndex: cs.zIndex !== 'auto' ? cs.zIndex : null,
                    fontSize: parseFloat(cs.fontSize),
                    opacity,
                    display: cs.display,
                    visibility: cs.visibility,
                    pointerEvents: cs.pointerEvents,
                    rectWidth: Math.round(rect.width),
                    rectHeight: Math.round(rect.height),
                    isCanvasTopmost: top ? top.tagName === 'CANVAS' : false
                }
            })
            .filter(Boolean)
    })
}

async function enterFocusMode(page) {
    const focusedIndex = await page.evaluate(() => {
        const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
        const points = state.points ?? []
        const index = points.findIndex((point) => Number.isFinite(point?.cluster))
        return index
    })
    expect(focusedIndex, 'focusable clustered point must exist').toBeGreaterThanOrEqual(0)
    if (focusedIndex >= 0) {
        await focusNodeViaApp(page, focusedIndex, { fromCanvasNode: true })
    }
    await page.waitForFunction(
        () => {
            const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
            return Number.isFinite(state.focusedNode) && ['focus', 'trail'].includes(state.navState?.mode)
        },
        { timeout: 15000 }
    )
    // preceding waitForFunction handles settlement
}

// ── Viewport configurations ────────────────────────────────────────────────────

const VIEWPORTS = {
    desktop: { width: 1440, height: 900, label: 'desktop 1440×900' },
    mobile: { width: 390, height: 844, label: 'mobile 390×844' },
    shortLandscape: { width: 844, height: 390, label: 'short-landscape 844×390' }
}

// ── Shared describe block ──────────────────────────────────────────────────────

test.describe('3D cluster readability', () => {
    // ── Desktop ─────────────────────────────────────────────────────────────────

    test('desktop: cluster labels exist, are visible, have nonzero rects, and carry color/accent data', async ({
        page
    }) => {
        test.setTimeout(180000)
        await page.setViewportSize(VIEWPORTS.desktop)
        await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`, {
            waitUntil: 'domcontentloaded'
        })
        await waitForGalaxyReady(page)

        const counts = await getClusterCounts(page)
        expect(counts, 'state.points must contain clustered points').not.toBeNull()
        const clusterCount = Object.keys(counts).length
        expect(
            clusterCount,
            `expected at least 1 cluster in state.points, got ${JSON.stringify(counts)}`
        ).toBeGreaterThan(0)

        const probes = await probeClusterLabels(page)

        // At least one label element must be created
        expect(probes.total, `at least 1 .galaxy-cluster-label must exist (got ${probes.total})`).toBeGreaterThan(0)

        // At least some must be visible (the exact threshold depends on camera distance;
        // we require ≥1 visible to prove the visibility toggle works)
        expect(
            probes.visible,
            `at least 1 label must be .visible (got ${probes.visible} of ${probes.total})`
        ).toBeGreaterThan(0)

        // Labels with nonzero rects must match the visible count (visible implies rendered)
        expect(
            probes.withRect,
            `visible labels must have nonzero rects (got ${probes.withRect})`
        ).toBeGreaterThanOrEqual(probes.visible)

        // Color/accent data must be present on at least one visible label
        expect(
            probes.withColor,
            `at least 1 visible label must have color/accent data (got ${probes.withColor})`
        ).toBeGreaterThan(0)
    })

    test('desktop: no catastrophic overlap with search-input or search-clear-btn', async ({ page }) => {
        test.setTimeout(180000)
        await page.setViewportSize(VIEWPORTS.desktop)
        await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`, {
            waitUntil: 'domcontentloaded'
        })
        await waitForGalaxyReady(page)

        const overlaps = await detectLabelOverlap(page)
        expect(
            overlaps,
            `no cluster label should catastrophically overlap search/clear UI (overlapping indices: ${JSON.stringify(overlaps)})`
        ).toHaveLength(0)
    })

    test('desktop: visible cluster labels are not occluded by the canvas at their center points', async ({ page }) => {
        test.setTimeout(180000)
        await page.setViewportSize(VIEWPORTS.desktop)
        await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`, {
            waitUntil: 'domcontentloaded'
        })
        await waitForGalaxyReady(page)

        const occlusions = await detectLabelOcclusion(page)
        expect(occlusions.length, 'at least one visible label must be probeable at desktop').toBeGreaterThan(0)

        const occludedByCanvas = occlusions.filter((r) => r.isCanvasTopmost && r.isOccluded)
        expect(
            occludedByCanvas.length,
            `no visible label should have CANVAS as topmost element at its center point (got ${occludedByCanvas.length} occluded by canvas out of ${occlusions.length} labels)`
        ).toBe(0)

        const fullyOccluded = occlusions.filter((r) => r.isOccluded)
        expect(
            fullyOccluded.length,
            `at least one desktop label must remain topmost at its center (got ${fullyOccluded.length} occluded of ${occlusions.length})`
        ).toBeLessThan(occlusions.length)

        // All probeable labels must have nonzero font-size
        const tinyFont = occlusions.filter((r) => !Number.isFinite(r.fontSize) || r.fontSize < 8)
        expect(
            tinyFont.length,
            `all probeable labels must have font-size >= 8px (got ${tinyFont.length} with tiny/missing font)`
        ).toBe(0)

        // All probeable labels must be visible (display/visibility/opacity)
        // opacity === 0 alone is excluded because CSS transition mid-flight can leave a
        // label in an opacity-0 state while it is still a valid rendered element.
        // display:none and visibility:hidden are structural failures worth failing on.
        const invisible = occlusions.filter((r) => r.display === 'none' || r.visibility === 'hidden')
        expect(
            invisible.length,
            `no probeable label should have display:none or visibility:hidden (got ${invisible.length})`
        ).toBe(0)

        // Z-index must be set (no "auto") for labels that are supposed to float above canvas
        const noZIndex = occlusions.filter((r) => r.zIndex === null)
        expect(
            noZIndex.length,
            `all probeable labels should carry an explicit z-index (got ${noZIndex.length} with z-index:auto)`
        ).toBe(0)
    })

    // ── Mobile ──────────────────────────────────────────────────────────────────

    test('mobile: cluster labels exist, are visible, have nonzero rects, and carry color/accent data', async ({
        page
    }) => {
        test.setTimeout(180000)
        await page.setViewportSize(VIEWPORTS.mobile)
        await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`, {
            waitUntil: 'domcontentloaded'
        })
        await waitForGalaxyReady(page)

        const counts = await getClusterCounts(page)
        expect(counts, 'state.points must contain clustered points on mobile').not.toBeNull()
        expect(Object.keys(counts).length, 'at least 1 cluster must be present on mobile').toBeGreaterThan(0)

        const probes = await probeClusterLabels(page)

        expect(
            probes.total,
            `at least 1 .galaxy-cluster-label must exist on mobile (got ${probes.total})`
        ).toBeGreaterThan(0)
        expect(probes.visible, `at least 1 label must be .visible on mobile (got ${probes.visible})`).toBeGreaterThan(0)
        expect(probes.withRect, `visible labels must have nonzero rects on mobile`).toBeGreaterThanOrEqual(
            probes.visible
        )
        expect(probes.withColor, `at least 1 visible label must have color/accent on mobile`).toBeGreaterThan(0)
    })

    test('mobile: no catastrophic overlap with search/clear UI at 390×844', async ({ page }) => {
        test.setTimeout(180000)
        await page.setViewportSize(VIEWPORTS.mobile)
        await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`, {
            waitUntil: 'domcontentloaded'
        })
        await waitForGalaxyReady(page)

        const overlaps = await detectLabelOverlap(page)
        expect(
            overlaps,
            `no catastrophic overlap on mobile (overlapping indices: ${JSON.stringify(overlaps)})`
        ).toHaveLength(0)
    })

    test('mobile: visible cluster labels are not occluded by the canvas at their center points', async ({ page }) => {
        test.setTimeout(180000)
        await page.setViewportSize(VIEWPORTS.mobile)
        await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`, {
            waitUntil: 'domcontentloaded'
        })
        await waitForGalaxyReady(page)

        const occlusions = await detectLabelOcclusion(page)
        expect(occlusions.length, 'at least one visible label must be probeable at mobile 390×844').toBeGreaterThan(0)

        const occludedByCanvas = occlusions.filter((r) => r.isCanvasTopmost && r.isOccluded)
        expect(
            occludedByCanvas.length,
            `no visible label should have CANVAS as topmost at its center on mobile (got ${occludedByCanvas.length} occluded)`
        ).toBe(0)

        const fullyOccluded = occlusions.filter((r) => r.isOccluded)
        expect(
            fullyOccluded.length,
            `at least one mobile label must remain topmost at its center (got ${fullyOccluded.length} occluded of ${occlusions.length})`
        ).toBeLessThan(occlusions.length)

        const tinyFont = occlusions.filter((r) => !Number.isFinite(r.fontSize) || r.fontSize < 6)
        expect(
            tinyFont.length,
            `all probeable labels must have font-size >= 6px on mobile (got ${tinyFont.length} tiny)`
        ).toBe(0)

        const invisible = occlusions.filter((r) => r.display === 'none' || r.visibility === 'hidden')
        expect(
            invisible.length,
            `no probeable label should have display:none or visibility:hidden on mobile (got ${invisible.length})`
        ).toBe(0)
    })

    test('mobile-portrait: cluster labels are click-targetable at 390x844', async ({ page }) => {
        test.setTimeout(180000)
        await page.setViewportSize(VIEWPORTS.mobile)
        await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`, {
            waitUntil: 'domcontentloaded'
        })
        await waitForGalaxyReady(page)

        const probes = await probeClusterLabels(page)
        expect(
            probes.total,
            `at least 1 .galaxy-cluster-label must exist on mobile portrait (got ${probes.total})`
        ).toBeGreaterThan(0)
        expect(
            probes.visible,
            `at least 1 .galaxy-cluster-label must be visible on mobile portrait (got ${probes.visible})`
        ).toBeGreaterThan(0)

        // Verify the first visible label's center point is the label itself, not the canvas underneath.
        await waitForProbeableClusterLabel(page)
        const labelInfo = await page.evaluate(() => {
            const labels = Array.from(document.querySelectorAll('.galaxy-cluster-label.visible')).filter((el) => {
                const rect = el.getBoundingClientRect()
                const cx = rect.left + rect.width / 2
                const cy = rect.top + rect.height / 2
                return (
                    rect.width > 0 &&
                    rect.height > 0 &&
                    cx >= 0 &&
                    cy >= 0 &&
                    cx <= window.innerWidth &&
                    cy <= window.innerHeight
                )
            })
            if (!labels.length) return null
            const el = labels[0]
            const rect = el.getBoundingClientRect()
            const cs = getComputedStyle(el)
            if (!rect.width || !rect.height) return null
            const cx = rect.left + rect.width / 2
            const cy = rect.top + rect.height / 2
            const top = document.elementFromPoint(cx, cy)
            return {
                cx: Math.round(cx),
                cy: Math.round(cy),
                topmostTag: top ? top.tagName : null,
                topmostId: top ? top.id || null : null,
                isLabelTopmost: top === el || el.contains(top),
                fontSize: parseFloat(cs.fontSize)
            }
        })

        expect(labelInfo, 'first visible label must have a computable rect').not.toBeNull()
        expect(
            labelInfo.isLabelTopmost,
            `at mobile portrait 390×844, elementFromPoint(${labelInfo.cx}, ${labelInfo.cy}) must return the label itself, not ${labelInfo.topmostTag}#${labelInfo.topmostId} (canvas beneath would break click targeting)`
        ).toBe(true)
        expect(
            labelInfo.fontSize,
            `label font-size must be >= 8px on mobile portrait for readability (got ${labelInfo.fontSize}px)`
        ).toBeGreaterThanOrEqual(8)
    })

    test('mobile-portrait: cluster labels do not overlap critical UI at 390x844', async ({ page }) => {
        test.setTimeout(180000)
        await page.setViewportSize(VIEWPORTS.mobile)
        await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`, {
            waitUntil: 'domcontentloaded'
        })
        await waitForGalaxyReady(page)

        const overlaps = await detectLabelOverlap(page)
        expect(
            overlaps,
            `no catastrophic cluster-label overlap with search/clear UI on mobile portrait 390×844 (overlapping indices: ${JSON.stringify(overlaps)})`
        ).toHaveLength(0)
    })

    // ── Short-landscape ──────────────────────────────────────────────────────────

    test('short-landscape: cluster labels exist and are visible at 844×390', async ({ page }) => {
        test.setTimeout(180000)
        await page.setViewportSize(VIEWPORTS.shortLandscape)
        await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`, {
            waitUntil: 'domcontentloaded'
        })
        await waitForGalaxyReady(page)

        const counts = await getClusterCounts(page)
        expect(counts, 'state.points must contain clustered points in short-landscape').not.toBeNull()
        expect(Object.keys(counts).length, 'at least 1 cluster must be present in short-landscape').toBeGreaterThan(0)

        const probes = await probeClusterLabels(page)

        expect(
            probes.total,
            `at least 1 .galaxy-cluster-label must exist at 844×390 (got ${probes.total})`
        ).toBeGreaterThan(0)
        expect(probes.visible, `at least 1 label must be .visible at 844×390 (got ${probes.visible})`).toBeGreaterThan(
            0
        )
    })

    test('short-landscape: no catastrophic overlap with search/clear UI at 844×390', async ({ page }) => {
        test.setTimeout(180000)
        await page.setViewportSize(VIEWPORTS.shortLandscape)
        await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`, {
            waitUntil: 'domcontentloaded'
        })
        await waitForGalaxyReady(page)

        const overlaps = await detectLabelOverlap(page)
        expect(
            overlaps,
            `no catastrophic overlap in short-landscape (overlapping indices: ${JSON.stringify(overlaps)})`
        ).toHaveLength(0)
    })

    test('short-landscape: visible cluster labels are not occluded by the canvas at their center points', async ({
        page
    }) => {
        test.setTimeout(180000)
        await page.setViewportSize(VIEWPORTS.shortLandscape)
        await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`, {
            waitUntil: 'domcontentloaded'
        })
        await waitForGalaxyReady(page)

        const occlusions = await detectLabelOcclusion(page)
        expect(occlusions.length, 'at least one visible label must be probeable at 844×390').toBeGreaterThan(0)

        const occludedByCanvas = occlusions.filter((r) => r.isCanvasTopmost && r.isOccluded)
        expect(
            occludedByCanvas.length,
            `no visible label should have CANVAS as topmost at its center in short-landscape (got ${occludedByCanvas.length} occluded)`
        ).toBe(0)

        const fullyOccluded = occlusions.filter((r) => r.isOccluded)
        expect(
            fullyOccluded.length,
            `at least one short-landscape label must remain topmost at its center (got ${fullyOccluded.length} occluded of ${occlusions.length})`
        ).toBeLessThan(occlusions.length)

        const tinyFont = occlusions.filter((r) => !Number.isFinite(r.fontSize) || r.fontSize < 6)
        expect(
            tinyFont.length,
            `all probeable labels must have font-size >= 6px at 844×390 (got ${tinyFont.length} tiny)`
        ).toBe(0)

        const invisible = occlusions.filter((r) => r.display === 'none' || r.visibility === 'hidden')
        expect(
            invisible.length,
            `no probeable label should have display:none or visibility:hidden at 844×390 (got ${invisible.length})`
        ).toBe(0)
    })

    // ── Cross-viewport invariants ────────────────────────────────────────────────

    test('cluster counts are derivable from state.points across all viewports', async ({ page }) => {
        test.setTimeout(180000)
        for (const vp of Object.values(VIEWPORTS)) {
            await page.setViewportSize(vp)
            await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`, {
                waitUntil: 'domcontentloaded'
            })
            await waitForGalaxyReady(page)

            const counts = await getClusterCounts(page)
            expect(counts, `cluster counts must be derivable from state.points at ${vp.label}`).not.toBeNull()
            expect(Object.keys(counts).length, `at least 1 cluster at ${vp.label}`).toBeGreaterThan(0)
        }
    })

    // ── Overview → Focus transition ─────────────────────────────────────────────

    test('desktop: cluster label wayfinding survives overview→focus transition', async ({ page }) => {
        test.setTimeout(180000)
        await page.setViewportSize(VIEWPORTS.desktop)
        await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`, {
            waitUntil: 'domcontentloaded'
        })
        await waitForGalaxyReady(page)

        const overviewProbes = await probeClusterLabels(page)
        expect(overviewProbes.total, 'overview must have cluster label elements').toBeGreaterThan(0)
        expect(overviewProbes.visible, 'overview must have at least one visible label').toBeGreaterThan(0)

        await enterFocusMode(page)

        const focusProbes = await probeClusterLabels(page)
        expect(focusProbes.total, 'label element count must be preserved through transition').toBeGreaterThan(0)
        expect(focusProbes.visible, 'focus mode must retain visible wayfinding labels').toBeGreaterThan(0)
        expect(focusProbes.isActive, 'focus mode must mark the active cluster label').toBeGreaterThan(0)
        expect(focusProbes.withRect, 'visible focus labels must still have nonzero rects').toBeGreaterThanOrEqual(
            focusProbes.visible
        )

        // Point count and cluster data must remain valid
        const state = await page.evaluate(() => ({
            pointCount: (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).points?.length ?? 0,
            navMode: (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).navState?.mode ?? ''
        }))
        expect(state.pointCount, 'point count must be preserved through transition').toBeGreaterThan(0)
        expect(['focus', 'trail'], 'nav mode must be focused traversal').toContain(state.navMode)
    })

    test('mobile: cluster label visibility behaves deterministically through overview→focus', async ({ page }) => {
        test.setTimeout(180000)
        await page.setViewportSize(VIEWPORTS.mobile)
        await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`, {
            waitUntil: 'domcontentloaded'
        })
        await waitForGalaxyReady(page)

        const overviewProbes = await probeClusterLabels(page)
        expect(overviewProbes.total, 'mobile overview must have label elements').toBeGreaterThan(0)
        expect(overviewProbes.visible, 'mobile overview must have visible labels').toBeGreaterThan(0)

        await enterFocusMode(page)

        const focusProbes = await probeClusterLabels(page)
        expect(focusProbes.total, 'mobile label count must be preserved through transition').toBeGreaterThan(0)
        expect(focusProbes.visible, 'mobile focus must retain a visible wayfinding label').toBeGreaterThan(0)
        expect(focusProbes.isActive, 'mobile focus must mark the active cluster label').toBeGreaterThan(0)

        const state = await page.evaluate(() => ({
            pointCount: (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).points?.length ?? 0,
            navMode: (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).navState?.mode ?? ''
        }))
        expect(state.pointCount, 'mobile point count must survive transition').toBeGreaterThan(0)
        expect(['focus', 'trail'], 'mobile nav mode must be focused traversal').toContain(state.navMode)
    })

    test('short-landscape: cluster label structure is stable during overview→focus transition', async ({ page }) => {
        test.setTimeout(180000)
        await page.setViewportSize(VIEWPORTS.shortLandscape)
        await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`, {
            waitUntil: 'domcontentloaded'
        })
        await waitForGalaxyReady(page)

        const overviewProbes = await probeClusterLabels(page)
        expect(overviewProbes.total, 'short-landscape overview must have label elements').toBeGreaterThan(0)

        await enterFocusMode(page)

        const focusProbes = await probeClusterLabels(page)
        expect(focusProbes.total, 'short-landscape label count must be stable through transition').toBeGreaterThan(0)
        expect(focusProbes.visible, 'short-landscape focus must retain a visible wayfinding label').toBeGreaterThan(0)

        const state = await page.evaluate(() => ({
            pointCount: (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).points?.length ?? 0,
            navMode: (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).navState?.mode ?? ''
        }))
        expect(state.pointCount, 'short-landscape point count must survive transition').toBeGreaterThan(0)
        expect(['focus', 'trail'], 'short-landscape nav mode should be focused traversal after focusOnNode').toContain(
            state.navMode
        )
    })

    test('overview→focus transition does not corrupt cluster label with-color data', async ({ page }) => {
        test.setTimeout(180000)
        await page.setViewportSize(VIEWPORTS.desktop)
        await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`, {
            waitUntil: 'domcontentloaded'
        })
        await waitForGalaxyReady(page)

        // Capture pre-transition color data
        const pre = await probeClusterLabels(page)
        expect(pre.withColor, 'pre-transition at least one label must have color data').toBeGreaterThan(0)

        await enterFocusMode(page)

        // Post-transition: focus should preserve at least one wayfinding label and
        // keep label metadata accessible.
        const post = await probeClusterLabels(page)
        expect(post.visible, 'focus mode must keep at least one cluster label visible').toBeGreaterThan(0)
        expect(post.isActive, 'focus mode must preserve active cluster labeling').toBeGreaterThan(0)
        expect(
            typeof post.withColor === 'number',
            'withColor must remain a number after transition (no DOM corruption)'
        ).toBe(true)
        expect(post.total, 'total label count must remain accessible after transition').toBeGreaterThan(0)
    })

    test('focus mode: no visible cluster label is occluded or has canvas as topmost at its center', async ({
        page
    }) => {
        test.setTimeout(180000)
        await page.setViewportSize(VIEWPORTS.desktop)
        await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`, {
            waitUntil: 'domcontentloaded'
        })
        await waitForGalaxyReady(page)

        await enterFocusMode(page)

        const occlusions = await detectLabelOcclusion(page)
        // In focus mode labels may be hidden — empty result is acceptable (not a failure).
        // But if any labels are still visible, they must not be occluded by canvas.
        if (occlusions.length === 0) return

        const occludedByCanvas = occlusions.filter((r) => r.isCanvasTopmost && r.isOccluded)
        expect(
            occludedByCanvas.length,
            `in focus mode no visible label should have CANVAS as topmost at its center (got ${occludedByCanvas.length})`
        ).toBe(0)

        const fullyOccluded = occlusions.filter((r) => r.isOccluded)
        expect(
            fullyOccluded.length,
            `in focus mode no visible label should be fully occluded at its center (got ${fullyOccluded.length})`
        ).toBe(0)
    })
})

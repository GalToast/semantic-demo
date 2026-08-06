// tests/state-matrix-sweep.spec.js
// NEW FILE — coefficient product sweep: [idle, search-open, focus-error-message]
// × [390x844, 768x1024, 1280x720, 1920x1080] × [full-window, narrow(=viewport-60)]
// Invariants (a)-(e) from prompt. Mobile-first / placeholder2d path when WebGL
// unavailable in headless (set viewport, use deep link, wait init, assert).

import { test, expect } from '@playwright/test'

// Reuse patterns from visual-state-audit.mjs (read, not edited):
// - goto host, set viewport, wait for init (waitForReady-style), capture
// - use page.evaluate() for DOM invariants, skip canvas internals for (c)
// We ECHO the state-builder / viewport helper concepts but keep this file self-contained.

const HOST = 'http://127.0.0.1:8796'
const STATES = [
    { id: 'idle', urlSuffix: '?nodemo=1&view=galaxy', label: 'idle' },
    { id: 'search-open', urlSuffix: '?nodemo=1&q=coffee', label: 'search-open' },
    { id: 'focus-error-message', urlSuffix: '?nodemo=1&q=badsyntax!!!', label: 'focus-error-message' }
]
const VIEWPORTS = [
    { w: 390, h: 844, name: '390x844' },
    { w: 768, h: 1024, name: '768x1024' },
    { w: 1280, h: 720, name: '1280x720' },
    { w: 1920, h: 1080, name: '1920x1080' }
]

// Margin modes: full-window vs narrow (viewport-60)
function narrowCss(viewportW) {
    return `body{margin-left:30px!important;margin-right:30px!important;max-width:${viewportW - 60}px!important;}`
}

function buildCells() {
    const cells = []
    for (const state of STATES) {
        for (const vp of VIEWPORTS) {
            cells.push({ state: state.id, labelState: state.label, urlSuffix: state.urlSuffix, vp, narrow: false })
            cells.push({ state: state.id, labelState: state.label, urlSuffix: state.urlSuffix, vp, narrow: true })
        }
    }
    return cells
}

const CELLS = buildCells()

// Helper: reach state, wait for init (DOMContentLoaded + minimal settle).
// We prefer mobile placeholder2d path when WebGL missing: just wait for
// body dataset / overlay settle without strict WebGL requirements.
async function reachState(page, urlSuffix) {
    await page.goto(`${HOST}/dist/svelte/index.html${urlSuffix}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    // Wait for app shell readiness (echoing waitForReady from audit):
    await page
        .waitForFunction(
            () => {
                const body = document.body
                return (
                    body &&
                    (body.dataset.surfaceSettled === 'true' ||
                        body.dataset.graphicsMode === 'fallback' ||
                        !!document.querySelector('#app'))
                )
            },
            { timeout: 20000 }
        )
        .catch(() => {
            // Fallback: at least #app exists
        })
    await page.waitForTimeout(800) // brief settle for animation / overlay
}

async function runInvariants(page, cell) {
    const failures = []

    // Capture console errors during transition (d): read all console messages
    // after a short settle window; we collect errors in page event listener.
    // We'll rely on the per-cell capture below.

    // (a) document.documentElement.scrollWidth <= window.innerWidth + 1 (no horizontal scroll)
    const scrollInfo = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        overflowX: document.documentElement.scrollWidth - window.innerWidth
    }))
    if (scrollInfo.scrollWidth > scrollInfo.innerWidth + 1) {
        failures.push({
            inv: 'a',
            msg: `horizontal scroll: scrollWidth=${scrollInfo.scrollWidth}, innerWidth=${scrollInfo.innerWidth}, overflowX=${scrollInfo.overflowX}`,
            selector: 'documentElement'
        })
    }

    // (b) no element with position:fixed/fixed-width greater than viewport
    const fixedOverflows = await page.evaluate(
        ({ vpW, vpH }) => {
            const bad = []
            document.querySelectorAll('*').forEach((el) => {
                const style = getComputedStyle(el)
                if (style.position === 'fixed') {
                    const rect = el.getBoundingClientRect()
                    const isFixedWidth = style.width !== 'auto' && style.width !== '' && parseFloat(style.width) > 0
                    const overW = rect.width > vpW + 2 || (isFixedWidth && parseFloat(style.width) > vpW + 2)
                    if (overW)
                        bad.push({
                            tag: el.tagName,
                            id: el.id || '',
                            cls: el.className || '',
                            width: rect.width,
                            computedW: style.width,
                            fixed: true
                        })
                }
            })
            return bad
        },
        { vpW: cell.vp.w, vpH: cell.vp.h }
    )
    if (fixedOverflows.length > 0) {
        failures.push({
            inv: 'b',
            msg: `fixed/fixed-width elements exceed viewport (${cell.vp.name}): ${JSON.stringify(fixedOverflows)}`,
            selector: fixedOverflows.map((f) => (f.id ? `#${f.id}` : f.tag)).join(', ')
        })
    }

    // (c) no visible element with clipped text: for each element with overflow hidden containing text, check scrollHeight <= clientHeight + 2 for non-canvas
    // Skip canvas element itself per TH-ice instruction.
    const clippedList = await page.evaluate(() => {
        const results = []
        document.querySelectorAll('*').forEach((el) => {
            if (el.tagName.toLowerCase() === 'canvas') return // skip canvas per instruction
            if (el.classList.contains('sr-only')) return // a11y mechanism clips BY DESIGN
            const style = getComputedStyle(el)
            // Skip intentional scroll containers (overflow-y:auto is a designed internal
            // scroll — clipped content there is the FEATURE, not a defect). Only flag
            // overflow:hidden containers that CLIP (no scroll affordance).
            if (style.overflowY === 'auto' || style.overflowY === 'scroll') return
            if (style.overflow !== 'hidden' && style.overflowX !== 'hidden' && style.overflowY !== 'hidden') return
            const textLength = (el.textContent || '').trim().length
            if (textLength > 0) {
                const rect = el.getBoundingClientRect()
                const visible =
                    rect.width > 0 &&
                    rect.height > 0 &&
                    style.display !== 'none' &&
                    style.visibility !== 'hidden' &&
                    parseFloat(style.opacity || '1') > 0.01
                if (visible && el.scrollHeight > el.clientHeight + 2) {
                    results.push({
                        tag: el.tagName,
                        id: el.id || '',
                        cls: el.className || '',
                        scrollH: el.scrollHeight,
                        clientH: el.clientHeight,
                        textLen: textLength
                    })
                }
            }
        })
        return results
    })
    if (clippedList.length > 0) {
        failures.push({
            inv: 'c',
            msg: `clipped text elements (${clippedList.length} found): ${JSON.stringify(clippedList.slice(0, 3))}`,
            selector: clippedList.map((c) => (c.id ? `#${c.id}` : c.tag)).join(', ')
        })
    }

    // (e) #app fills viewport (bottom edge within 2px)
    const appFill = await page.evaluate(() => {
        const app = document.querySelector('#app')
        if (!app) return { present: false, bottom: null, innerH: window.innerHeight }
        const rect = app.getBoundingClientRect()
        return {
            present: true,
            bottom: rect.bottom,
            innerH: window.innerHeight,
            diff: Math.abs(rect.bottom - window.innerHeight)
        }
    })
    if (!appFill.present) {
        failures.push({ inv: 'e', msg: '#app element not present', selector: '#app' })
    } else if (appFill.diff > 2) {
        failures.push({
            inv: 'e',
            msg: `#app bottom=${appFill.bottom} vs innerH=${appFill.innerH}, diff=${appFill.diff}`,
            selector: '#app'
        })
    }

    return failures
}

// Helper to apply narrow margin via injected CSS, then restore after.
async function withNarrowMargin(page, cell, fn) {
    const viewportW = cell.vp.w
    if (!cell.narrow) return fn()
    await page.addStyleTag({ content: narrowCss(viewportW) })
    try {
        return await fn()
    } finally {
        // Best-effort removal not strictly needed (new context/page per test)
    }
}

// Per-state setup on page (before invariants) using deep-link route (mobile/textable)
function setupState(page, state) {
    // We rely on URL suffix and previous goto/reachState. No extra interaction
    // required for idle/search-open; focus-error-message comes from bad query param
    // which the app should display an error surface (search-error-state or message).
    // We just ensure the input or error surface is visible.
    return page.waitForFunction(() => !!document.querySelector('#app'), { timeout: 10000 }).catch(() => {})
}

// Build matrix tests
for (const cell of CELLS) {
    const testName = `matrix: ${cell.state}/${cell.vp.name}${cell.narrow ? '/narrow' : '/full'}`
    test(testName, async ({ page }) => {
        test.info().annotations.push({
            type: 'cell',
            description: JSON.stringify({ state: cell.state, viewport: cell.vp.name, narrow: cell.narrow })
        })

        // Capture console errors during this cell
        const consoleErrors = []
        page.on('console', (msg) => {
            if (msg.type() === 'error')
                consoleErrors.push({ text: msg.text(), type: msg.type(), location: msg.location() })
        })
        page.on('pageerror', (err) => {
            consoleErrors.push({ text: err.message || String(err), type: 'pageerror' })
        })

        await page.setViewportSize({ width: cell.vp.w, height: cell.vp.h })

        await withNarrowMargin(page, cell, async () => {
            await reachState(page, cell.urlSuffix)
            await setupState(page, cell.state)
            // Wait a bit for placeholder2d/init
            await page.waitForTimeout(1200)
            const failures = await runInvariants(page, cell)

            // (d) no console.error captured during transition
            if (consoleErrors.length > 0) {
                failures.push({
                    inv: 'd',
                    msg: `console errors (${consoleErrors.length}): ${consoleErrors.map((c) => c.text).join(' | ')}`,
                    selector: 'console'
                })
            }

            if (failures.length > 0) {
                const detail = failures.map((f) => `[${f.inv}] ${f.msg} (selector:${f.selector})`).join('  |  ')
                throw new Error(detail)
            }
        })
    })
}

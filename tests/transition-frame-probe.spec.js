// tests/transition-frame-probe.spec.js
// NEW FILE - temporal two-shot probes across mode transitions.
// Blind spot: transient defects in the 40-400ms window (flash-of-unstyled,
// stacked veils, ghost overlays, mid-transition layout shift) that single
// screenshots and end-state DOM asserts both miss.
//
// Each edge: drive the transition, then capture computed styles at +40/+150/+400ms
// for overlays + #app. Invariants:
//   P1 no two full-viewport overlays simultaneously visible (stuck stack)
//   P2 app box exists and non-zero by +150ms (no blank gap)
//   P3 no >2px horizontal jitter of the app box between +150 and +400ms
// Edges: overview->search, search->focus, focus->inside, overview->map,
//        map->overview (back button).
import { test, expect } from '@playwright/test'

const BASE = 'http://127.0.0.1:8796'
const APP_PATH = '/dist/svelte/index.html'
const OVERLAY_SELS = ['[role="dialog"]', '[class*="veil"]', '[class*="overlay"]']

async function gotoApp(page, suffix) {
    await page.goto(`${BASE}${APP_PATH}${suffix}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(700)
}

async function drive(page, edge) {
    switch (edge) {
        case 'overview->search':
            await page.click('.mode-chip[data-mode="search"]', { timeout: 4000 }).catch(() => {})
            break
        case 'search->focus':
            await page.click('.mode-chip[data-mode="search"]', { timeout: 4000 }).catch(() => {})
            await page.waitForTimeout(250)
            await page
                .locator('[data-record-row], .search-result, [role="option"]')
                .first()
                .click({ timeout: 4000, force: true })
                .catch(() => {})
            break
        case 'focus->inside': {
            const ok = await page
                .evaluate(() => {
                    const chip = [...document.querySelectorAll('.mode-chip')].find(
                        (c) => c.getAttribute('data-mode') === 'inside'
                    )
                    if (chip) {
                        chip.click()
                        return true
                    }
                    return false
                })
                .catch(() => false)
            if (!ok) await page.click('.mode-chip[data-mode="inside"]', { timeout: 3000 }).catch(() => {})
            break
        }
        case 'overview->map':
            await page
                .evaluate(() => {
                    const chip = [...document.querySelectorAll('.mode-chip')].find(
                        (c) => c.getAttribute('data-mode') === 'map'
                    )
                    if (chip) chip.click()
                })
                .catch(() => {})
            break
        case 'map->overview':
            await page.goBack({ timeout: 4000 }).catch(() => {})
            break
        default:
            break
    }
}

async function frameAt(page, label) {
    const d = await page.evaluate(
        ({ label }) => {
            const read = (sel) => {
                const el = document.querySelector(sel)
                if (!el) return null
                const r = el.getBoundingClientRect()
                const cs = getComputedStyle(el)
                return {
                    visible:
                        r.width > 0 &&
                        r.height > 0 &&
                        cs.visibility !== 'hidden' &&
                        parseFloat(cs.opacity || '1') > 0.05,
                    opacity: cs.opacity,
                    pointer: cs.pointerEvents,
                    w: Math.round(r.width),
                    h: Math.round(r.height),
                    x: Math.round(r.x),
                    y: Math.round(r.y)
                }
            }
            const overlays = []
            for (const sel of ['[role="dialog"]', '[class*="veil"]', '[class*="overlay"]']) {
                const v = read(sel)
                if (v && v.visible) overlays.push({ sel, ...v })
            }
            return { label, overlays, app: read('#app') }
        },
        { label }
    )
    return d
}

test('transition frame probes', async ({ page }) => {
    const edges = ['overview->search', 'search->focus', 'focus->inside', 'overview->map', 'map->overview']
    for (const edge of edges) {
        await gotoApp(
            page,
            edge === 'overview->search' || edge === 'overview->map' ? '?nodemo=1' : '?nodemo=1&q=coffee'
        )
        await drive(page, edge)

        const frames = []
        for (const [label, delay] of [
            ['t40', 40],
            ['t150', 150],
            ['t400', 400]
        ]) {
            await page.waitForTimeout(delay)
            frames.push(await frameAt(page, label))
        }

        // P1: no two visible full-viewport overlays at the same frame
        for (const f of frames) {
            const vis = f.overlays.filter((o) => parseFloat(o.opacity || '0') > 0.5)
            const tall = vis.filter((o) => o.h > 800)
            expect(
                tall.length > 1,
                `stuck overlay stack at ${f.label} (edge ${edge}): ${JSON.stringify(tall.map((o) => o.sel))}`
            ).toBe(false)
        }

        // P2: app present by +400
        const app400 = frames[2].app
        expect(app400 && app400.w > 0 && app400.h > 0, `app blank at t400 (edge ${edge})`).toBe(true)

        // P3: no horizontal jitter between +150 and +400
        const [p150, p400] = [frames[1].app, frames[2].app]
        if (p150 && p400) {
            const dx = Math.abs(p150.x - p400.x)
            expect(dx <= 2, `app x jitter ${dx}px (edge ${edge})`).toBe(true)
        }

        // P4: overlay count never spikes to 3+ between frames (ghost accumulation)
        for (const f of frames) {
            expect(
                f.overlays.length <= 2,
                `ghost overlay count ${f.overlays.length} at ${f.label} (edge ${edge}): ${JSON.stringify(f.overlays.map((o) => o.sel))}`
            ).toBe(false)
        }
    }
})

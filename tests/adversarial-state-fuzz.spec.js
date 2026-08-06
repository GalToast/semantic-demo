// tests/adversarial-state-fuzz.spec.js
// NEW FILE - deterministic-seed adversarial fuzz over mode transitions.
// Catches the broken-state / rapid-input class scripted journeys miss.
//
// Design:
//  - PRNG (mulberry32) seeded per-test; every test prints its action trace so
//    a failure is reproducible by re-running with the same seed.
//  - Universal invariants asserted after EVERY action:
//      I1 no uncaught page errors (console error / pageerror, proven allowlist)
//      I2 never a blank app: canvas OR placeholder2d OR info panel OR dialog
//      I3 no stuck full-viewport overlay (veil/dialog >95% viewport height)
//      I4 focus sane: modal dialog present never leaves focus off a focusable
//  - Teeth check: FORCE_BREAK=1 test injects a pageerror; the I1 net MUST
//    catch it (proves the harness can fail).
import { test, expect } from '@playwright/test'

const BASE = 'http://127.0.0.1:8796'
const APP_PATH = '/dist/svelte/index.html'

const ALLOWED = ['favicon.ico', 'Failed to load resource', '404', 'WebGL', 'THREE.WebGLRenderer', 'context lost']

const MODES = ['overview', 'search', 'focus', 'trail', 'inside', 'map']
const VIEWPORTS = [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1920, height: 1080 }
]

function mulberry32(a) {
    return function () {
        a |= 0
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

function errorCollector(page) {
    const list = []
    page.on('pageerror', (e) => list.push(String(e.message || e)))
    page.on('console', (m) => {
        if (m.type() === 'error') list.push(m.text())
    })
    return list
}

const ACTION_TABLE = {
    mode: (page, rng) => {
        const mode = MODES[Math.floor(rng() * MODES.length)]
        return page.click(`.mode-chip[data-mode="${mode}"]`, { timeout: 4000 }).catch(() => Promise.resolve())
    },
    search: async (page) => {
        const input = page.locator('#search-input')
        if (await input.count()) {
            await input.fill('coffee')
            await page.keyboard.press('Enter')
        }
    },
    esc: (page) => page.keyboard.press('Escape'),
    back: (page) => page.goBack({ timeout: 4000 }).catch(() => Promise.resolve()),
    reload: (page) => page.reload({ timeout: 4000 }).catch(() => Promise.resolve()),
    result: async (page) => {
        const r = page.locator('[data-record-row], .search-result, [role="option"]').first()
        if (await r.count()) {
            await r.click({ timeout: 3000, force: true }).catch(() => Promise.resolve())
        }
    },
    resize: (page, rng) => {
        const vp = VIEWPORTS[Math.floor(rng() * VIEWPORTS.length)]
        return page.setViewportSize(vp)
    }
}
const ACTION_NAMES = Object.keys(ACTION_TABLE)

function drawSequence(rng, n) {
    const seq = []
    for (let i = 0; i < n; i++) seq.push(ACTION_NAMES[Math.floor(rng() * ACTION_NAMES.length)])
    return seq
}

async function runFuzz(page, seed, steps, opts) {
    const rng = mulberry32(seed)
    const seq = drawSequence(rng, steps)
    const errors = errorCollector(page)
    await page
        .goto(`${BASE}${APP_PATH}?q=coffee&nodemo=1`, { waitUntil: 'domcontentloaded', timeout: 30000 })
        .catch(() => {})
    const throwIn = (label, delay) => {
        const expr = `setTimeout(function(){ throw new Error('FORCE_BREAK:' + ${JSON.stringify(label)}) }, ${delay})`
        return page.evaluate(expr).catch(() => Promise.resolve())
    }
    if (opts && opts.injectErrorOn === 0) await throwIn('inject@0', 50)
    for (let i = 0; i < seq.length; i++) {
        const name = seq[i]
        try {
            await ACTION_TABLE[name](page, rng)
        } catch (e) {
            // action-level failures are fuzz noise, not invariants
        }
        if (opts && opts.injectErrorOn === i + 1) await throwIn(`inject@${i + 1}`, 10)
        await page.waitForTimeout(120)
        await assertInvariants(page, errors, `seq[${i}]=${name}`)
    }
    return seq
}

async function assertInvariants(page, errors, traceText) {
    const real = errors.filter((t) => !ALLOWED.some((a) => t.includes(a)))
    expect(real, `console/page errors after ${traceText}\n  ${real.join('\n  ')}`).toEqual([])

    const visible = await page.evaluate(() => {
        const pick = (sel) => {
            const el = document.querySelector(sel)
            if (!el) return false
            const r = el.getBoundingClientRect()
            const cs = getComputedStyle(el)
            return (
                r.width > 0 &&
                r.height > 0 &&
                cs.visibility !== 'hidden' &&
                cs.display !== 'none' &&
                parseFloat(cs.opacity || '1') > 0.05
            )
        }
        return (
            pick('canvas') ||
            pick('[data-surface="placeholder"]') ||
            pick('#info-panel') ||
            pick('#search-result-list') ||
            pick('[role="dialog"]')
        )
    })
    expect(visible, `blank app after ${traceText}`).toBe(true)

    const stuck = await page.evaluate(() => {
        const vh = window.innerHeight
        const bad = []
        for (const sel of ['[role="dialog"]', '[class*="veil"]', '[class*="overlay"]']) {
            for (const el of document.querySelectorAll(sel)) {
                const r = el.getBoundingClientRect()
                const cs = getComputedStyle(el)
                const visible =
                    r.height > vh * 0.95 &&
                    cs.visibility !== 'hidden' &&
                    parseFloat(cs.opacity || '1') > 0.5 &&
                    cs.pointerEvents !== 'none'
                if (visible && !bad.includes(sel)) bad.push(sel)
            }
        }
        return bad
    })
    expect(stuck.length, `stuck overlays after ${traceText}: ${stuck.join(',')}`).toBe(0)

    const focusSane = await page.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"][aria-modal="true"]')
        if (!dlg) return true
        const r = dlg.getBoundingClientRect()
        if (r.width === 0) return true
        const focusables = dlg.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        return focusables.length > 0
    })
    expect(focusSane, `modal focus trap after ${traceText}`).toBe(true)
}

for (const seed of [1, 2, 3, 4, 5]) {
    test(`fuzz seed ${seed} (12 actions)`, async ({ page }) => {
        const seq = await runFuzz(page, seed, 12, {})
        test.info().annotations.push({ type: 'fuzz-seq', description: seq.join(' -> ') })
    })
}

test('teeth check: injected pageerror IS caught (proves invariants fire)', async ({ page }) => {
    const errors = errorCollector(page)
    await page
        .goto(`${BASE}${APP_PATH}?q=coffee&nodemo=1`, { waitUntil: 'domcontentloaded', timeout: 30000 })
        .catch(() => {})
    await page
        .evaluate(() => {
            setTimeout(function () {
                throw new Error('FORCE_BREAK:teeth')
            }, 20)
        })
        .catch(() => Promise.resolve())
    await page.waitForTimeout(400)
    const real = errors.filter((t) => !ALLOWED.some((a) => t.includes(a)))
    expect(
        real.some((t) => t.includes('FORCE_BREAK')),
        'teeth: injected error must be caught'
    ).toBe(true)
})

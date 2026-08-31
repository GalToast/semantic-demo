/**
 * layout-integrity-contract.mjs
 *
 * Geometry-backed layout audit across breakpoints. Built 2026-08-30 after a
 * vision-model report claimed a "catastrophic layer collision" at 768px that
 * did not exist: the DOM showed a clean layout, and a z-index change made for
 * it was a visual no-op (0 pixels differ). Vision narratives about SPATIAL
 * claims on this dark, layered UI are unreliable -- the model reads vertical
 * stacking as overlap. Geometry is not.
 *
 *   node tests/layout-integrity-contract.mjs [url]
 *
 * Default: serves ./ over a random port (mirrors mode-chip-state-render-contract).
 *
 * Three checks, all measured from getBoundingClientRect:
 *   1. OVERFLOW   - a visible element extends past the viewport edge.
 *   2. TEXT CLIP  - scrollWidth > clientWidth (or scrollHeight > clientHeight)
 *                   on an element that is not intentionally scrollable.
 *   3. COLLISION  - two NON-NESTED visible elements that both render text
 *                   intersect by more than MIN_OVERLAP_PX.
 *
 * Deliberately NOT flagged:
 *   - ancestor/descendant pairs (nested boxes intersect by definition).
 *   - "backdrops": elements covering >= BACKDROP_PCT of the viewport. A
 *     full-screen splash covering the map is intent, not a bug -- that exact
 *     pair was the false positive this test exists to prevent.
 *   - elements the allowlist marks as intentionally overlapping.
 *
 * Exit 0 = clean, 1 = violations found.
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const DEFAULT_URL_ARG = process.argv[2]
const BREAKPOINTS = [375, 640, 768, 820, 1280]
const SURFACES = [
    ['overview', '?nodemo=1'],
    ['map', '?view=map'],
    ['search', '?nodemo=1&q=coffee']
]
const SETTLE_MS = 6000
const MIN_OVERLAP_PX = 4000       // ~63x63; below this is a seam, not a collision
const BACKDROP_PCT = 0.9          // element covering >=90% of viewport = backdrop
// 4px: a 3px vertical clip on span.journey-compass-step showed up at EVERY
// breakpoint and is line-height rounding, not a layout bug.
const CLIP_TOLERANCE_PX = 4

// Baseline of KNOWN defects, recorded 2026-08-30. This is a ratchet: each
// entry is a real bug we have not fixed yet, and fixing one means DELETING its
// entry. Entries here keep the gate green so it can run in CI, but the list is
// the bug backlog — do not add to it lightly, and never add speculative entries.
const ALLOWLIST = [
    // --- real text clipping ---
    { surface: 'overview', width: 820, kind: 'clipped', a: 'span.header-description', why: 'top-right status text truncated ~89px at 820' },
    { surface: 'search', width: 820, kind: 'clipped', a: 'span.header-description', why: 'top-right status text truncated ~89px at 820' },
    { surface: 'map', width: 820, kind: 'clipped', a: 'span.weather-cond', why: 'weather condition text clipped ~16px' },
    { surface: 'search', width: 820, kind: 'clipped', a: 'span.weather-cond', why: 'weather condition text clipped ~16px' },
    { surface: 'search', width: 1280, kind: 'clipped', a: 'span.weather-cond', why: 'weather condition text clipped ~16px' },
    // Data-dependent: the condition string length varies, so this one appears
    // intermittently rather than on every run.
    { surface: 'map', width: 1280, kind: 'clipped', a: 'span.weather-cond', why: 'weather condition text clipped ~16px (flaky - depends on condition string length)' },
    { surface: 'search', width: 820, kind: 'clipped', a: 'div.search-result-name', why: 'business name clipped ~21px' },
    { surface: 'search', width: 1280, kind: 'clipped', a: 'div.search-result-name', why: 'business name clipped ~21px' },
    { surface: 'map', width: 820, kind: 'clipped', a: 'div#journey-compass-title.journey-compass-title', why: 'compass title clipped ~9px' },
    // --- real collisions ---
    // FIXED 2026-08-30: map-empty-state-title <-> p.splash-tag @375, resolved by
    // suppressing .map-empty-state while the splash is up (css/shell.css).
    { surface: 'search', width: 640, kind: 'collision', a: 'span.header-description', b: 'div#search-trail-cue-title.search-trail-cue-title', why: 'header status text collides with the trail-cue title' }
]

let targetUrl = DEFAULT_URL_ARG
const USE_LOCAL_SERVER = !DEFAULT_URL_ARG

function startServer(rootDir, port) {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
            const rel = urlPath === '/' ? 'dist/svelte/index.html' : urlPath.replace(/^\/+/, '')
            const fullPath = path.resolve(rootDir, rel)
            if (fullPath !== rootDir && !fullPath.startsWith(rootDir + path.sep)) {
                res.writeHead(403)
                res.end('Forbidden')
                return
            }
            fs.readFile(fullPath, (err, data) => {
                if (err) {
                    res.writeHead(404)
                    res.end('Not found')
                    return
                }
                const ext = path.extname(fullPath).toLowerCase()
                const type = {
                    '.html': 'text/html',
                    '.css': 'text/css',
                    '.js': 'application/javascript',
                    '.mjs': 'application/javascript',
                    '.json': 'application/json',
                    '.dat': 'application/json',
                    '.bin': 'application/octet-stream',
                    '.png': 'image/png',
                    '.svg': 'image/svg+xml'
                }[ext] || 'application/octet-stream'
                res.writeHead(200, { 'Content-Type': type })
                res.end(data)
            })
        })
        server.on('error', reject)
        server.listen(port, '127.0.0.1', () => resolve(server))
    })
}

// Runs in the page. Returns plain data only.
function auditPage(cfg) {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const area = vw * vh

    const rect = (el) => el.getBoundingClientRect()
    const visible = (el) => {
        const s = getComputedStyle(el)
        if (s.display === 'none' || s.visibility === 'hidden') return false
        if (parseFloat(s.opacity) < 0.05) return false
        const r = rect(el)
        return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw
    }
    const hasOwnText = (el) => {
        for (const child of el.childNodes) {
            if (child.nodeType === 3 && child.textContent.trim().length > 0) return true
        }
        return false
    }
    // A pannable map legitimately has tiles extending past the viewport in
    // every direction; SVG internals (g/path/circle) report geometric boxes,
    // not layout boxes. Both produced ~99% of the raw findings on first run.
    const inMapPane = (el) => !!el.closest('.leaflet-container, .leaflet-pane, .leaflet-tile')
    const insideSvg = (el) => el.tagName.toLowerCase() !== 'svg' && !!el.closest('svg')
    const isControl = (el) => ['button', 'input', 'select', 'textarea', 'a'].includes(el.tagName.toLowerCase())
    const label = (el) => {
        const cls = (el.className || '').toString().trim().split(/\s+/)[0]
        return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : '')
    }

    const all = [...document.querySelectorAll('body *')].filter(visible)
    const nodes = []
    const overflow = []
    const clipped = []

    for (const el of all) {
        const r = rect(el)
        const s = getComputedStyle(el)

        // 1. overflow past the viewport -- only meaningful for things a user
        //    reads or clicks. Raw tiles/SVG geometry are not layout bugs.
        const overflowMatters = (hasOwnText(el) || isControl(el)) && !inMapPane(el) && !insideSvg(el)
        if (overflowMatters && (r.right > vw + 1 || r.left < -1)) {
            overflow.push({
                el: label(el),
                text: (el.textContent || '').trim().slice(0, 40),
                left: Math.round(r.left),
                right: Math.round(r.right),
                overflowRight: Math.round(Math.max(0, r.right - vw)),
                overflowLeft: Math.round(Math.max(0, -r.left))
            })
        }

        // 2. clipped text/content
        const scrollable = /auto|scroll/.test(s.overflowX + s.overflowY)
        if (!scrollable && hasOwnText(el)) {
            const dx = el.scrollWidth - el.clientWidth
            const dy = el.scrollHeight - el.clientHeight
            if (dx > cfg.clipTol || dy > cfg.clipTol) {
                clipped.push({
                    el: label(el),
                    text: (el.textContent || '').trim().slice(0, 40),
                    dx,
                    dy
                })
            }
        }

        nodes.push({ el, r, s, text: hasOwnText(el), label: label(el) })
    }

    // 3. collisions between non-nested, text-bearing, non-backdrop elements
    const collisions = []
    const isBackdrop = (n) => (n.r.width * n.r.height) / area >= cfg.backdropPct
    const cand = nodes.filter((n) => n.text && !isBackdrop(n))
    for (let i = 0; i < cand.length; i++) {
        for (let j = i + 1; j < cand.length; j++) {
            const a = cand[i]
            const b = cand[j]
            if (a.el.contains(b.el) || b.el.contains(a.el)) continue
            const ox = Math.max(0, Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left))
            const oy = Math.max(0, Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top))
            const ov = ox * oy
            if (ov <= cfg.minOverlap) continue
            collisions.push({
                a: a.label,
                b: b.label,
                overlapPx: Math.round(ov),
                pctOfA: +((ov / (a.r.width * a.r.height)) * 100).toFixed(1)
            })
        }
    }

    return { viewport: vw + 'x' + vh, elementCount: all.length, overflow, clipped, collisions }
}

async function main() {
    let server = null
    if (USE_LOCAL_SERVER) {
        server = await startServer(process.cwd(), 0)
        targetUrl = 'http://127.0.0.1:' + server.address().port + '/dist/svelte/index.html'
    }

    const browser = await chromium.launch({
        headless: true,
        args: [
            '--use-gl=angle',
            '--enable-webgl',
            '--enable-unsafe-swiftshader',
            '--enable-webgl-software-rendering',
            '--no-sandbox'
        ]
    })

    const cfg = { minOverlap: MIN_OVERLAP_PX, backdropPct: BACKDROP_PCT, clipTol: CLIP_TOLERANCE_PX }
    const violations = []
    let checked = 0

    for (const w of BREAKPOINTS) {
        for (const [surface, query] of SURFACES) {
            const ctx = await browser.newContext({ viewport: { width: w, height: 800 } })
            const page = await ctx.newPage()
            await page.addInitScript(() => {
                window.__PLAYWRIGHT__ = true
                try {
                    localStorage.setItem(
                        'moco_onboarding_seen_v1',
                        JSON.stringify({ seen: true, seenAt: new Date().toISOString() })
                    )
                } catch (_e) {
                    /* ignore */
                }
            })
            let res
            try {
                await page.goto(targetUrl + query, { waitUntil: 'domcontentloaded', timeout: 30000 })
                await page.waitForTimeout(SETTLE_MS)
                res = await page.evaluate(auditPage, cfg)
                checked++
            } catch (e) {
                violations.push({ surface, width: w, kind: 'RENDER-FAIL', detail: String(e.message).slice(0, 100) })
                await ctx.close()
                continue
            }
            await ctx.close()

            // `b` is optional: single-element findings (overflow/text-clip) have
            // no counterpart, and comparing undefined === null would silently
            // fail to match every allowlist entry of that shape.
            const allow = (kind, a, b) =>
                ALLOWLIST.some(
                    (r) =>
                        r.surface === surface &&
                        r.width === w &&
                        r.kind === kind &&
                        r.a === a &&
                        (r.b === undefined || r.b === b)
                )

            for (const o of res.overflow) {
                if (!allow('overflow', o.el, null)) violations.push({ surface, width: w, kind: 'OVERFLOW', ...o })
            }
            for (const c of res.clipped) {
                if (!allow('clipped', c.el, null)) violations.push({ surface, width: w, kind: 'TEXT-CLIP', ...c })
            }
            for (const c of res.collisions) {
                if (!allow('collision', c.a, c.b)) violations.push({ surface, width: w, kind: 'COLLISION', ...c })
            }
        }
    }

    await browser.close()
    if (server) server.close()

    // Report
    const by = {}
    for (const v of violations) by[v.kind] = (by[v.kind] || 0) + 1
    console.log(`layout-integrity-contract: ${checked} surface/breakpoint combinations checked`)
    console.log('  breakpoints: ' + BREAKPOINTS.join(', '))
    console.log('  surfaces   : ' + SURFACES.map((s) => s[0]).join(', '))
    if (violations.length === 0) {
        console.log('\nNo layout violations found.')
        process.exit(0)
    }
    console.log('\nViolations by kind:')
    for (const [k, n] of Object.entries(by)) console.log(`  ${k}: ${n}`)
    console.log('\nDetail (first 25):')
    for (const v of violations.slice(0, 25)) {
        if (v.kind === 'OVERFLOW') {
            console.log(`  [${v.width} ${v.surface}] OVERFLOW ${v.el} right=${v.right} (past edge by ${v.overflowRight}px)`)
        } else if (v.kind === 'TEXT-CLIP') {
            console.log(`  [${v.width} ${v.surface}] TEXT-CLIP ${v.el} dx=${v.dx} dy=${v.dy} "${v.text}"`)
        } else if (v.kind === 'COLLISION') {
            console.log(`  [${v.width} ${v.surface}] COLLISION ${v.a} <-> ${v.b} ${v.overlapPx}px^2 (${v.pctOfA}%)`)
        } else {
            console.log(`  [${v.width} ${v.surface}] ${v.kind} ${v.detail}`)
        }
    }
    console.log(`\nlayout-integrity-contract FAILED (${violations.length} violations)`)
    process.exit(1)
}

main().catch((err) => {
    console.error('layout-integrity-contract FAILED:', err.message)
    process.exit(1)
})

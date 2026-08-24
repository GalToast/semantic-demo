#!/usr/bin/env node
/**
 * qa-boot-smoke.mjs - gate-chain boot smoke.
 *
 * WHY: size/budget gates pass on a dist that never mounts. Commit 60c2428d
 * (advancedChunks regroup) shipped with green budget gates while every boot
 * hung silently at the static loading placeholder (all assets HTTP 200, zero
 * console output, main.ts never executed). This smoke loads the built dist in
 * headless Chromium and asserts an EARLY main.ts side-effect lands within the
 * timeout - catching "chunks load but module graph dead" before a gate or
 * deploy trusts the dist.
 *
 * Boot signal: window.__LEGACY_APP_STATE__ is assigned synchronously in
 * src/main.ts before mount(); its presence proves the entry module executed.
 * We ALSO accept .app-header as a weaker DOM signal for robustness.
 *
 * Usage: node scripts/qa-boot-smoke.mjs [distDir]
 *   distDir defaults to <root>/dist/svelte
 * Exit 0 = both probe URLs booted; exit 1 = at least one stalled (details on
 * stderr). Add to gates BEFORE any size/budget/provenance check that assumes
 * a live app.
 */
/* global window, document */
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = resolve(process.argv[2] ?? join(ROOT, 'dist/svelte'))
const TIMEOUT_MS = 15_000

const MIME = {
    '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
    '.mjs': 'application/javascript', '.json': 'application/json', '.png': 'image/png',
    '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.dat': 'application/octet-stream'
}

if (!existsSync(join(DIST, 'index.html'))) {
    console.error(`[boot-smoke] FAIL: ${join(DIST, 'index.html')} not found - build first`)
    process.exit(1)
}

const server = createServer((req, res) => {
    if (res.headersSent) return
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    // Serve dist-relative first, then repo-root fallback (css/*.css links are root-relative)
    for (const base of [DIST, ROOT]) {
        try {
            const body = readFileSync(join(base, p.replace(/^\/+/, '')))
            res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream' })
            res.end(body)
            return
        } catch {
            /* try next base */
        }
    }
    if (!res.headersSent) {
        res.writeHead(404)
        res.end()
    }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port

const { chromium } = await import('playwright')
const browser = await chromium.launch({ headless: true })

// Probe matrix: plain cold boot + one deep-link self-entry boot (?q= fires
// signalReady at boot per PR-B2/B4). Both classes have broken independently.
const probes = ['?nodemo=1', '?nodemo=1&q=coffee']
let failed = false

for (const query of probes) {
    const page = await browser.newPage()
    let booted = false
    try {
        await page.goto(`http://127.0.0.1:${port}/index.html${query}`, {
            waitUntil: 'domcontentloaded',
            timeout: 20_000
        })
        const deadline = Date.now() + TIMEOUT_MS
        while (Date.now() < deadline) {
            booted = await page.evaluate(() =>
                typeof window.__LEGACY_APP_STATE__ === 'object' || !!document.querySelector('.app-header')
            )
            if (booted) break
            await page.waitForTimeout(500)
        }
    } catch (err) {
        console.error(`[boot-smoke] ${query}: navigation error: ${String(err?.message ?? err).slice(0, 120)}`)
        failed = true
        await page.close()
        continue
    }
    if (booted) {
        console.log(`[boot-smoke] PASS ${query}`)
    } else {
        failed = true
        const state = await page
            .evaluate(() => ({
                renderKind: document.body.dataset.renderKind ?? 'UNSET',
                appChildren: document.getElementById('app')?.children.length ?? -1,
                legacyState: typeof window.__LEGACY_APP_STATE__
            }))
            .catch(() => ({ evaluate: 'failed' }))
        console.error(
            `[boot-smoke] FAIL ${query}: no boot signal within ${TIMEOUT_MS}ms. ` +
                `Module graph loaded but entry never executed? State: ${JSON.stringify(state)}`
        )
    }
    await page.close()
}

await browser.close()
server.close()
process.exit(failed ? 1 : 0)

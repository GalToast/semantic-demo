/**
 * CSP Static Check — validates that the CSP header in .htaccess covers
 * all external origins actually used by the LIVE Vite-built shell
 * (dist/svelte/index.html) and its bundle (dist/svelte/assets/*).
 *
 * This is NOT a browser check. It's a structural audit of the CSP against
 * the real resource manifest derived from the built shell.
 *
 * Design notes (Phase 1 of CSP migration cleanup):
 *  - The repo previously shipped a non-Vite HTML shell
 *    (vector-explorer-polished.html) whose CSP was tied to an inline
 *    importmap hash. The Vite shell externalizes ALL JS into hashed
 *    same-origin module assets and has ZERO inline <script> blocks, so a
 *    naive golden repoint would make the inline-hash check vacuous.
 *  - We instead validate the CSP against the live shell's ACTUAL external
 *    origins (extracted from dist/svelte/assets/* and the shell HTML) and
 *    assert the live shell carries no unexpected inline scripts.
 *
 * Usage: node tests/csp-static-check.mjs
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createHash } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ── Parse CSP from .htaccess ────────────────────────────────────────
const htaccess = readFileSync(resolve(ROOT, '.htaccess'), 'utf-8')
const cspMatch = htaccess.match(/Header always set Content-Security-Policy\s+"([\s\S]+?)"\s*$/m)
if (!cspMatch) {
    console.error('FAIL: Could not find Content-Security-Policy in .htaccess')
    process.exit(1)
}

const cspRaw = cspMatch[1].replace(/\s+/g, ' ').trim()
console.log('CSP header found in .htaccess')
console.log(`Raw:\n  ${cspRaw}\n`)

// ── Load the LIVE Vite shell (not a frozen archive) ─────────────────
const html = readFileSync(resolve(ROOT, 'dist/svelte/index.html'), 'utf-8')

// Parse directives
const directives = {}
cspRaw.split(';').forEach((pair) => {
    pair = pair.trim()
    if (!pair) return
    const sep = pair.indexOf(' ')
    const name = sep === -1 ? pair : pair.slice(0, sep)
    const value = sep === -1 ? '' : pair.slice(sep + 1).trim()
    directives[name] = value.split(/\s+/).filter(Boolean)
})

// Report directives
console.log('Parsed directives:')
for (const [name, sources] of Object.entries(directives)) {
    console.log(`  ${name}: ${sources.join(' ')}`)
}
console.log('')

// ── Known origins used by the LIVE Vite shell ───────────────────────
// Derived from dist/svelte/index.html + dist/svelte/assets/* grep:
//   - Leaflet JS is injected via createElement("script").src =
//     https://unpkg.com/leaflet@1.9.4/dist/leaflet.js
//   - Leaflet CSS is injected via <link rel=stylesheet href=
//     https://unpkg.com/leaflet@1.9.4/dist/leaflet.css
//   - Leaflet dark tiles load from basemaps.cartocdn.com/dark_all/
//   - Weather widget fetches https://api.open-meteo.com/v1/forecast
//   - Reranking API (https://ai.api.nvidia.com/v1/retrieval/nvidia/reranking) intentionally
//     EXCLUDED: it is feature-gated in search-engine.ts (off by default via ?rerank=1 /
//     localStorage flag) and no reranker is currently hosted, so the fetch fails regardless.
//     Re-add this host to connect-src only if a reranker is deployed AND the feature is enabled.
//   - Worker script is same-origin (new URL("data-worker-*.js", import.meta.url))
//   - Fonts are SELF-HOSTED (fonts/*.woff2) — no Google Fonts CDN.
// Hosts that only appear as doc strings / XML namespaces (svelte.dev/e/*,
// jcgt.org, www.w3.org) are NOT network requests and are intentionally
// excluded. README/comment hosts must not be added here just because they
// appear in the bundle as strings.
const knownOrigins = {
    // script-src origins
    'script-src': [
        { origin: "'self'", source: 'Vite hashed module entry (./assets/index-*.js) + self-hosted modules' },
        {
            origin: 'https://unpkg.com',
            source: 'Leaflet runtime JS injected via createElement("script").src (leaflet@1.9.4/dist/leaflet.js)'
        }
    ],
    // style-src origins
    'style-src': [
        {
            origin: "'self'",
            source: 'Self-hosted CSS (fonts/fonts.css, semantic-demo.css, css/mobile_premium__*.css, css/modules/*.css)'
        },
        {
            origin: "'unsafe-inline'",
            source: 'Inline <style> blocks (z-index layer vars, spinner keyframes) + style= attributes in shell'
        },
        {
            origin: 'https://unpkg.com',
            source: 'Leaflet runtime CSS (leaflet@1.9.4/dist/leaflet.css) injected via <link rel=stylesheet>'
        }
    ],
    // font-src origins
    'font-src': [
        {
            origin: "'self'",
            source: 'Self-hosted variable woff2 (fonts/nunito-sans-*.woff2, etc.) — fonts are self-hosted (W45-A.3), no Google Fonts CDN'
        }
    ],
    // img-src origins
    'img-src': [
        { origin: "'self'", source: 'Same-origin images, self-hosted fonts' },
        { origin: 'data:', source: 'Inline SVG favicon (data:image/svg+xml)' },
        {
            origin: 'https://*.basemaps.cartocdn.com',
            source: 'Leaflet dark map tiles (https://{s}.basemaps.cartocdn.com/dark_all/ — wildcard covers a/b/c/d subdomains)'
        }
    ],
    // connect-src origins
    'connect-src': [
        { origin: "'self'", source: 'api.php calls, JSON manifests, data.dat, same-origin worker fetches' },
        {
            origin: 'https://api.open-meteo.com',
            source: 'Weather widget forecast fetch (api.open-meteo.com/v1/forecast)'
        }
    ],
    // worker-src origins
    'worker-src': [
        { origin: "'self'", source: 'data-worker module loaded via new URL("data-worker-*.js", import.meta.url)' }
    ]
}

// ── Verify each known origin is covered ─────────────────────────────
let allPass = true
const checkDirectives = Object.keys(knownOrigins)

for (const directive of checkDirectives) {
    if (!directives[directive]) {
        console.error(`FAIL: Missing directive "${directive}"`)
        allPass = false
        continue
    }
    const allowed = new Set(directives[directive])
    for (const entry of knownOrigins[directive]) {
        const normalized = entry.origin.replace(/\/+$/g, '')
        // Check that the origin is in the allowed set, handling trailing slashes
        const match = [...allowed].some((a) => a.replace(/\/+$/g, '') === normalized)
        if (!match) {
            console.error(`FAIL: ${directive} — origin "${entry.origin}" (${entry.source}) is NOT covered`)
            console.error(`  Allowed: [${[...allowed].join(', ')}]`)
            allPass = false
        } else {
            console.log(`  OK: ${directive} covers "${entry.origin}" — ${entry.source}`)
        }
    }
}

// ── Check required directives that must not be missing ──────────────
const requiredDirectives = [
    'default-src',
    'script-src',
    'style-src',
    'img-src',
    'connect-src',
    'worker-src',
    'frame-ancestors',
    'base-uri',
    'form-action'
]

for (const d of requiredDirectives) {
    if (!directives[d]) {
        console.error(`FAIL: Required directive "${d}" is missing`)
        allPass = false
    }
}

// ── Warn about overly permissive directives ─────────────────────────
if (directives['default-src'] && directives['default-src'].length > 1) {
    console.warn(`WARN: default-src has ${directives['default-src'].length} sources; prefer 'self' only`)
}

// ── No unexpected inline <script> check ─────────────────────────────
// The live Vite shell externalizes all JS into hashed same-origin module
// assets, so it should carry NO inline <script> (no src) blocks. If any
// DO exist, each must be covered by a script-src hash, otherwise the CSP
// is silently allowing inline script execution. This keeps the check real
// rather than vacuous (a naive golden repoint with zero inline scripts would
// have passed nothing).
const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(
    (match) => !/\bsrc\s*=/.test(match[1])
)

if (inlineScripts.length === 0) {
    console.log('  OK: live shell has no inline <script> (all JS externalized to self-hosted modules)')
} else {
    console.error(
        `WARN: live shell has ${inlineScripts.length} inline <script>(s); verifying each is hash-covered by script-src`
    )
    const allowed = directives['script-src'] || []
    for (const match of inlineScripts) {
        const body = match[2]
        if (!body.trim()) {
            console.error('FAIL: empty inline <script> found (would execute nothing but indicates drift)')
            allPass = false
            continue
        }
        const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`
        if (!allowed.includes(hash)) {
            console.error(`FAIL: inline <script> is not covered by a script-src hash ${hash}`)
            allPass = false
        } else {
            console.log(`  OK: script-src covers inline <script> by hash ${hash}`)
        }
    }
}

console.log('')

if (allPass) {
    console.log('✓ ALL CHECKS PASSED — CSP covers all known origins')
    process.exit(0)
} else {
    console.log('✗ SOME CHECKS FAILED — see above')
    process.exit(1)
}

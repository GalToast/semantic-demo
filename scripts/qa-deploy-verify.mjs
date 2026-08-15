#!/usr/bin/env node
/**
 * qa-deploy-verify.mjs — Post-deploy verification for Apache precompressed-twin serving.
 *
 * Probes a live host and asserts the .htaccess rules landed correctly:
 *   (a) index.html returns 200
 *   (b) a JS/CSS asset with Accept-Encoding: br serves Content-Encoding: br (or gzip fallback)
 *       and Content-Type: application/javascript (module MIME rule)
 *   (c) the .br twin URL returns non-404 (twin exists on disk)
 *   (d) the legacy /view map URL issues a 308 redirect (dual-url normalization)
 *   (e) Vary includes Accept-Encoding on the asset response
 *
 * Usage:
 *   node scripts/qa-deploy-verify.mjs [baseURL]
 *   node scripts/qa-deploy-verify.mjs https://example.com
 *   node scripts/qa-deploy-verify.mjs https://example.com --asset=/dist/svelte/assets/foo-abc123.js
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more checks failed
 *   2 — bad input (no host, --help, missing --asset value)
 */

import http from 'node:http'
import https from 'node:https'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// ── Arg parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node scripts/qa-deploy-verify.mjs [baseURL] [options]

Probes a deployed semantic-explorer host for correct precompressed-twin
serving (.htaccess rules from commit bea7f839).

Arguments:
  baseURL          Full origin + path prefix, e.g. https://mccullough.cloud/semantic-demo
                   Defaults to https://$HOST if $HOST is set.

Options:
  --asset=<path>   Asset path to probe (default: first *.js found in dist/svelte/assets/
                   after build). Must start with /. Examples:
                     --asset=/dist/svelte/assets/Canvas-DhvxfoxS.js
                     --asset=/dist/svelte/assets/Canvas-7ek6LVry.css
  --help, -h       Show this help text and exit 0.

Exit codes:
  0  All checks passed
  1  One or more checks failed
  2  Bad input (no host, missing --asset value, etc.)

Examples:
  node scripts/qa-deploy-verify.mjs https://mccullough.cloud/semantic-demo
  node scripts/qa-deploy-verify.mjs https://mccullough.cloud/semantic-demo \\
      --asset=/dist/svelte/assets/Canvas-DhvxfoxS.js
`)
  process.exit(0)
}

function getFlagValue(name) {
  for (const a of args) {
    if (a.startsWith(`${name}=`)) return a.slice(name.length + 1)
  }
  const i = args.indexOf(name)
  if (i !== -1 && i + 1 < args.length) return args[i + 1]
  return undefined
}

const hasFlag = (name) => args.includes(name)

const overrideAsset = getFlagValue('--asset')

// Resolve base URL
let baseURL = ''
if (args.length > 0 && !args[0].startsWith('--')) {
  baseURL = args[0]
} else if (process.env.HOST) {
  baseURL = `https://${process.env.HOST}`
}

if (!baseURL) {
  console.error('ERROR: No base URL provided and $HOST is not set.')
  console.error('Usage: node scripts/qa-deploy-verify.mjs <baseURL> [--asset=<path>]')
  process.exit(2)
}

// Strip trailing slash
baseURL = baseURL.replace(/\/$/, '')

// Validate URL shape
let parsedURL
try {
  parsedURL = new URL(baseURL)
  if (!['http:', 'https:'].includes(parsedURL.protocol)) {
    throw new Error('protocol must be http: or https:')
  }
} catch (e) {
  console.error(`ERROR: Invalid base URL "${baseURL}": ${e.message}`)
  process.exit(2)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Make an HTTP(S) HEAD request and return { status, headers }.
 */
function head(urlString, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlString)
    const mod = u.protocol === 'https:' ? https : http
    const req = mod.request(
      {
        method: 'HEAD',
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        headers: {
          'Accept-Encoding': 'br,gzip,zstd',
          'User-Agent': 'qa-deploy-verify/1.0',
          ...extraHeaders,
        },
        timeout: 8000,
      },
      (res) => {
        // Consume body to free socket
        res.resume()
        resolve({ status: res.statusCode, headers: res.headers })
      },
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('timeout'))
    })
    req.end()
  })
}

/**
 * Make an HTTP(S) GET request (for asset body probe) and return { status, headers, body }.
 */
function get(urlString, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlString)
    const mod = u.protocol === 'https:' ? https : http
    const req = mod.request(
      {
        method: 'GET',
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        headers: {
          'Accept-Encoding': 'br,gzip',
          'User-Agent': 'qa-deploy-verify/1.0',
          ...extraHeaders,
        },
        timeout: 10000,
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })
        })
        res.on('error', reject)
      },
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('timeout'))
    })
    req.end()
  })
}

/**
 * Resolve a relative asset path against baseURL.
 */
function resolveAssetPath(pathArg) {
  // Ensure leading slash
  const p = pathArg.startsWith('/') ? pathArg : `/${pathArg}`
  return `${baseURL}${p}`
}

// ── Find default asset from local dist ───────────────────────────────────────

async function findDefaultAsset() {
  if (overrideAsset) return overrideAsset

  // Read dist index.html to find an asset reference
  const fs = await import('node:fs')
  const path = await import('node:path')
  const { fileURLToPath: fu2 } = await import('node:url')

  const distHTML = path.resolve(__dirname, '..', 'dist', 'svelte', 'index.html')
  if (!fs.default.existsSync(distHTML)) {
    console.error('SKIP-ASSET: No dist/svelte/index.html found locally; pass --asset=')
    return null
  }

  const html = fs.default.readFileSync(distHTML, 'utf8')
  // Match <script src="/dist/svelte/assets/xxx.js"> or similar
  const m = html.match(/src="(\/dist\/svelte\/assets\/[^"]+\.js)"/)
  if (m) return m[1]

  // Fallback: scan dist/svelte/assets/*.js
  const assetsDir = path.resolve(__dirname, '..', 'dist', 'svelte', 'assets')
  if (fs.default.existsSync(assetsDir)) {
    const entries = fs.default.readdirSync(assetsDir).filter((f) => f.endsWith('.js')).sort()
    if (entries.length > 0) return `/dist/svelte/assets/${entries[0]}`
  }

  console.error('SKIP-ASSET: No .js asset found in dist/svelte/assets/; pass --asset=')
  return null
}

// ── Result tracking ──────────────────────────────────────────────────────────

const results = [] // { check, pass, detail }

function record(check, pass, detail = '') {
  results.push({ check, pass, detail })
  const tag = pass ? 'PASS' : 'FAIL'
  console.log(`[${tag}] ${check}${detail ? ': ' + detail : ''}`)
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // 0. Discover asset to probe
  const assetPath = await findDefaultAsset()

  // 1. Check (a): index.html 200
  const idx = await head(`${baseURL}/`)
  record(
    'index.html',
    idx.status === 200,
    `HTTP ${idx.status}`,
  )

  // 2. Check (b): asset with Accept-Encoding: br → Content-Encoding is br (or gzip) + JS MIME
  let assetProbe = null
  if (assetPath) {
    assetProbe = await get(resolveAssetPath(assetPath))
    const ce = (assetProbe.headers['content-encoding'] || '').toLowerCase()
    const ct = (assetProbe.headers['content-type'] || '').toLowerCase()
    const ceOk = ce === 'br' || ce === 'gzip'
    const ctOk = ct.startsWith('application/javascript')
    record(
      'asset Content-Encoding',
      ceOk,
      `got "${ce}" (expected br or gzip)`,
    )
    record(
      'asset Content-Type (module MIME)',
      ctOk,
      `got "${ct}" (expected application/javascript)`,
    )
  } else {
    record('asset Content-Encoding', false, 'no asset path available (pass --asset=)')
    record('asset Content-Type', false, 'no asset path available')
  }

  // 3. Check (c): twin .br URL returns non-404
  if (assetPath) {
    const brURL = resolveAssetPath(assetPath + '.br')
    const twin = await head(brURL)
    record(
      'asset .br twin exists',
      twin.status !== 404,
      `HTTP ${twin.status} for ${assetPath}.br`,
    )
  } else {
    record('asset .br twin exists', false, 'no asset path available')
  }

  // 4. Check (d): legacy /view map URL → 308
  // The .htaccess has: Redirect 308 /semantic-demo/vector-explorer-polished.html /semantic-demo/index.html
  // Also test the generic /view path if the host supports it.
  // We try a few canonical legacy routes.
  const legacyRoutes = [
    '/semantic-demo/vector-explorer-polished.html',
    '/view',
  ]
  let legacyFound308 = false
  let legacyDetail = []
  for (const route of legacyRoutes) {
    const r = await head(`${baseURL}${route}`)
    if (r.status === 308) {
      legacyFound308 = true
      legacyDetail.push(`${route} → 308`)
    } else {
      legacyDetail.push(`${route} → ${r.status}`)
    }
  }
  record(
    'legacy map URL → 308',
    legacyFound308,
    legacyDetail.join(' | '),
  )

  // 5. Check (e): Vary includes Accept-Encoding on the asset response
  if (assetProbe) {
    const vary = (assetProbe.headers['vary'] || '').toLowerCase()
    const varyOk = vary.includes('accept-encoding')
    record(
      'Vary includes Accept-Encoding',
      varyOk,
      `got "${assetProbe.headers['vary'] || '(none)'}`  ,
    )
  } else {
    record('Vary', false, 'no asset probe')
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const failCount = results.filter((r) => !r.pass).length
  if (failCount > 0) {
    console.log(`\nFAILED: ${failCount}/${results.length} checks`)
    process.exit(1)
  }
  console.log(`\nPASSED: ${results.length}/${results.length} checks`)
  process.exit(0)
}

main().catch((err) => {
  console.error(`FATAL: ${err.message}`)
  // If the host is unreachable at all, exit 2 so CI knows it wasn't green
  process.exit(2)
})

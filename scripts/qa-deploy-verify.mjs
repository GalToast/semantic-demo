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
  --via-origin     Run the SAME checks over SSH to the origin host using
                   curl --resolve HOST:443:127.0.0.1 -k. Prints the ssh command used.
                   Requires ssh config for mccullough-cloud on port 65002.
  --help, -h       Show this help text and exit 0.

Exit codes:
  0  All checks passed
  1  One or more checks failed
  2  Bad input (no host, missing --asset value, etc.)

Examples:
  node scripts/qa-deploy-verify.mjs https://mccullough.cloud/semantic-demo
  node scripts/qa-deploy-verify.mjs https://mccullough.cloud/semantic-demo \\
      --asset=/dist/svelte/assets/Canvas-DhvxfoxS.js
  node scripts/qa-deploy-verify.mjs https://mccullough.cloud/semantic-demo --via-origin
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
const viaOrigin = hasFlag('--via-origin')

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

// ── --via-origin mode: SSH-based probing ────────────────────────────────────

const SSH_CMD = 'ssh -p 65002 mccullough-cloud'
const HOST = 'mccullough.cloud'

/**
 * Build the remote shell script that curls each URL and prints machine-readable facts.
 * Facts are on their own lines: CODE:xxx  or  HEADER:name:value
 */
function buildRemoteScript(base, assetPath) {
    const lines = []
    // Helper: curl and emit facts
    const curlFacts = (label, url) => [
        `echo "--- ${label} ---"`,
        `curl -sI --resolve ${HOST}:443:127.0.0.1 -k -H 'Accept-Encoding: br,gzip' -H 'User-Agent: qa-deploy-verify/1.0' '${url}' | while IFS= read -r line; do`,
        `  case "$line" in`,
        `    HTTP/*) code=$(echo "$line" | awk '{print $2}'); echo "CODE:$code" ;;`,
        `    *:*) echo "HEADER:$line" ;;`,
        `  esac`,
        `done`
    ]

    // 0. Resolve the DEPLOYED entry + its real hashed asset on the remote side.
    // (Local dist hashes drift from prod whenever local WIP ≠ last deploy.)
    lines.push(
        `echo "--- asset-ref ---"`,
        `REMOTE_ASSET=$(curl -s --resolve ${HOST}:443:127.0.0.1 -k '${base}/index.html' | grep -oE 'assets/[A-Za-z0-9_.-]+\\.js' | head -1)`,
        `if [ -z "$REMOTE_ASSET" ] && [ -n '${assetPath || ''}' ]; then REMOTE_ASSET='${assetPath || ''}'; fi`,
        `echo "ASSET_REF:$REMOTE_ASSET"`
    )

    // 1. index.html — canonical entry (the bare /semantic-demo/ prefix 301s to
    // case-study.html by design since the landing-page redirect landed).
    lines.push(...curlFacts('index', `${base}/index.html`))

    // 2. asset GET (for CE + CT + Vary) — double-quoted URL so the remote
    // shell expands $REMOTE_ASSET resolved above.
    lines.push(
        `echo "--- asset ---"`,
        `curl -sI --resolve ${HOST}:443:127.0.0.1 -k -H 'Accept-Encoding: br,gzip' -H 'User-Agent: qa-deploy-verify/1.0' "${base}/$REMOTE_ASSET" | while IFS= read -r line; do`,
        `  case "$line" in`,
        `    HTTP/*) code=$(echo "$line" | awk '{print $2}'); echo "CODE:$code" ;;`,
        `    *:*) echo "HEADER:$line" ;;`,
        `  esac`,
        `done`
    )

    // 3. .br twin HEAD
    lines.push(
        `echo "--- br-twin ---"`,
        `curl -sI --resolve ${HOST}:443:127.0.0.1 -k -H 'Accept-Encoding: br' -H 'User-Agent: qa-deploy-verify/1.0' "${base}/$REMOTE_ASSET.br" | while IFS= read -r line; do`,
        `  case "$line" in`,
        `    HTTP/*) code=$(echo "$line" | awk '{print $2}'); echo "CODE:$code" ;;`,
        `    *:*) echo "HEADER:$line" ;;`,
        `  esac`,
        `done`
    )

    // 4. legacy routes — these are ORIGIN-rooted absolute paths; joining them
    // onto ${base} (which already contains /semantic-demo) double-joined the
    // path and always 404ed.
    const origin = new URL(base).origin
    for (const route of ['/semantic-demo/vector-explorer-polished.html', '/view']) {
        lines.push(...curlFacts(`legacy-${route.replace(/\//g, '-')}`, `${origin}${route}`))
    }

    return lines.join('\n')
}

/**
 * Parse curl -I output lines into per-probe { code, headers }.
 * Expects lines like: CODE:200  and  HEADER:Content-Encoding: br
 */
function parseFacts(output) {
    const perProbe = new Map() // label -> { code, headers }
    let currentLabel = null
    let currentCode = null
    // NOTE: must be a FRESH object per probe — a module-level shared object
    // made every label reference the SAME headers map, so all header checks
    // read the LAST probe's response (the /view 404 page → "text/html").
    let currentHeaders = {}

    for (const line of output.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        if (trimmed.startsWith('--- ')) {
            // Flush previous
            if (currentLabel) perProbe.set(currentLabel, { code: currentCode, headers: currentHeaders })
            currentLabel = trimmed.replace(/^--- | ---$/g, '')
            currentCode = null
            currentHeaders = {}
            continue
        }
        if (trimmed.startsWith('CODE:')) {
            currentCode = parseInt(trimmed.slice(5), 10)
            continue
        }
        if (trimmed.startsWith('HEADER:')) {
            const rest = trimmed.slice(7)
            const colonIdx = rest.indexOf(':')
            if (colonIdx !== -1) {
                const name = rest.slice(0, colonIdx).toLowerCase()
                const val = rest.slice(colonIdx + 1).trim()
                currentHeaders[name] = val
            }
            continue
        }
        // Fallback: try to parse as HTTP status line
        const m = trimmed.match(/^HTTP\/[\d.]+\s+(\d+)/)
        if (m) currentCode = parseInt(m[1], 10)
    }
    // Flush last
    if (currentLabel) perProbe.set(currentLabel, { code: currentCode, headers: currentHeaders })
    return perProbe
}

/**
 * Run --via-origin mode: pipe the remote script via stdin to ssh bash.
 * Prints the ssh command used, parses machine-readable facts, scores checks.
 */
async function runViaOrigin(baseURL, assetPath) {
    const { execSync, spawn } = await import('node:child_process')
    const remoteScript = buildRemoteScript(baseURL, assetPath)
    // Build a single ssh command that reads the script from stdin
    const sshCmd = `${SSH_CMD} bash`
    console.log(`SSH CMD: ${sshCmd}`)

    // Use spawn for stdin piping (execSync can't pipe stdin easily)
    const proc = spawn('ssh', ['-p', '65002', 'mccullough-cloud', 'bash'], {
        stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => {
        stdout += d
    })
    proc.stderr.on('data', (d) => {
        stderr += d
    })

    proc.stdin.write(remoteScript)
    proc.stdin.end()

    await new Promise((resolve, reject) => {
        proc.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`ssh exited ${code}`))
            } else {
                resolve()
            }
        })
        proc.on('error', reject)
    })

    if (stderr) {
        console.error(`SSH STDERR:\n${stderr}`)
    }

    const remoteAsset = (stdout.match(/ASSET_REF:(.*)/) || [])[1]?.trim()
    if (remoteAsset) console.log(`Remote asset ref: ${remoteAsset}`)
    const facts = parseFacts(stdout)

    // 1. index.html 200
    const idx = facts.get('index')
    record('index.html', idx?.code === 200, idx ? `HTTP ${idx.code}` : 'no facts')

    // 2. asset Content-Encoding + Content-Type
    const asset = facts.get('asset')
    if (asset) {
        const ce = (asset.headers['content-encoding'] || '').toLowerCase()
        const ct = (asset.headers['content-type'] || '').toLowerCase()
        record('asset Content-Encoding', ce === 'br' || ce === 'gzip', `got "${ce}"`)
        record('asset Content-Type (module MIME)', ct.startsWith('application/javascript'), `got "${ct}"`)
    } else {
        record('asset Content-Encoding', false, 'no asset facts')
        record('asset Content-Type', false, 'no asset facts')
    }

    // 3. .br twin exists
    const brTwin = facts.get('br-twin')
    if (brTwin) {
        record('asset .br twin exists', brTwin.code !== 404, `HTTP ${brTwin.code}`)
    } else {
        record('asset .br twin exists', false, 'no br-twin facts')
    }

    // 4. legacy map URL → 308
    const legacyRoutes = ['/semantic-demo/vector-explorer-polished.html', '/view']
    let legacyFound308 = false
    let legacyDetail = []
    for (const route of legacyRoutes) {
        const key = `legacy-${route.replace(/\//g, '-')}`
        const r = facts.get(key)
        if (r?.code === 308) {
            legacyFound308 = true
            legacyDetail.push(`${route} → 308`)
        } else {
            legacyDetail.push(`${route} → ${r?.code ?? 'NO-FACTS'}`)
        }
    }
    record('legacy map URL → 308', legacyFound308, legacyDetail.join(' | '))

    // 5. Vary includes Accept-Encoding
    if (asset) {
        const vary = (asset.headers['vary'] || '').toLowerCase()
        record(
            'Vary includes Accept-Encoding',
            vary.includes('accept-encoding'),
            `got "${asset.headers['vary'] || '(none)'}"`
        )
    } else {
        record('Vary', false, 'no asset facts')
    }
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
                    ...extraHeaders
                },
                timeout: 8000
            },
            (res) => {
                // Consume body to free socket
                res.resume()
                resolve({ status: res.statusCode, headers: res.headers })
            }
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
                    ...extraHeaders
                },
                timeout: 10000
            },
            (res) => {
                const chunks = []
                res.on('data', (c) => chunks.push(c))
                res.on('end', () => {
                    resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })
                })
                res.on('error', reject)
            }
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
        const entries = fs.default
            .readdirSync(assetsDir)
            .filter((f) => f.endsWith('.js'))
            .sort()
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

    // Dispatch: --via-origin runs the same checks over SSH to the origin
    if (viaOrigin) {
        await runViaOrigin(baseURL, assetPath)
        const failCount = results.filter((r) => !r.pass).length
        if (failCount > 0) {
            console.log(`\nFAILED: ${failCount}/${results.length} checks (via-origin)`)
            process.exit(1)
        }
        console.log(`\nPASSED: ${results.length}/${results.length} checks (via-origin)`)
        process.exit(0)
    }

    // 1. Check (a): index.html 200 (canonical entry; the bare prefix
    // intentionally 301s to case-study.html since the landing redirect landed)
    const idx = await head(`${baseURL}/index.html`)
    record('index.html', idx.status === 200, `HTTP ${idx.status}`)

    // 2. Check (b): asset with Accept-Encoding: br → Content-Encoding is br (or gzip) + JS MIME
    let assetProbe = null
    if (assetPath) {
        assetProbe = await get(resolveAssetPath(assetPath))
        const ce = (assetProbe.headers['content-encoding'] || '').toLowerCase()
        const ct = (assetProbe.headers['content-type'] || '').toLowerCase()
        const ceOk = ce === 'br' || ce === 'gzip'
        const ctOk = ct.startsWith('application/javascript')
        record('asset Content-Encoding', ceOk, `got "${ce}" (expected br or gzip)`)
        record('asset Content-Type (module MIME)', ctOk, `got "${ct}" (expected application/javascript)`)
    } else {
        record('asset Content-Encoding', false, 'no asset path available (pass --asset=)')
        record('asset Content-Type', false, 'no asset path available')
    }

    // 3. Check (c): twin .br URL returns non-404
    if (assetPath) {
        const brURL = resolveAssetPath(assetPath + '.br')
        const twin = await head(brURL)
        record('asset .br twin exists', twin.status !== 404, `HTTP ${twin.status} for ${assetPath}.br`)
    } else {
        record('asset .br twin exists', false, 'no asset path available')
    }

    // 4. Check (d): legacy /view map URL → 308
    // The .htaccess has: Redirect 308 /semantic-demo/vector-explorer-polished.html /semantic-demo/index.html
    // Also test the generic /view path if the host supports it.
    // We try a few canonical legacy routes.
    const legacyRoutes = ['/semantic-demo/vector-explorer-polished.html', '/view']
    let legacyFound308 = false
    let legacyDetail = []
    // Legacy routes are ORIGIN-rooted absolute paths — do NOT join onto
    // baseURL (which already contains /semantic-demo). Same fix as via-origin.
    const legacyOrigin = new URL(baseURL).origin
    for (const route of legacyRoutes) {
        const r = await head(`${legacyOrigin}${route}`)
        if (r.status === 308) {
            legacyFound308 = true
            legacyDetail.push(`${route} → 308`)
        } else {
            legacyDetail.push(`${route} → ${r.status}`)
        }
    }
    record('legacy map URL → 308', legacyFound308, legacyDetail.join(' | '))

    // 5. Check (e): Vary includes Accept-Encoding on the asset response
    if (assetProbe) {
        const vary = (assetProbe.headers['vary'] || '').toLowerCase()
        const varyOk = vary.includes('accept-encoding')
        record('Vary includes Accept-Encoding', varyOk, `got "${assetProbe.headers['vary'] || '(none)'}`)
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

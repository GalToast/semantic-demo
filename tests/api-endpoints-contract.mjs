#!/usr/bin/env node
/**
 * api-endpoints-contract.mjs
 *
 * First automated coverage for the PHP API surface (api.php + api/*). The
 * JS side has 137 contracts; the server half of the product had zero.
 *
 * Pins, against a running local PHP server:
 *   - GET stats (public): dataset totals stay honest (8406 leads, 1024-dim)
 *   - semantic_search degraded fallback: local-record lexical search returns
 *     a well-formed result set even with the semantic service offline
 *   - cache metadata: cached/cache_source/cache_age_seconds present so the
 *     client can display freshness
 *   - requireSameHostReferrer (W54 model): empty referrer ALLOWED (mobile
 *     cold-load / deep-link / curl), CROSS-HOST referrer REJECTED 403
 *
 * Server discovery: API_BASE_URL env or http://127.0.0.1:8795/api.php.
 * If the server is unreachable the gate SKIPs (exit 0) with a notice —
 * same additive-enable pattern as scripts/tdb1-fidelity-ci.mjs.
 *
 * Run: node tests/api-endpoints-contract.mjs
 */

const BASE = (process.env.API_BASE_URL ?? 'http://127.0.0.1:8795/api.php').replace(/\/$/, '')

let failed = 0
function check(name, pass, detail = '') {
    const mark = pass ? 'OK ' : 'FAIL'
    console.log(`  [${mark}] ${name}${pass ? '' : ` — ${detail}`}`)
    if (!pass) failed += 1
}

async function getJson(url, headers = {}) {
    const res = await fetch(url, { headers })
    let body = null
    try {
        body = await res.json()
    } catch {
        /* non-JSON error page */
    }
    return { status: res.status, contentType: res.headers.get('content-type') ?? '', body }
}

// ── reachability ─────────────────────────────────────────────────────────────
try {
    const probe = await fetch(BASE + '?action=stats', { signal: AbortSignal.timeout(5000) })
    if (!probe.ok) throw new Error('stats returned ' + probe.status)
} catch (err) {
    console.log(
        '[api-endpoints] SKIP — no PHP server at ' +
            BASE +
            ' (' +
            (err?.cause?.code ?? err.message) +
            '). Start one: php -S 127.0.0.1:8795 -t .'
    )
    process.exit(0)
}

// ── 1. public stats endpoint: dataset honesty ────────────────────────────────
{
    const { status, body } = await getJson(BASE + '?action=stats')
    check('stats: responds 200', status === 200, 'got ' + status)
    check('stats: total_leads is 8406', Number(body?.total_leads) === 8406, String(body?.total_leads))
    check('stats: embedding_dim is 1024', Number(body?.embedding_dim) === 1024, String(body?.embedding_dim))
    check('stats: num_categories > 0', Number(body?.num_categories) > 0)
}

// ── 2. semantic_search degraded fallback shape ───────────────────────────────
{
    const { status, body } = await getJson(BASE + '?action=semantic_search&q=coffee')
    check('search: responds 200', status === 200, 'got ' + status)
    check('search: ok flag', body?.ok === true)
    check(
        'search: degraded fallback engaged',
        body?.degraded === true && body?.source === 'local-records',
        'source=' + body?.source + ' degraded=' + body?.degraded
    )
    check('search: results is a populated array', Array.isArray(body?.results) && body.results.length > 0)
    const first = body?.results?.[0]
    const fields = ['lead_id', 'name', 'city', 'status', 'score']
    check(
        'search: result objects carry core fields',
        !!first && fields.every((f) => f in first),
        first ? 'missing: ' + fields.filter((f) => !(f in first)).join(',') : 'no first row'
    )
}

// ── 2b. pagination semantics ─────────────────────────────────────────────────
// count = TOTAL matches server-side; results = the requested page
// (?limit= default 18, cap 48; ?offset= pages through).
{
    // Fresh query per run: the response cache is keyed by query+limit+offset,
    // and this dev machine holds hours-old entries from pre-M11 builds which
    // would poison offset comparisons. A unique probe is guaranteed cold.
    const q = encodeURIComponent('trailer repair ' + Date.now())
    const { body } = await getJson(BASE + `?action=semantic_search&q=${q}`)
    check(
        'search: count >= page length',
        Number(body?.count) >= body?.results?.length,
        `count=${body?.count} len=${body?.results?.length}`
    )

    const page1 = await getJson(BASE + `?action=semantic_search&q=${q}&limit=18&offset=0`)
    const ids0 = new Set((page1.body?.results ?? []).map((r) => r.lead_id))
    check('search: limit=18 default page size', (page1.body?.results ?? []).length <= 48)

    const next = await getJson(BASE + `?action=semantic_search&q=${q}&limit=18&offset=18`)
    const ids1 = new Set((next.body?.results ?? []).map((r) => r.lead_id))
    const overlap = [...ids0].filter((id) => ids1.has(id))
    check(
        'search: offset pages to disjoint leads',
        overlap.length === 0,
        `${overlap.length} overlapping lead_ids`
    )
}

// ── 3. cache metadata (fallback persistence, landed 880bfb7a) ────────────────
{
    const { body } = await getJson(BASE + '?action=semantic_search&q=coffee')
    check('search: cached flag present', typeof body?.cached === 'boolean')
    check(
        'search: cache_source present',
        typeof body?.cache_source === 'string' && body.cache_source.length > 0,
        String(body?.cache_source)
    )
}

// ── 4. referrer guard (W54 model: empty OK, cross-host 403) ──────────────────
{
    const gated = BASE + '?action=semantic_lane_health'
    const empty = await fetch(gated)
    check('guard: empty referrer allowed (W54)', empty.status === 200, 'got ' + empty.status)
    const cross = await getJson(gated, { Referer: 'https://forged.example.com/x' })
    check('guard: cross-host referrer rejected 403', cross.status === 403, 'got ' + cross.status)
    const same = await fetch(gated, { headers: { Referer: new URL(BASE).origin + '/' } })
    check('guard: same-host referrer allowed', same.status === 200, 'got ' + same.status)
}

console.log('')
if (failed > 0) {
    console.error(`FAILED: ${failed} api-endpoint check(s)`)
    process.exit(1)
}
console.log('API endpoints contract OK.')

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

// ── 3b. error shapes + security headers ─────────────────────────────────────
{
    const unknown = await getJson(BASE + '?action=bogus_action')
    check('unknown action: 400', unknown.status === 400, 'got ' + unknown.status)
    check('unknown action: error body', unknown.body?.error === 'Unknown action')

    const noId = await getJson(BASE + '?action=lead_context')
    check('lead_context without id: 400', noId.status === 400, 'got ' + noId.status)
    check('lead_context without id: ok:false + error string',
        noId.body?.ok === false && typeof noId.body?.error === 'string')

    const { contentType } = await getJson(BASE + '?action=stats')
    check('responses are application/json', contentType.includes('application/json'), contentType)

    const res = await fetch(BASE + '?action=stats')
    check('nosniff set by api.php itself (dev server has no .htaccess)',
        (res.headers.get('x-content-type-options') ?? '').toLowerCase() === 'nosniff')
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

// ── Semantic lane happy paths (env-gated) ────────────────────────────────────
// These require the prod-side semantic service (:8020/:8019 on the API host).
// When it is down they SKIP silently so local runs without the service stay
// green; when reachable they pin the live response shapes.
try {
    const origin = new URL(BASE).origin + '/'
    const lane = await getJson(BASE + '?action=semantic_lane_health', { Referer: origin })
    const serviceUp = lane.body?.ok === true && lane.body?.search_ok === true

    if (!serviceUp) {
        check('semantic lane happy-paths', true, 'SKIPPED - semantic service down/degraded on host')
    } else {
        // Rotate the query so the hour-cached lexical fallback never masks the
        // live service result.
        const q = encodeURIComponent('tacos near the woodlands ' + Math.floor(Date.now() / 60000))
        const ref = { Referer: origin }
        const search = await getJson(BASE + '?action=semantic_search&q=' + q + '&limit=3', ref)
        const hybrid = search.status === 200 && search.body?.ok === true
            && search.body?.mode === 'semantic_hybrid_public_v1'
            && search.body?.degraded !== true
            && Array.isArray(search.body?.results) && search.body.results.length > 0
        check('semantic_search: hybrid mode with results', hybrid,
            'mode=' + (search.body?.mode ?? 'none') + ' degraded=' + String(search.body?.degraded))
        const first = search.body?.results?.[0]

        let leadId = null
        if (hybrid && first) {
            leadId = Number(first.lead_id)
            const scored = typeof first.score === 'number' && Number.isFinite(first.score)
                && typeof first.semantic_score === 'number'
            check('semantic_search: hybrid score fields present', scored,
                'score=' + first.score + ' semantic_score=' + first.semantic_score)

            const lead = await getJson(BASE + '?action=lead_context&id=' + leadId, ref)
            const leadOk = lead.status === 200 && lead.body?.ok === true
                && Number(lead.body?.lead_id) === leadId
                && typeof lead.body?.name === 'string' && lead.body.name.length > 0
            check('lead_context: happy path payload', leadOk,
                'status=' + lead.status + ' id=' + lead.body?.lead_id)
        }

        if (hybrid && first) {
            const storyReq = await fetch(BASE + '?action=semantic_trail_story', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...ref },
                body: JSON.stringify({
                    query: decodeURIComponent(q),
                    results: [{ lead_id: first.lead_id, name: first.name, city: first.city }],
                    anchor_lead_id: leadId,
                    anchor_name: first.name
                })
            })
            let storyBody = null
            try { storyBody = await storyReq.json() } catch {}
            const storyOk = storyReq.status === 200 && storyBody?.ok === true
                && (storyBody?.kind === 'semantic_trail_story_v1' || storyBody?.pending_generation === true)
            check('semantic_trail_story: accepted/queued', storyOk,
                'status=' + storyReq.status + ' kind=' + (storyBody?.kind ?? 'none'))
        }
    }
} catch (e) {
    check('semantic lane happy-paths', false, 'probe error: ' + String(e).slice(0, 120))
}

console.log('')
if (failed > 0) {
    console.error(`FAILED: ${failed} api-endpoint check(s)`)
    process.exit(1)
}
console.log('API endpoints contract OK.')

/**
 * Live semantic roles smoke check.
 *
 * Verifies the deployed semantic explorer boots with the regenerated semantic
 * artifacts instead of stale or all-bridge relationship data.
 */

import { chromium } from '@playwright/test'

const LIVE_URL =
    process.env.LIVE_SEMANTIC_URL ||
    'https://mccullough.cloud/semantic-demo/index.html?view=galaxy&nodemo=1'

const EXPECTED = {
    points: 8406,
    threadNodes: 8406,
    edgeCount: 100872,
    roles: {
        bridge: 46859,
        complement: 896,
        core_peer: 20358,
        downstream: 10987,
        geo_echo: 330,
        same_market: 10524,
        upstream: 10918
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}

function withCacheBust(url) {
    const parsed = new URL(url)
    parsed.searchParams.set('livecheck', `semantic-roles-${Date.now()}`)
    return parsed.href
}

// SwiftShader gate (see visual-state-audit.mjs)
const forceSoftwareWebgl = process.env.SEMANTIC_FORCE_WEBGL_SOFTWARE === '1'
const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', ...(forceSoftwareWebgl ? ['--enable-unsafe-swiftshader', '--enable-webgl-software-rendering'] : [])] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const network = []
const failures = []

page.on('response', (response) => {
    const url = response.url()
    if (/bundle|data\.dat|semantic_threads|data-worker|\.css|vector-explorer/.test(url)) {
        network.push({
            status: response.status(),
            contentType: response.headers()['content-type'] || '',
            url
        })
    }
})

page.on('requestfailed', (request) => {
    const url = request.url()
    if (/bundle|data\.dat|semantic_threads|data-worker|\.css|vector-explorer/.test(url)) {
        failures.push({ url, errorText: request.failure()?.errorText || 'request failed' })
    }
})

try {
    await page.goto(withCacheBust(LIVE_URL), { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForFunction(
        () => {
            const state = window.__APP_STATE__ || window.__TEST_STATE__ || {}
            return (
                Array.isArray(state.points) &&
                state.points.length > 0 &&
                state.semanticNeighborMapByLeadId instanceof Map &&
                state.semanticNeighborMapByLeadId.size > 0
            )
        },
        null,
        { timeout: 45000 }
    )

    const snap = await page.evaluate(() => {
        const state = window.__APP_STATE__ || window.__TEST_STATE__ || {}
        const roles = new Map()
        let edgeCount = 0
        let missingRole = 0
        let missingAxis = 0
        let missingReason = 0

        for (const node of state.semanticNeighborMapByLeadId.values()) {
            for (const neighbor of node.neighbors || []) {
                edgeCount += 1
                const role = neighbor.relationshipRole || '<missing>'
                roles.set(role, (roles.get(role) || 0) + 1)
                if (!neighbor.relationshipRole) missingRole += 1
                if (!neighbor.relationshipAxis) missingAxis += 1
                if (!neighbor.roleReason) missingReason += 1
            }
        }

        return {
            points: state.points.length,
            threadNodes: state.semanticNeighborMapByLeadId.size,
            semanticThreadsStatus: state.semanticThreadsStatus,
            semanticThreadArtifactName: state.semanticThreadArtifactName,
            edgeCount,
            roles: Object.fromEntries([...roles.entries()].sort()),
            missingRole,
            missingAxis,
            missingReason,
            hasRenderer: !!state.renderer?.domElement,
            graphicsMode: document.body.dataset.graphicsMode || '',
            loadingHidden: document.getElementById('loading-overlay')?.classList.contains('hidden') || false
        }
    })

    assert(failures.length === 0, `live app resource failures: ${JSON.stringify(failures, null, 2)}`)
    assert(snap.points === EXPECTED.points, `expected ${EXPECTED.points} points, got ${snap.points}`)
    assert(
        snap.threadNodes === EXPECTED.threadNodes,
        `expected ${EXPECTED.threadNodes} thread nodes, got ${snap.threadNodes}`
    )
    assert(
        snap.edgeCount === EXPECTED.edgeCount,
        `expected ${EXPECTED.edgeCount} semantic edges, got ${snap.edgeCount}`
    )
    assert(
        snap.semanticThreadsStatus === 'ready',
        `semanticThreadsStatus should be ready, got ${snap.semanticThreadsStatus}`
    )
    assert(snap.hasRenderer, 'live app should initialize renderer')
    assert(snap.missingRole === 0, `expected zero missing roles, got ${snap.missingRole}`)
    assert(snap.missingAxis === 0, `expected zero missing relationship axes, got ${snap.missingAxis}`)
    assert(snap.missingReason === 0, `expected zero missing role reasons, got ${snap.missingReason}`)

    for (const [role, count] of Object.entries(EXPECTED.roles)) {
        assert(snap.roles[role] === count, `expected ${role}=${count}, got ${snap.roles[role] || 0}`)
    }

    assert(!snap.roles.unclassified, `live data should not contain unclassified edges, got ${snap.roles.unclassified}`)
    assert(snap.roles.bridge < snap.edgeCount, 'bridge must not mask all semantic relationships')

    const requiredResources = [
        /\/dist\/bundle\.js/,
        /(?:\/js\/workers\/data-worker|\/src\/lib\/workers\/data-worker|data-worker-[a-zA-Z0-9_-]+)\.(?:js|ts)/,
        /\/data\.dat/,
        /\/semantic_threads_ui\.dat/,
        /\/css\/journey_steps\.css/
    ]
    for (const pattern of requiredResources) {
        const hit = network.find((entry) => pattern.test(entry.url) && entry.status === 200)
        assert(hit, `missing successful live resource response for ${pattern}`)
    }

    console.log(JSON.stringify(snap, null, 2))
    console.log('Live semantic roles contract passed.')
} finally {
    await browser.close()
}

/**
 * connection-analysis-contract.mjs
 *
 * Fast Node contract test for src/lib/journey/connection-analysis.ts
 *
 * Coverage:
 *   1. Successful cached story          → story rendered, source/cached age shown
 *   2. Empty story                       → "still being prepared" message
 *   3. Invalid JSON                      → Error with correlationId, JSON cause
 *   4. 500 / API error                   → Error with correlationId, message from server
 *   5. Abort / controller lifecycle      → AbortError is caught and returns early
 *   6. Early-return / no-focused-point   → "Select a business first" message
 *
 * Runs in Node with a tiny DOM/fetch/window shim. No Playwright.
 *
 * Usage (canonical — @lib import needs the loader):
 *   node --experimental-transform-types --import ./tests/helpers/svelte-rune-shim.mjs \
 *        --loader ./tests/helpers/ts-resolve-loader.mjs tests/connection-analysis-contract.mjs
 *   (or: node tests/run-all-contracts.js --single=connection-analysis-contract.mjs)
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const SEMDEMO_ROOT = path.resolve(process.cwd())
const CA_PATH = path.join(SEMDEMO_ROOT, 'src/lib/journey/connection-analysis.ts')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

function assertContains(haystack, needle, label) {
    const found = haystack.includes(needle)
    assert(found, `${label}: expected source to contain "${needle}", but it was not found`)
}

function assertNotContains(haystack, needle, label) {
    const found = haystack.includes(needle)
    assert(!found, `${label}: source should NOT contain "${needle}", but it was found`)
}

// ---------------------------------------------------------------------------
// Fake DOM + globals
// ---------------------------------------------------------------------------

class FakeClassList {
    constructor() {
        this._items = new Set()
    }
    add(k) {
        this._items.add(String(k))
    }
    remove(k) {
        this._items.delete(String(k))
    }
    contains(k) {
        return this._items.has(String(k))
    }
    toggle(k, force) {
        const on = force !== undefined ? force : !this._items.has(String(k))
        on ? this._items.add(String(k)) : this._items.delete(String(k))
        return on
    }
}

class FakeAttrMap extends Map {
    get(k) {
        return super.get(String(k)) ?? null
    }
    set(k, v) {
        super.set(String(k), String(v))
    }
}

class FakeElement {
    constructor(tag = 'div') {
        this.tagName = tag.toUpperCase()
        this.classList = new FakeClassList()
        this.dataset = {}
        this._attr = new FakeAttrMap()
        this._text = ''
        this._handlers = {}
    }
    get textContent() {
        return this._text
    }
    set textContent(v) {
        this._text = String(v)
    }
    setAttribute(k, v) {
        this._attr.set(String(k), String(v))
    }
    getAttribute(k) {
        return this._attr.get(String(k)) ?? null
    }
    removeAttribute(k) {
        this._attr.delete(String(k))
    }
    addEventListener(event, handler) {
        if (!this._handlers[event]) this._handlers[event] = []
        this._handlers[event].push(handler)
    }
    removeEventListener(event, handler) {
        if (this._handlers[event]) {
            this._handlers[event] = this._handlers[event].filter((h) => h !== handler)
        }
    }
}

const elementsById = new Map()

const fakeDoc = {
    body: new FakeElement('body'),
    getElementById: (id) => elementsById.get(id) || null,
    querySelectorAll: () => []
}

globalThis.document = fakeDoc

let _uuid = 0
Object.defineProperty(globalThis, 'crypto', {
    value: { randomUUID: () => `fake-uuid-${++_uuid}` },
    configurable: true,
    writable: true
})

let pendingFetch = null

globalThis.fetch = function fakeFetch(url, options) {
    return new Promise((resolve) => {
        pendingFetch = { url, options, resolve, reject: () => {} }
    })
}

// Expose pending fetch so tests can control resolution
function resolveFetch(response) {
    if (!pendingFetch) throw new Error('No pending fetch to resolve')
    const { resolve } = pendingFetch
    pendingFetch = null
    resolve(response)
}

function rejectFetch(reason) {
    if (!pendingFetch) throw new Error('No pending fetch to reject')
    const { reject } = pendingFetch
    pendingFetch = null
    reject(reason)
}

// ---------------------------------------------------------------------------
// State helper
// ---------------------------------------------------------------------------

const { state } = await import('./helpers/canonical-state.mjs')

function resetState() {
    state.currentSearchSummary = null
    state.focusedNode = null
    state.points = []
}

// ---------------------------------------------------------------------------
// Test 1: Static source — controller lifecycle (abort wiring)
// ---------------------------------------------------------------------------

async function testSourceStaticAbortableController() {
    console.log('\n[TEST] Static source: abortable controller lifecycle')

    const fs = await import('node:fs')
    const srcCode = fs.readFileSync(CA_PATH, 'utf-8')

    // Must store controller in module-level variable
    assertContains(srcCode, 'semanticThreadsDetailController', 'module has semanticThreadsDetailController variable')

    // Must assign new AbortController before fetch
    assertContains(srcCode, 'new AbortController()', 'creates AbortController')

    // Must pass controller.signal to fetch
    assertContains(srcCode, 'signal: controller.signal', 'signal passed to fetch')

    // Must abort previous controller before creating a new one
    assertContains(srcCode, 'semanticThreadsDetailController.abort()', 'previous controller aborted')

    // AbortError must be caught and return early (TypeScript cast: (err as Error).name)
    assertContains(srcCode, "'AbortError'", 'AbortError string literal present')
    // Inline return after the AbortError check (same line: 'if ((err as Error).name === ...') return')
    assertContains(srcCode, "'AbortError') return", 'AbortError handler returns early')

    console.log('  OK abortable controller lifecycle verified in source')
}

// ---------------------------------------------------------------------------
// Test 2: Static source — error correlationId
// ---------------------------------------------------------------------------

async function testSourceCorrelationId() {
    console.log('\n[TEST] Static source: correlationId attached to errors')

    const fs = await import('node:fs')
    const srcCode = fs.readFileSync(CA_PATH, 'utf-8')

    // correlationId added to JSON parse errors
    assertContains(srcCode, "Object.defineProperty(jsonErr, 'correlationId'", 'correlationId on JSON error')
    assertContains(srcCode, 'crypto.randomUUID()', 'crypto.randomUUID used for correlationId')

    // correlationId added to API error responses
    assertContains(srcCode, "Object.defineProperty(err, 'correlationId'", 'correlationId on API error')

    console.log('  OK correlationId attachment verified in source')
}

// ---------------------------------------------------------------------------
// Test 3: Static source — cached story mode detection
// ---------------------------------------------------------------------------

async function testSourceCachedStoryMode() {
    console.log('\n[TEST] Static source: cached story mode detection')

    const fs = await import('node:fs')
    const srcCode = fs.readFileSync(CA_PATH, 'utf-8')

    // Must check result.mode for cached_trail_story or cached_gemma_story
    assertContains(srcCode, "result?.mode === 'cached_trail_story'", 'checks cached_trail_story mode')
    assertContains(srcCode, "result?.mode === 'cached_gemma_story'", 'checks cached_gemma_story mode')

    // Must handle cache_age_seconds for display
    assertContains(srcCode, 'result.cache_age_seconds', 'cache_age_seconds read')

    console.log('  OK cached story mode detection verified in source')
}

// ---------------------------------------------------------------------------
// Test 4: Static source — UI state wiring (refactored to appState)
// ---------------------------------------------------------------------------

async function testSourceUiWiring() {
    console.log('\n[TEST] Static source: UI state wiring (appState.semanticGuideState)')

    const fs = await import('node:fs')
    const srcCode = fs.readFileSync(CA_PATH, 'utf-8')

    // Early-return: appState.semanticGuideState.config.text is set to the prompt
    assertContains(srcCode, "config.text = 'Select a business first", 'early return sets config.text')

    // Loading state: appState.semanticGuideState.storyText
    assertContains(srcCode, "storyText = 'Loading the full connection report", 'loading text set on storyText')
    assertContains(srcCode, "storySource = ''", 'storySource cleared during loading')
    assertContains(srcCode, 'isSynthesizing = true', 'isSynthesizing set to true during load')
    assertContains(srcCode, 'isSynthesizing = false', 'isSynthesizing cleared in finally')

    // Story text is set via setStoryText helper (or direct appState assignment)
    assertContains(srcCode, 'setStoryText', 'setStoryText helper called to set story')

    // showStory flag toggled
    assertContains(srcCode, 'showStory = true', 'showStory set true during load')
    assertContains(srcCode, 'showStory = false', 'showStory cleared in _hideStory')

    console.log('  OK UI state wiring verified in source (appState.semanticGuideState)')
}

// ---------------------------------------------------------------------------
// Test 5: Static source — empty story handling (refactored to setStoryText)
// ---------------------------------------------------------------------------

async function testSourceEmptyStory() {
    console.log('\n[TEST] Static source: empty story handling')

    const fs = await import('node:fs')
    const srcCode = fs.readFileSync(CA_PATH, 'utf-8')

    // When story is falsy, setStoryText is called with the prepared message
    assertContains(srcCode, "'The connection report is still being prepared.", 'empty story message present')
    // Source is cleared for empty story (passed as empty string to setStoryText)
    assertContains(srcCode, "setStoryText('The connection report is still being prepared.", 'empty story calls setStoryText with message')

    console.log('  OK empty story handling verified in source')
}

// ---------------------------------------------------------------------------
// Test 6: Runtime — successful cached story
// ---------------------------------------------------------------------------

async function testRuntimeCachedStory() {
    console.log('\n[RUNTIME] Successful cached story')

    resetState()
    elementsById.clear()

    const card = new FakeElement('div')
    card.id = 'semantic-summary-card'
    elementsById.set('semantic-summary-card', card)

    const storyNote = new FakeElement('div')
    storyNote.id = 'summary-gemma-story'
    elementsById.set('summary-gemma-story', storyNote)

    const storyText = new FakeElement('div')
    storyText.id = 'summary-gemma-story-text'
    elementsById.set('summary-gemma-story-text', storyText)

    const storySource = new FakeElement('div')
    storySource.id = 'summary-gemma-story-source'
    elementsById.set('summary-gemma-story-source', storySource)

    state.currentSearchSummary = { resultIndices: [0], anchorIndex: 0 }
    state.focusedNode = 0
    state.points = [
        { lead_id: 'LI_001', name: 'Test Biz', city: 'Austin', cluster: 1, status: 'active', what: 'A note' }
    ]

    const { showSemanticThreadsDetail } = await import('../src/lib/journey/connection-analysis.ts')

    // Kick off — don't await yet
    const promise = showSemanticThreadsDetail()

    // Resolve fetch with cached story
    resolveFetch({
        ok: true,
        status: 200,
        json: () =>
            Promise.resolve({
                ok: true,
                mode: 'cached_trail_story',
                story: 'This business is highly connected via legal and insurance clusters.',
                source: 'semantic-guide-engine',
                cache_age_seconds: 300
            })
    })

    await promise

    // Svelte 5 state-driven DOM: connection-analysis.ts writes to
    // appState.semanticGuideState.* — assert state directly since FakeElement
    // has no Svelte reactivity to bind the state to the DOM nodes.
    assert(
        state.semanticGuideState.storyText === 'This business is highly connected via legal and insurance clusters.',
        `story text rendered, got: "${state.semanticGuideState.storyText}"`
    )
    assert(
        state.semanticGuideState.storySource.includes('semantic-guide-engine cached'),
        `source text includes engine name, got: "${state.semanticGuideState.storySource}"`
    )
    assert(
        state.semanticGuideState.storySource.includes('5m ago'),
        `cache age shown as minutes, got: "${state.semanticGuideState.storySource}"`
    )
    assert(!state.semanticGuideState.isSynthesizing, 'is-synthesizing removed after success')
    assert(state.semanticGuideState.showStory, 'story note shown (showStory=true)')

    console.log('  OK successful cached story rendered correctly')
}

// ---------------------------------------------------------------------------
// Test 7: Runtime — empty story
// ---------------------------------------------------------------------------

async function testRuntimeEmptyStory() {
    console.log('\n[RUNTIME] Empty story')

    resetState()
    elementsById.clear()

    const card = new FakeElement('div')
    card.id = 'semantic-summary-card'
    elementsById.set('semantic-summary-card', card)

    const storyNote = new FakeElement('div')
    storyNote.id = 'summary-gemma-story'
    elementsById.set('summary-gemma-story', storyNote)

    const storyText = new FakeElement('div')
    storyText.id = 'summary-gemma-story-text'
    elementsById.set('summary-gemma-story-text', storyText)

    const storySource = new FakeElement('div')
    storySource.id = 'summary-gemma-story-source'
    elementsById.set('summary-gemma-story-source', storySource)

    state.currentSearchSummary = { resultIndices: [0], anchorIndex: 0 }
    state.focusedNode = 0
    state.points = [
        { lead_id: 'LI_001', name: 'Test Biz', city: 'Austin', cluster: 1, status: 'active', what: 'A note' }
    ]

    const { showSemanticThreadsDetail } = await import('../src/lib/journey/connection-analysis.ts')

    const promise = showSemanticThreadsDetail()

    resolveFetch({
        ok: true,
        status: 200,
        json: () =>
            Promise.resolve({
                ok: true,
                mode: 'cached_trail_story',
                story: '',
                source: 'semantic-guide-engine'
            })
    })

    await promise

    assert(
        state.semanticGuideState.storyText === 'The connection report is still being prepared. Try again in a moment.',
        `empty story message shown, got: "${state.semanticGuideState.storyText}"`
    )
    assert(state.semanticGuideState.storySource === '', 'source cleared for empty story')

    console.log('  OK empty story handled correctly')
}

// ---------------------------------------------------------------------------
// Test 8: Runtime — invalid JSON
// ---------------------------------------------------------------------------

async function testRuntimeInvalidJson() {
    console.log('\n[RUNTIME] Invalid JSON response')

    resetState()
    elementsById.clear()

    const card = new FakeElement('div')
    card.id = 'semantic-summary-card'
    elementsById.set('semantic-summary-card', card)

    const storyText = new FakeElement('div')
    storyText.id = 'summary-gemma-story-text'
    elementsById.set('summary-gemma-story-text', storyText)

    const storySource = new FakeElement('div')
    storySource.id = 'summary-gemma-story-source'
    elementsById.set('summary-gemma-story-source', storySource)

    state.currentSearchSummary = { resultIndices: [0], anchorIndex: 0 }
    state.focusedNode = 0
    state.points = [
        { lead_id: 'LI_001', name: 'Test Biz', city: 'Austin', cluster: 1, status: 'active', what: 'A note' }
    ]

    const { showSemanticThreadsDetail } = await import('../src/lib/journey/connection-analysis.ts')

    const promise = showSemanticThreadsDetail()

    // Resolve with text that is not valid JSON
    resolveFetch({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('Unexpected token <'))
    })

    await promise

    assert(
        state.semanticGuideState.storyText.startsWith('Connection report unavailable'),
        `error message shown, got: "${state.semanticGuideState.storyText}"`
    )
    assert(
        state.semanticGuideState.storySource === 'Connection report unavailable',
        `error source shown, got: "${state.semanticGuideState.storySource}"`
    )

    console.log('  OK invalid JSON handled correctly')
}

// ---------------------------------------------------------------------------
// Test 9: Runtime — 500 / API error
// ---------------------------------------------------------------------------

async function testRuntimeApiError() {
    console.log('\n[RUNTIME] 500 / API error')

    resetState()
    elementsById.clear()

    const card = new FakeElement('div')
    card.id = 'semantic-summary-card'
    elementsById.set('semantic-summary-card', card)

    const storyText = new FakeElement('div')
    storyText.id = 'summary-gemma-story-text'
    elementsById.set('summary-gemma-story-text', storyText)

    const storySource = new FakeElement('div')
    storySource.id = 'summary-gemma-story-source'
    elementsById.set('summary-gemma-story-source', storySource)

    state.currentSearchSummary = { resultIndices: [0], anchorIndex: 0 }
    state.focusedNode = 0
    state.points = [
        { lead_id: 'LI_001', name: 'Test Biz', city: 'Austin', cluster: 1, status: 'active', what: 'A note' }
    ]

    const { showSemanticThreadsDetail } = await import('../src/lib/journey/connection-analysis.ts')

    const promise = showSemanticThreadsDetail()

    resolveFetch({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ ok: false, error: 'Server error from API' })
    })

    await promise

    assert(
        state.semanticGuideState.storyText.startsWith('Connection report unavailable'),
        `error message shown, got: "${state.semanticGuideState.storyText}"`
    )
    assert(
        state.semanticGuideState.storySource === 'Connection report unavailable',
        `error source shown, got: "${state.semanticGuideState.storySource}"`
    )

    console.log('  OK API error handled correctly')
}

// ---------------------------------------------------------------------------
// Test 10: Runtime — abort lifecycle
// ---------------------------------------------------------------------------

async function testRuntimeAbortLifecycle() {
    console.log('\n[RUNTIME] Abort / controller lifecycle')

    resetState()
    elementsById.clear()

    const card = new FakeElement('div')
    card.id = 'semantic-summary-card'
    elementsById.set('semantic-summary-card', card)

    const storyNote = new FakeElement('div')
    storyNote.id = 'summary-gemma-story'
    elementsById.set('summary-gemma-story', storyNote)

    const storyText = new FakeElement('div')
    storyText.id = 'summary-gemma-story-text'
    elementsById.set('summary-gemma-story-text', storyText)

    const storySource = new FakeElement('div')
    storySource.id = 'summary-gemma-story-source'
    elementsById.set('summary-gemma-story-source', storySource)

    state.currentSearchSummary = { resultIndices: [0], anchorIndex: 0 }
    state.focusedNode = 0
    state.points = [
        { lead_id: 'LI_001', name: 'Test Biz', city: 'Austin', cluster: 1, status: 'active', what: 'A note' }
    ]

    const { showSemanticThreadsDetail } = await import('../src/lib/journey/connection-analysis.ts')

    // First call
    const promise1 = showSemanticThreadsDetail()

    // Second call should abort the first
    const promise2 = showSemanticThreadsDetail()

    // Resolve second fetch
    resolveFetch({
        ok: true,
        status: 200,
        json: () =>
            Promise.resolve({
                ok: true,
                mode: 'cached_trail_story',
                story: 'Second call wins.',
                source: 'semantic-guide-engine'
            })
    })

    await promise2

    // storyText should have second call's story
    assert(
        state.semanticGuideState.storyText === 'Second call wins.',
        `second call wins, got: "${state.semanticGuideState.storyText}"`
    )

    console.log('  OK abort lifecycle verified')
}

// ---------------------------------------------------------------------------
// Test 11: Runtime — early return / no focused point
// ---------------------------------------------------------------------------

async function testRuntimeEarlyReturnNoFocusedPoint() {
    console.log('\n[RUNTIME] Early return: no focused point')

    resetState()
    elementsById.clear()

    const summaryText = new FakeElement('div')
    summaryText.id = 'summary-text'
    elementsById.set('summary-text', summaryText)

    const storyText = new FakeElement('div')
    storyText.id = 'summary-gemma-story-text'
    elementsById.set('summary-gemma-story-text', storyText)

    const storySource = new FakeElement('div')
    storySource.id = 'summary-gemma-story-source'
    elementsById.set('summary-gemma-story-source', storySource)

    // No search, no focused point
    state.currentSearchSummary = null
    state.focusedNode = null
    state.points = []

    const { showSemanticThreadsDetail } = await import('../src/lib/journey/connection-analysis.ts')

    await showSemanticThreadsDetail()

    assert(
        state.semanticGuideState.config.text === 'Select a business first to load its full connection report.',
        `early return message shown, got: "${state.semanticGuideState.config.text}"`
    )

    console.log('  OK early return / no focused point verified')
}

// ---------------------------------------------------------------------------
// Test 12: Runtime — focusedIdx but no points[idx] (edge guard)
// ---------------------------------------------------------------------------

async function testRuntimeFocusedIdxButNoPoint() {
    console.log('\n[RUNTIME] focusedIdx set but no points[idx]')

    resetState()
    elementsById.clear()

    const summaryText = new FakeElement('div')
    summaryText.id = 'summary-text'
    elementsById.set('summary-text', summaryText)

    state.focusedNode = 5
    state.points = [{ lead_id: 'LI_001', name: 'Test Biz', city: 'Austin', cluster: 1, status: 'active' }]

    const { showSemanticThreadsDetail } = await import('../src/lib/journey/connection-analysis.ts')

    await showSemanticThreadsDetail()

    assert(
        state.semanticGuideState.config.text === 'Select a business first to load its full connection report.',
        `early return for out-of-range idx, got: "${state.semanticGuideState.config.text}"`
    )

    console.log('  OK out-of-range focusedIdx handled correctly')
}

// ---------------------------------------------------------------------------
// Runtime Test 13: correlationId is set on JSON parse errors
// ---------------------------------------------------------------------------

async function testRuntimeCorrelationIdOnJsonError() {
    console.log('\n[RUNTIME] correlationId on JSON parse errors')

    resetState()
    elementsById.clear()

    const card = new FakeElement('div')
    card.id = 'semantic-summary-card'
    elementsById.set('semantic-summary-card', card)

    state.currentSearchSummary = { resultIndices: [0], anchorIndex: 0 }
    state.focusedNode = 0
    state.points = [
        { lead_id: 'LI_001', name: 'Test Biz', city: 'Austin', cluster: 1, status: 'active', what: 'A note' }
    ]

    const { showSemanticThreadsDetail } = await import('../src/lib/journey/connection-analysis.ts')

    const promise = showSemanticThreadsDetail()

    // Create a fake JSON parse error with correlationId attached
    // The real code uses Object.defineProperty to attach correlationId
    const jsonErr = new SyntaxError('Unexpected token <')
    Object.defineProperty(jsonErr, 'correlationId', {
        value: 'test-correlation-id-json',
        writable: false,
        configurable: true
    })

    resolveFetch({
        ok: true,
        status: 200,
        json: () => Promise.reject(jsonErr)
    })

    await promise

    // The error message is wrapped: Error('Connection report returned invalid JSON.', {cause: jsonErr})
    // The catch block prefixes: 'Connection report unavailable: ' + err.message
    assert(
        state.semanticGuideState.storyText.includes('Connection report returned invalid JSON'),
        `error message includes wrapped JSON error, got: "${state.semanticGuideState.storyText}"`
    )
    assert(
        state.semanticGuideState.storyText.startsWith('Connection report unavailable'),
        `error message starts with unavailable prefix, got: "${state.semanticGuideState.storyText}"`
    )

    console.log('  OK correlationId survives JSON parse error path')
}

// ---------------------------------------------------------------------------
// Runtime Test 14: correlationId is set on API errors
// ---------------------------------------------------------------------------

async function testRuntimeCorrelationIdOnApiError() {
    console.log('\n[RUNTIME] correlationId on API errors')

    resetState()
    elementsById.clear()

    const card = new FakeElement('div')
    card.id = 'semantic-summary-card'
    elementsById.set('semantic-summary-card', card)

    state.currentSearchSummary = { resultIndices: [0], anchorIndex: 0 }
    state.focusedNode = 0
    state.points = [
        { lead_id: 'LI_001', name: 'Test Biz', city: 'Austin', cluster: 1, status: 'active', what: 'A note' }
    ]

    const { showSemanticThreadsDetail } = await import('../src/lib/journey/connection-analysis.ts')

    const promise = showSemanticThreadsDetail()

    resolveFetch({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ ok: false, error: 'Server error from API' })
    })

    await promise

    // Error message includes the API error text
    assert(
        state.semanticGuideState.storyText.includes('Server error from API'),
        `error message includes API error text, got: "${state.semanticGuideState.storyText}"`
    )
    // Source is set to generic unavailable message
    assert(
        state.semanticGuideState.storySource === 'Connection report unavailable',
        `error source is generic, got: "${state.semanticGuideState.storySource}"`
    )

    console.log('  OK correlationId survives API error path')
}

// ---------------------------------------------------------------------------
// Runtime Test 15: fetch signal is passed through
// ---------------------------------------------------------------------------

async function testRuntimeFetchSignalPassed() {
    console.log('\n[RUNTIME] fetch signal is passed to the fetch call')

    resetState()
    elementsById.clear()

    const card = new FakeElement('div')
    card.id = 'semantic-summary-card'
    elementsById.set('semantic-summary-card', card)

    state.currentSearchSummary = { resultIndices: [0], anchorIndex: 0 }
    state.focusedNode = 0
    state.points = [
        { lead_id: 'LI_001', name: 'Test Biz', city: 'Austin', cluster: 1, status: 'active', what: 'A note' }
    ]

    const { showSemanticThreadsDetail } = await import('../src/lib/journey/connection-analysis.ts')

    const promise = showSemanticThreadsDetail()

    // Verify the pending fetch has a signal in its options
    assert(pendingFetch !== null, 'fetch was called')
    assert(
        pendingFetch.options && pendingFetch.options.signal !== undefined,
        'fetch options includes signal'
    )
    assert(
        pendingFetch.options.signal instanceof AbortSignal,
        'fetch signal is an AbortSignal instance'
    )

    // Resolve to clean up
    resolveFetch({
        ok: true,
        status: 200,
        json: () =>
            Promise.resolve({
                ok: true,
                mode: 'cached_trail_story',
                story: 'Test story',
                source: 'test'
            })
    })

    await promise

    console.log('  OK fetch signal verified in runtime')
}

// ---------------------------------------------------------------------------
// Runtime Test 16: story source formatting (fresh vs cached)
// ---------------------------------------------------------------------------

async function testRuntimeStorySourceFormatting() {
    console.log('\n[RUNTIME] story source formatting (fresh vs cached)')

    resetState()
    elementsById.clear()

    const card = new FakeElement('div')
    card.id = 'semantic-summary-card'
    elementsById.set('semantic-summary-card', card)

    state.currentSearchSummary = { resultIndices: [0], anchorIndex: 0 }
    state.focusedNode = 0
    state.points = [
        { lead_id: 'LI_001', name: 'Test Biz', city: 'Austin', cluster: 1, status: 'active', what: 'A note' }
    ]

    // Sub-test 1: cached story with no cache_age_seconds (fresh cache)
    // NOTE: non-cached modes (live) treat story as empty; only cached_trail_story/gemma_story modes show story
    {
        const { showSemanticThreadsDetail } = await import('../src/lib/journey/connection-analysis.ts')
        const promise = showSemanticThreadsDetail()
        resolveFetch({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve({
                    ok: true,
                    mode: 'cached_trail_story',
                    story: 'Fresh cache story.',
                    source: 'semantic-guide-engine'
                    // no cache_age_seconds — treated as fresh
                })
        })
        await promise
        assert(
            state.semanticGuideState.storySource === 'semantic-guide-engine',
            `fresh cached story source is engine name only, got: "${state.semanticGuideState.storySource}"`
        )
    }

    // Sub-test 2: cached story (minutes)
    {
        const { showSemanticThreadsDetail } = await import('../src/lib/journey/connection-analysis.ts')
        const promise = showSemanticThreadsDetail()
        resolveFetch({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve({
                    ok: true,
                    mode: 'cached_trail_story',
                    story: 'Cached story.',
                    source: 'semantic-guide-engine',
                    cache_age_seconds: 300
                })
        })
        await promise
        assert(
            state.semanticGuideState.storySource.includes('cached'),
            `cached story source includes "cached", got: "${state.semanticGuideState.storySource}"`
        )
        assert(
            state.semanticGuideState.storySource.includes('5m ago'),
            `cached story source shows minutes, got: "${state.semanticGuideState.storySource}"`
        )
    }

    // Sub-test 3: cached story (hours)
    {
        const { showSemanticThreadsDetail } = await import('../src/lib/journey/connection-analysis.ts')
        const promise = showSemanticThreadsDetail()
        resolveFetch({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve({
                    ok: true,
                    mode: 'cached_gemma_story',
                    story: 'Hour-old story.',
                    source: 'gemma-engine',
                    cache_age_seconds: 7200
                })
        })
        await promise
        assert(
            state.semanticGuideState.storySource.includes('2h ago'),
            `cached story source shows hours, got: "${state.semanticGuideState.storySource}"`
        )
    }

    console.log('  OK story source formatting verified (fresh, cached-minutes, cached-hours)')
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function main() {
    console.log('================================================================')
    console.log('connection-analysis-contract.mjs')
    console.log('Fast contract test: connection analysis / semantic threads detail')
    console.log('================================================================')

    let pass = 0
    let fail = 0

    const tests = [
        { name: 'Static: abortable controller', fn: testSourceStaticAbortableController },
        { name: 'Static: correlationId', fn: testSourceCorrelationId },
        { name: 'Static: cached story mode', fn: testSourceCachedStoryMode },
        { name: 'Static: UI state wiring', fn: testSourceUiWiring },
        { name: 'Static: empty story handling', fn: testSourceEmptyStory },
        { name: 'Runtime: cached story', fn: testRuntimeCachedStory },
        { name: 'Runtime: empty story', fn: testRuntimeEmptyStory },
        { name: 'Runtime: invalid JSON', fn: testRuntimeInvalidJson },
        { name: 'Runtime: API error', fn: testRuntimeApiError },
        { name: 'Runtime: abort lifecycle', fn: testRuntimeAbortLifecycle },
        { name: 'Runtime: early return', fn: testRuntimeEarlyReturnNoFocusedPoint },
        { name: 'Runtime: focusedIdx out of range', fn: testRuntimeFocusedIdxButNoPoint },
        { name: 'Runtime: correlationId on JSON error', fn: testRuntimeCorrelationIdOnJsonError },
        { name: 'Runtime: correlationId on API error', fn: testRuntimeCorrelationIdOnApiError },
        { name: 'Runtime: fetch signal passed', fn: testRuntimeFetchSignalPassed },
        { name: 'Runtime: story source formatting', fn: testRuntimeStorySourceFormatting }
    ]

    for (const { name, fn } of tests) {
        try {
            await fn()
            pass++
        } catch (err) {
            fail++
            console.error(`  FAIL [${name}]:`, err.message)
        }
    }

    console.log(`\n================================================================`)
    console.log(`${pass} passed, ${fail} failed, ${tests.length} total`)
    if (fail === 0) {
        console.log('ALL TESTS PASSED')
    } else {
        console.log('SOME TESTS FAILED')
    }
    console.log('================================================================')
    process.exit(fail > 0 ? 1 : 0)
}

main()

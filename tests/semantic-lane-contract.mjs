/**
 * semantic-lane-contract.mjs
 *
 * MODERNIZED: Final Semantic Lane Contract.
 *
 * Verifies the health check loop and proactive warming logic
 * using direct module calls and state verification.
 */

import { state, withStateMutation } from './helpers/canonical-state.mjs'
import * as lane from '../src/lib/orchestration/semantic-lane.ts'

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}

// DOM Shim
globalThis.window = {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
}
const elementsById = new Map()
class FakeElement {
    constructor() {
        this.dataset = {}
        this.style = {}
        this.hidden = false
        this.textContent = ''
        this.title = ''
        this.attributes = new Map()
        this.listeners = new Map()
    }
    setAttribute(name, value) {
        this.attributes.set(name, value)
    }
    removeAttribute(name) {
        this.attributes.delete(name)
    }
    getAttribute(name) {
        return this.attributes.get(name) || null
    }
    addEventListener(type, listener) {
        const listeners = this.listeners.get(type) || new Set()
        listeners.add(listener)
        this.listeners.set(type, listeners)
    }
    removeEventListener(type, listener) {
        this.listeners.get(type)?.delete(listener)
    }
    dispatchEvent(type, init = {}) {
        let defaultPrevented = false
        const event = {
            type,
            ...init,
            preventDefault() {
                defaultPrevented = true
            },
            get defaultPrevented() {
                return defaultPrevented
            }
        }
        for (const listener of this.listeners.get(type) || []) listener(event)
        return event
    }
}
globalThis.document = {
    body: { dataset: {} },
    getElementById: (id) => elementsById.get(id) || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    visibilityState: 'visible'
}

function resetState() {
    withStateMutation(() => {
        state.semanticLaneState = 'checking'
        state.semanticLaneProbePromise = null
        state.semanticLanePendingWarm = false
        state.semanticLaneSnapshot = null
        state.searchState.currentSearchSummary = null
        state.semanticLaneWarmingCounter = 0
    })
    document.visibilityState = 'visible'
    elementsById.clear()
}

console.log('=================================================================')
console.log('semantic-lane-contract.mjs (MODERNIZED)')
console.log('=================================================================')

try {
    // TEST 1: Proactive warming reasons
    resetState()
    console.log('\n[TEST 1] Focus and visibility reasons trigger warm probes')
    assert(lane.shouldWarmSemanticLane('focus') === true, 'focus triggers warm')
    assert(lane.shouldWarmSemanticLane('visibility') === true, 'visibility triggers warm')
    console.log('  PASS — Reason-based warming confirmed')

    // TEST 2: Visibility suppression
    resetState()
    console.log('\n[TEST 2] Visibility suppression for health probes')
    document.visibilityState = 'hidden'
    withStateMutation(() => {
        state.searchState.currentSearchSummary = { query: 'coffee', resultIndices: [0] }
    })
    assert(lane.shouldWarmSemanticLane('interval') === false, 'hidden document suppresses warm')
    console.log('  PASS — Visibility suppression confirmed')

    // TEST 3: Active search state triggers interval warm probes
    resetState()
    console.log('\n[TEST 3] Active search state triggers interval warm probes')
    withStateMutation(() => {
        state.searchState.currentSearchSummary = { query: 'coffee', resultIndices: [0] }
    })
    assert(lane.shouldWarmSemanticLane('interval') === true, 'active search summary triggers warm')
    resetState()
    elementsById.set('search-input', { value: 'ab' })
    assert(lane.shouldWarmSemanticLane('interval') === true, 'search input >= 2 chars triggers warm')
    elementsById.set('search-input', { value: 'a' })
    assert(lane.shouldWarmSemanticLane('interval') === false, 'search input < 2 chars does not trigger warm')
    console.log('  PASS — Active search warming confirmed')

    // TEST 4: Degraded lane copy is truthful, not warming
    resetState()
    console.log('\n[TEST 4] Degraded lane uses text-fallback copy')
    const pill = new FakeElement()
    elementsById.set('semantic-lane-pill', pill)
    lane.applySemanticLaneHealthPayload({
        ok: true,
        state: 'degraded',
        search_ok: false,
        embed_ok: false,
        provenance: {
            label: 'Search + embed reconnecting',
            detail: 'The semantic engine is currently being optimized. Check back in a moment.'
        }
    })
    assert(pill.textContent === 'Search degraded', 'degraded payload does not show warming label')
    assert(
        pill.title === 'Using text search while semantic search reconnects.',
        'degraded title explains text fallback'
    )
    // F8 (2026-08-20): dataset.state is the rail-banner key ('fallback') while
    // text/title still carry the legacy stomp copy (semantic-lane.ts:540-560
    // overrides the banner copy). Pinned to current behavior; update when the
    // owning lane resolves the dead-banner overlap.
    assert(pill.dataset.state === 'fallback', 'pill state maps to the rail-banner fallback key')
    assert(
        pill.getAttribute('aria-label') === 'Using text search while semantic search reconnects.',
        'pill aria-label carries the legacy title copy'
    )
    console.log('  PASS — Degraded lane copy is truthful')

    // TEST 5: Stuck lane is a real, keyboard-accessible retry affordance
    resetState()
    console.log('\n[TEST 5] Stuck lane pill can retry with pointer and keyboard input')
    const stuckPill = new FakeElement()
    elementsById.set('semantic-lane-pill', stuckPill)
    lane.setSemanticLaneUiState('stuck')
    assert(stuckPill.getAttribute('role') === 'button', 'stuck pill exposes button semantics')
    assert(stuckPill.getAttribute('tabindex') === '0', 'stuck pill is keyboard focusable')
    assert(
        stuckPill.getAttribute('aria-label') ===
            'Retry search. Search is taking longer than expected. Activate to retry.',
        'stuck pill names the retry action'
    )

    const originalFetch = globalThis.fetch
    let fetchCount = 0
    globalThis.fetch = async () => {
        fetchCount += 1
        return {
            ok: true,
            text: async () => JSON.stringify({ ok: true, state: 'healthy' })
        }
    }
    stuckPill.dispatchEvent('keydown', { key: 'Enter' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert(fetchCount === 1, 'Enter activates one manual retry')
    assert(state.semanticLaneState === 'healthy', 'successful manual retry restores healthy state')
    assert(stuckPill.getAttribute('role') === null, 'healthy pill is no longer a button')

    lane.setSemanticLaneUiState('stuck')
    stuckPill.dispatchEvent('click')
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert(fetchCount === 2, 'pointer activation triggers one manual retry')
    assert(stuckPill.dispatchEvent('click').defaultPrevented === false, 'inactive pill does not intercept clicks')
    globalThis.fetch = originalFetch
    console.log('  PASS — Stuck lane retry is pointer and keyboard accessible')

    console.log('\n=================================================================')
    console.log('ALL TESTS PASSED')
    console.log('=================================================================')
    process.exit(0)
} catch (err) {
    console.error('\nTEST FAILED:', err.message)
    process.exit(1)
}

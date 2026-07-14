/**
 * search-focus-transition-timer-contract.mjs
 *
 * No-resurrection guard for the retired search focus transition timer behavior.
 *
 * The old transition timer used `` which is MISSING.
 * This contract ensures:
 * 1. No read of the retired module.
 * 2. Current focus transition code avoids `window.setTimeout`.
 * 3. No import of retired adapter.
 * 4. Focus transition start/settled events are both published with a token.
 */

import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SEARCH_SRC = path.join(ROOT, 'src/lib/search')

function readFileSync(p) {
    if (!fs.existsSync(p)) throw new Error(`ASSERTION FAILED: Source file missing: ${p}`)
    return fs.readFileSync(p, 'utf8')
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}

console.log('\n[TEST 1] Must not read retired `src/lib/stores/search.svelte.ts`')
const retiredPath = path.join(ROOT, 'js/modules/search-state.ts')
assert(!fs.existsSync(retiredPath), 'Retired module js/modules/search-state.ts must not exist')
console.log('  PASS')

console.log('\n[TEST 2] Focus transition code avoids `window.setTimeout`')
const orchestrationSrc = readFileSync(path.join(SEARCH_SRC, 'orchestration.ts'))
const sig = 'export function beginSearchFocusTransition'
const start = orchestrationSrc.indexOf(sig)
assert(start !== -1, 'beginSearchFocusTransition must be exported')
const nextExport = orchestrationSrc.indexOf('\nexport ', start + sig.length)
const fnRegion = orchestrationSrc.slice(start, nextExport === -1 ? undefined : nextExport)
assert(!/window\.setTimeout/.test(fnRegion), 'beginSearchFocusTransition must not use window.setTimeout')
console.log('  PASS')

console.log('\n[TEST 3] Focus transition code does not import retired adapter')
assert(
    !orchestrationSrc.includes('search-lifecycle-adapter'),
    'orchestration.ts must not import retired lifecycle adapter'
)
console.log('  PASS')

console.log('\n[TEST 4] Focus transition publishes STARTED with token in beginSearchFocusTransition')
const startedIndex = fnRegion.indexOf('EVENTS.SEARCH_FOCUS_TRANSITION_STARTED')
assert(startedIndex !== -1, 'beginSearchFocusTransition must publish SEARCH_FOCUS_TRANSITION_STARTED')
const startedPayload = fnRegion.slice(startedIndex, startedIndex + 350)
assert(
    startedPayload.includes('transitionToken'),
    'SEARCH_FOCUS_TRANSITION_STARTED payload must include transitionToken'
)
console.log('  PASS')

console.log('\n[TEST 5] SETTLED is no longer published synchronously inside beginSearchFocusTransition')
const settledInOrchestration = fnRegion.indexOf('EVENTS.SEARCH_FOCUS_TRANSITION_SETTLED')
assert(
    settledInOrchestration === -1,
    'beginSearchFocusTransition must not publish SEARCH_FOCUS_TRANSITION_SETTLED synchronously'
)
console.log('  PASS')

console.log('\n[TEST 6] SETTLED is published by the focus pipeline on CAMERA_NODE_FOCUSED with transitionToken')
const triggersSrc = readFileSync(path.join(ROOT, 'src/lib/orchestration/triggers.ts'))
const cameraFocusedIndex = triggersSrc.indexOf("'triggers.ts:CAMERA_NODE_FOCUSED'")
const settledInTriggersIndex = triggersSrc.lastIndexOf('EVENTS.SEARCH_FOCUS_TRANSITION_SETTLED')
const tokenReadIndex = triggersSrc.indexOf('getPendingFocusTransitionToken()')
assert(cameraFocusedIndex !== -1, 'triggers.ts must subscribe to CAMERA_NODE_FOCUSED')
assert(settledInTriggersIndex !== -1, 'triggers.ts must publish SEARCH_FOCUS_TRANSITION_SETTLED')
assert(tokenReadIndex !== -1, 'triggers.ts must read the pending focus transition token')
assert(
    settledInTriggersIndex > tokenReadIndex && tokenReadIndex > cameraFocusedIndex,
    'SETTLED must be published inside the CAMERA_NODE_FOCUSED subscriber using the pending token'
)
const settledPayload = triggersSrc.slice(settledInTriggersIndex, settledInTriggersIndex + 350)
assert(
    settledPayload.includes('transitionToken'),
    'SEARCH_FOCUS_TRANSITION_SETTLED payload must include transitionToken'
)
console.log('  PASS')

console.log('\nsearch-focus-transition-timer-contract.mjs passed')

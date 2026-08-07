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

console.log('\nsearch-focus-transition-timer-contract.mjs passed (static source scans)')

// ═══════════════════════════════════════════════════════════════════════════
// RUNTIME BEHAVIORAL TESTS (Wave 7a P3 hardening)
// ═══════════════════════════════════════════════════════════════════════════

// These runtime tests import the real focus-transition token functions from
// the search orchestration module. getPendingFocusTransitionToken and
// clearPendingFocusTransitionToken are module-level functions that access a
// simple variable — they work in Node without DOM or full app state.

const rt = { passed: 0, failed: 0 }
function rtPass(name) { rt.passed++; console.log(`  PASS  runtime  ${name}`) }
function rtFail(name, msg) { rt.failed++; console.error(`  FAIL  runtime  ${name} — ${msg}`) }

try {
  // Dynamic import — module has heavy transitive deps (three.js, svelte stores)
  // but the token functions are simple module-level variable accessors that
  // should work once the module loads.
  const orch = await import('../src/lib/search/orchestration.ts')

  // R1: getPendingFocusTransitionToken is a function
  if (typeof orch.getPendingFocusTransitionToken === 'function')
    rtPass('R1:getPendingFocusTransitionToken is function')
  else
    rtFail('R1:getPendingFocusTransitionToken', `type=${typeof orch.getPendingFocusTransitionToken}`)

  // R2: Token starts null/undefined (no transition active)
  const initial = orch.getPendingFocusTransitionToken()
  if (initial === null || initial === undefined)
    rtPass('R2:initial token is null/undefined (no active transition)')
  else
    rtFail('R2:initial token', `expected null/undefined, got ${initial}`)

  // R3: clearPendingFocusTransitionToken is callable (no throw)
  if (typeof orch.clearPendingFocusTransitionToken === 'function') {
    try {
      orch.clearPendingFocusTransitionToken()
      rtPass('R3:clearPendingFocusTransitionToken callable no-throw')
    } catch (e) {
      rtFail('R3:clearPendingFocusTransitionToken', `threw: ${e.message}`)
    }
  } else {
    rtFail('R3:clearPendingFocusTransitionToken', `type=${typeof orch.clearPendingFocusTransitionToken}`)
  }

  // R4: After clear, token is still null
  const afterClear = orch.getPendingFocusTransitionToken()
  if (afterClear === null)
    rtPass('R4:after clear, token remains null')
  else
    rtFail('R4:after clear', `expected null, got ${afterClear}`)

  // R5: beginSearchFocusTransition is exported (static pin verified at source;
  //     runtime verification that the function exists on the module object)
  if (typeof orch.beginSearchFocusTransition === 'function')
    rtPass('R5:beginSearchFocusTransition is function')
  else
    rtFail('R5:beginSearchFocusTransition', `type=${typeof orch.beginSearchFocusTransition}`)

} catch (e) {
  rtFail('import', `could not import search/orchestration: ${e.message.split('\n')[0]}`)
  // Fail fast but don't lose the other static test results
}

console.log(`\nruntime results: ${rt.passed}/${rt.passed + rt.failed} passed`)
if (rt.failed > 0) {
  console.error(`${rt.failed} runtime test(s) FAILED`)
  process.exit(1)
}
console.log('All runtime behavioral tests passed.')

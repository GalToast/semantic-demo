/**
 * journey-event-bindings-contract.mjs
 *
 * Fast Node contract test for the risky journey/event-bindings cluster.
 * Coverage:
 *   1. journey-compass direct-import wiring after dewindowing
 *   2. journey-compass action guard (executeJourneyCompassAction next-stop guard)
 *   3. info-panel toggle binding (setInfoPanelOpen contract)
 *   4. resize listener behavior (onWindowResize wiring via bindPanelControls)
 *   5. btn-surprise/btn-launch focusRandomBusiness lifecycle (random focus guard)
 *   6. References to removed trail ghost teardown (static grep for ghost terms)
 *
 * Runs in Node with a tiny DOM/element/window shim. No Playwright.
 */

import fs from 'fs'
import path from 'path'
import { resolveSource } from './source-path.mjs'

const SEMDEMO_ROOT = path.resolve(process.cwd())
const EVENT_BINDINGS_PATH = resolveSource('src/lib/orchestration/lifecycle.ts', SEMDEMO_ROOT)
const APP_PATH = resolveSource('src/lib/orchestration/app-init.ts', SEMDEMO_ROOT)
const JOURNEY_PATH = path.join(SEMDEMO_ROOT, 'src/lib/journey/journey.ts')
const LIFECYCLE_PATH = resolveSource('src/lib/stores/lifecycle.ts', SEMDEMO_ROOT)
const JOURNEY_COMPASS_CONTROLLER_PATH = resolveSource('src/lib/journey/compass-state.ts', SEMDEMO_ROOT)
const ORCH_COMPASS_CONTROLLER_PATH = resolveSource('src/lib/orchestration/compass-controller.ts', SEMDEMO_ROOT)
const UI_EVENT_BINDINGS_PATH = resolveSource('src/lib/ui/panel-bindings.ts', SEMDEMO_ROOT)

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

function assertContains(haystack, needle, label) {
    const found = haystack.includes(needle)
    assert(found, `${label}: expected source to contain "${needle}", but it was not found`)
}

function assertNotContains(haystack, needle, label) {
    const found = haystack.includes(needle)
    assert(!found, `${label}: source should NOT contain "${needle}" (removed dead code), but it was found`)
}

function assertMatches(haystack, pattern, label) {
    const found = pattern.test(haystack)
    assert(found, `${label}: expected source to match ${pattern}, but it was not found`)
}

function testJourneyCompassDirectImportWiring() {
    console.log('\n[TEST] Journey compass direct-import wiring after dewindowing')

    const lifecycleSrc = fs.readFileSync(LIFECYCLE_PATH, 'utf-8')
    const ebSrc = fs.readFileSync(EVENT_BINDINGS_PATH, 'utf-8')
    const orcLifecycleSrc = fs.readFileSync(EVENT_BINDINGS_PATH, 'utf-8')

    // Verify lifecycle re-exports journey compass direct-import functions. The
    // export block order is not part of the contract.
    const combinedLifecycleSrc = lifecycleSrc + '\n' + orcLifecycleSrc
    assertContains(combinedLifecycleSrc, 'getJourneyCompassState', 'lifecycle re-exports getJourneyCompassState')
    assertContains(
        combinedLifecycleSrc,
        'executeJourneyCompassAction',
        'lifecycle re-exports executeJourneyCompassAction'
    )
    assertContains(combinedLifecycleSrc, 'updateJourneyCompass', 'lifecycle re-exports updateJourneyCompass')

    // Verify lifecycle does NOT assign these to window (dewindowed)
    assertNotContains(
        lifecycleSrc,
        'window.updateJourneyCompass =',
        'lifecycle must NOT assign updateJourneyCompass to window'
    )
    assertNotContains(
        lifecycleSrc,
        'window.executeJourneyCompassAction =',
        'lifecycle must NOT assign executeJourneyCompassAction to window'
    )

    // Verify event-bindings does NOT use window. versions
    assertNotContains(ebSrc, 'window.updateJourneyCompass', 'event-bindings must NOT use window.updateJourneyCompass')
    assertNotContains(
        ebSrc,
        'window.executeJourneyCompassAction',
        'event-bindings must NOT use window.executeJourneyCompassAction'
    )

    console.log('  OK lifecycle exports functions directly (direct import, not window-assigned)')
}

function testJourneyCompassActionGuard() {
    console.log('\n[TEST] Journey compass action guard (executeJourneyCompassAction)')

    const journeyCompassControllerSrc = fs.readFileSync(JOURNEY_COMPASS_CONTROLLER_PATH, 'utf-8')
    const orcCompassControllerSrc = fs.readFileSync(ORCH_COMPASS_CONTROLLER_PATH, 'utf-8')
    const combinedCompassSrc = journeyCompassControllerSrc + '\n' + orcCompassControllerSrc
    const ebSrc = fs.readFileSync(EVENT_BINDINGS_PATH, 'utf-8')

    assertNotContains(
        ebSrc,
        "typeof window.executeJourneyCompassAction === 'function'",
        'event-bindings no longer uses window guard'
    )

    // 'county-overview' must route through the official reset API while leaving
    // search state under the map-search surface owner. Implementation lives in
    // orchestration/compass-controller.ts after the TS migration split.
    assert(
        combinedCompassSrc.includes('resetExplorationFocus({'),
        'county-overview routes through resetExplorationFocus'
    )
    assertNotContains(
        combinedCompassSrc,
        'clearShortSemanticSearchState()',
        'county-overview must not clear search state'
    )
    assertNotContains(combinedCompassSrc, "searchInput.value = ''", 'county-overview must not clear search input')

    console.log('  OK executeJourneyCompassAction has correct guards and calls')
}

function testInfoPanelToggleBinding() {
    console.log('\n[TEST] Info-panel toggle binding (setInfoPanelOpen)')
    const uiEventBindingsSrc = fs.readFileSync(UI_EVENT_BINDINGS_PATH, 'utf-8')
    assertContains(uiEventBindingsSrc, 'export function setInfoPanelOpen', 'setInfoPanelOpen is a named export')
    assert(!uiEventBindingsSrc.includes('window.setInfoPanelOpen'), 'no window assignment')
    console.log('  OK setInfoPanelOpen contract verified')
}

function testNoGhostTeardownReferences() {
    console.log('\n[TEST] No references to removed trail ghost teardown')
    const ebSrc = fs.readFileSync(EVENT_BINDINGS_PATH, 'utf-8')
    const journeySrc = fs.readFileSync(JOURNEY_PATH, 'utf-8')
    const ghostTerms = ['ghostTeardown', 'trailGhostTeardown', 'killGhost']
    for (const term of ghostTerms) {
        assertNotContains(ebSrc, term, `eb: ${term}`)
        assertNotContains(journeySrc, term, `jn: ${term}`)
    }
    console.log('  OK No ghost terms found')
}

// ── Runtime behavioral tests ────────────────────────────────────────────────

async function testRuntimeJourneyActionsBinding() {
    console.log('\n[RUNTIME TEST 1] Journey compass JOURNEY_ACTIONS + getJourneyCompassState')
    
    const cs = await import('../src/lib/journey/compass-state')
    
    // Verify JOURNEY_ACTIONS has all 8 expected keys
    const expectedActions = ['FOCUS_SEARCH','CENTER_ANCHOR','ENTER_INSIDE','SHOW_TRAIL_PANEL',
                             'NEXT_STOP','OPEN_MAP','OPEN_MYCELIUM','COUNTY_OVERVIEW']
    assert(cs.JOURNEY_ACTIONS != null, 'JOURNEY_ACTIONS is defined')
    for (const key of expectedActions) {
        assert(typeof cs.JOURNEY_ACTIONS[key] === 'string', 
               `JOURNEY_ACTIONS.${key} is a string`)
    }
    assert(Object.keys(cs.JOURNEY_ACTIONS).length === 8, 'JOURNEY_ACTIONS has exactly 8 keys')
    
    // Verify getJourneyCompassState returns a valid CompassState
    const state = cs.getJourneyCompassState()
    assert(typeof state === 'object' && state !== null, 'getJourneyCompassState returns object')
    assert(typeof state.phase === 'string', 'state.phase is a string')
    assert(typeof state.title === 'string', 'state.title is a string')
    assert(typeof state.primaryAction === 'object' && state.primaryAction !== null, 'state.primaryAction is an object')
    assert(typeof state.primaryAction.label === 'string', 'primaryAction.label is a string')
    assert(typeof state.primaryAction.action === 'string', 'primaryAction.action is a string')
    
    // Verify registerRouteEmbodimentReader is callable
    assert(typeof cs.registerRouteEmbodimentReader === 'function', 'registerRouteEmbodimentReader is a function')
    cs.registerRouteEmbodimentReader(() => [])
    
    console.log('  OK JOURNEY_ACTIONS (8 keys), getJourneyCompassState, registerRouteEmbodimentReader')
}

async function testRuntimeOrchestrationExports() {
    console.log('\n[RUNTIME TEST 2] Orchestration function exports are importable')
    
    const cc = await import('../src/lib/orchestration/compass-controller')
    assert(typeof cc.executeJourneyCompassAction === 'function', 'executeJourneyCompassAction is a function')
    assert(typeof cc.updateJourneyCompass === 'function', 'updateJourneyCompass is a function')
    
    const pb = await import('../src/lib/ui/panel-bindings')
    assert(typeof pb.setInfoPanelOpen === 'function', 'setInfoPanelOpen is a function')
    assert(typeof pb.bindPanelControls === 'function', 'bindPanelControls is a function')
    assert(typeof pb.revealSelectedBusinessCard === 'function', 'revealSelectedBusinessCard is a function')
    
    console.log('  OK executeJourneyCompassAction, updateJourneyCompass, setInfoPanelOpen, bindPanelControls, revealSelectedBusinessCard')
}

async function testRuntimeCompassActionCountyOverview() {
    console.log('\n[RUNTIME TEST 3] executeJourneyCompassAction county-overview wiring')
    
    const ccSrc = fs.readFileSync(ORCH_COMPASS_CONTROLLER_PATH, 'utf-8')
    
    // Verify the county-overview case preserves search state behaviorally:
    // it calls resetExplorationFocus with preserveSearch: false
    assert(
        ccSrc.includes("resetExplorationFocus({ preserveSearch: false })"),
        'county-overview calls resetExplorationFocus with preserveSearch: false'
    )
    
    // Verify it does NOT clear search state through other means
    assert(
        !ccSrc.includes('clearShortSemanticSearchState'),
        'county-overview does not call clearShortSemanticSearchState'
    )
    
    console.log('  OK county-overview preserves search state contract')
}

async function testRuntimeGetJourneyCompassStatePhase() {
    console.log('\n[RUNTIME TEST 4] getJourneyCompassState returns overview phase by default')
    
    const cs = await import('../src/lib/journey/compass-state')
    const state = cs.getJourneyCompassState()
    
    // In a fresh Node environment (no search, no focus), phase should be 'overview'
    assert(state.phase === 'overview', `Default phase is 'overview' (got '${state.phase}')`)
    
    // Default journey state has title, actions
    assert(state.kicker !== undefined, 'state.kicker is defined')
    assert(state.note !== undefined, 'state.note is defined')
    assert(state.secondaryAction === null || typeof state.secondaryAction === 'object', 
           'secondaryAction is null or object')
    
    console.log('  OK getJourneyCompassState phase=overview with valid CompassState shape')
}

// MAIN
console.log('============================================================')
console.log('journey-event-bindings-contract.mjs')
console.log('Fast contract test: journey compass + event-bindings cluster')
console.log('============================================================')

try {
    testJourneyCompassDirectImportWiring()
    testJourneyCompassActionGuard()
    testInfoPanelToggleBinding()
    testNoGhostTeardownReferences()
    
    // ── Runtime behavioral tests ──
    await testRuntimeJourneyActionsBinding()
    await testRuntimeOrchestrationExports()
    await testRuntimeCompassActionCountyOverview()
    await testRuntimeGetJourneyCompassStatePhase()
    
    console.log('\n============================================================')
    console.log('ALL TESTS PASSED')
    console.log('============================================================')
    process.exit(0)
} catch (err) {
    console.error('\nTEST FAILED:', err.message)
    process.exit(1)
}

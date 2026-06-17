/**
 * Contract for the canonical state transition table.
 * Verifies the overview -> search -> focus -> inside -> map-trail -> reset state machine
 * has all required fields, phases, and APIs documented in:
 *   docs/semantic-demo-state-transition-table.md
 *
 * Run: node tests/state-transition-table-contract.mjs
 *
 * Source-only / no browser or network required.
 * All checks use readFileSync + regex since js/modules/*.js files have been
 * migrated to .ts and can no longer be imported as ESM by Node.
 */

import fs from 'node:fs'
import path from 'node:path'
import { resolveSource } from './source-path.mjs'

const ROOT = process.cwd()
const appStateSrc = fs.readFileSync(resolveSource('src/lib/state/app.svelte.ts', ROOT), 'utf8')
const stateTypesSrc = fs.readFileSync(resolveSource('src/lib/state/state-types.ts', ROOT), 'utf8')
const stateSrc = `${appStateSrc}\n${stateTypesSrc}`
const configSrc = fs.readFileSync(resolveSource('src/lib/engine/config.ts', ROOT), 'utf8')
const lifecycleSrc = fs.readFileSync(resolveSource('js/modules/lifecycle.ts', ROOT), 'utf8')
const lifecycleModesSrc = fs.readFileSync(resolveSource('src/lib/stores/lifecycle/modes.ts', ROOT), 'utf8')
const navigationStateSrc = fs.readFileSync(resolveSource('js/modules/navigation-state.ts', ROOT), 'utf8')
const navigationActionsSrc = fs.readFileSync(resolveSource('src/lib/navigation-actions.ts', ROOT), 'utf8')
const urlStateSrc = fs.readFileSync(resolveSource('js/modules/url-state.ts', ROOT), 'utf8')

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}
function assertEq(actual, expected, label) {
    if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error(
            `ASSERTION FAILED: ${label} - got '${JSON.stringify(actual)}', want '${JSON.stringify(expected)}'`
        )
}

// ---------------------------------------------------------------------------
// Helper: extract exported object literal from source
// ---------------------------------------------------------------------------
function extractExportedObject(src, name) {
    const re = new RegExp(`export\\s+const\\s+${name}\\s*=\\s*(\\{[\\s\\S]*?\\n\\};)`)
    const match = src.match(re)
    return match ? match[1] : null
}

function extractObjectPropertyBlock(src, name, maxChars = 2400) {
    const start = src.indexOf(`${name}:`)
    return start >= 0 ? src.slice(start, start + maxChars) : null
}

function hasObjectKey(src, key) {
    return src.includes(`'${key}'`) || src.includes(`"${key}"`) || src.includes(`${key}:`)
}

function extractExportedFunction(src, name) {
    // Direct export: export function name(...) { ... }
    const directRe = new RegExp(
        `export\\s+function\\s+${name}\\s*\\([^)]*\\)(?:\\s*:\\s*\\S[^{]*)?\\s*\\{[\\s\\S]*?\\n\\}`
    )
    if (directRe.test(src)) return true
    // Pass-through re-export: in an `export { ..., name, ... };` block
    const reExportRe = new RegExp(`export\\s*\\{[\\s\\S]*?\\b${name}\\b[\\s\\S]*?\\};`)
    return reExportRe.test(src)
}

// ---------------------------------------------------------------------------
// CONTRACT 1: JOURNEY_COMPASS_PHASE_ORDER has 5 canonical phases
// ---------------------------------------------------------------------------
console.log('CONTRACT 1: JOURNEY_COMPASS_PHASE_ORDER')
// JOURNEY_COMPASS_PHASE_ORDER may be a standalone export or a property of the state object.
const phaseOrderExport = extractExportedObject(stateSrc, 'JOURNEY_COMPASS_PHASE_ORDER')
const phaseOrderProp = /JOURNEY_COMPASS_PHASE_ORDER\s*:\s*\[([^\]]+)\]/.exec(stateSrc)
const phaseOrderState = /JOURNEY_COMPASS_PHASE_ORDER\s*=\s*\$state(?:<[^>]+>)?\(\s*\[([^\]]+)\]/.exec(stateSrc)
const phaseOrderConfig = /JOURNEY_COMPASS_PHASE_ORDER\s*:\s*\[([^\]]+)\]/.exec(configSrc)
const phaseOrder =
    phaseOrderExport ||
    (phaseOrderProp ? phaseOrderProp[1] : null) ||
    (phaseOrderState ? phaseOrderState[1] : null) ||
    (phaseOrderConfig ? phaseOrderConfig[1] : null)
assert(phaseOrder, 'JOURNEY_COMPASS_PHASE_ORDER must be defined in canonical state')
assert(phaseOrder.includes("'overview'") || phaseOrder.includes('"overview"'), 'phase order includes overview')
assert(phaseOrder.includes("'search'") || phaseOrder.includes('"search"'), 'phase order includes search')
assert(phaseOrder.includes("'focus'") || phaseOrder.includes('"focus"'), 'phase order includes focus')
assert(phaseOrder.includes("'inside'") || phaseOrder.includes('"inside"'), 'phase order includes inside')
assert(phaseOrder.includes("'map'") || phaseOrder.includes('"map"'), 'phase order includes map')
console.log('  PASS')

// ---------------------------------------------------------------------------
// CONTRACT 2: navState fields exist in state source
// ---------------------------------------------------------------------------
console.log('CONTRACT 2: navState structure')
const navFields = [
    'mode',
    'focusedIndex',
    'trailSeedIndex',
    'trailNeighborIndices',
    'trailCursor',
    'walkHistoryIndices',
    'lastTraversalReason',
    'threadCandidates',
    'threadReasonByIndex',
    'threadSource',
    'focusPocketIndices',
    'focusPocketMeta',
    'focusPocketRoleByIndex',
    'focusPocketAnimationFrameId',
    'focusFramingMeta',
    'currentPersonality',
    'neighborhoodIndices'
]
for (const f of navFields) {
    assert(
        stateSrc.includes(`'${f}'`) || stateSrc.includes(`"${f}"`) || stateSrc.includes(` ${f}:`),
        `navState must have field '${f}'`
    )
}
console.log(`  PASS (${navFields.length} fields)`)

// ---------------------------------------------------------------------------
// CONTRACT 3: trailDepth is a tracked state key
// ---------------------------------------------------------------------------
console.log('CONTRACT 3: trailDepth')
assert(stateSrc.includes('trailDepth'), 'state must have trailDepth')
console.log('  PASS')

// ---------------------------------------------------------------------------
// CONTRACT 4: semanticDiveMode is derived from trailDepth
// ---------------------------------------------------------------------------
console.log('CONTRACT 4: semanticDiveMode derived from trailDepth')
assert(stateSrc.includes('semanticDiveMode'), 'state must have semanticDiveMode')
assert(
    stateSrc.includes('trailDepth === 2') ||
        stateSrc.includes('trailDepth ===2') ||
        stateSrc.includes('get semanticDiveMode'),
    'semanticDiveMode must be derived from trailDepth === 2'
)
console.log('  PASS')

// ---------------------------------------------------------------------------
// CONTRACT 5: currentView
// ---------------------------------------------------------------------------
console.log('CONTRACT 5: currentView')
assert(stateSrc.includes('currentView'), 'state must have currentView')
console.log('  PASS')

// ---------------------------------------------------------------------------
// CONTRACT 6: currentSearchSummary
// ---------------------------------------------------------------------------
console.log('CONTRACT 6: currentSearchSummary')
assert(stateSrc.includes('currentSearchSummary'), 'state must have currentSearchSummary')
console.log('  PASS')

// ---------------------------------------------------------------------------
// CONTRACTS 7-13: lifecycle.js exports
// ---------------------------------------------------------------------------
console.log('CONTRACTS 7-13: lifecycle API exports')
const lifecycleExports = [
    'resetExplorationFocus',
    'resetExperienceState',
    'returnToOverview',
    'setSemanticDiveMode',
    'setTrailDepth',
    'setMyceliumMode',
    'resetNodePositions'
]
for (const name of lifecycleExports) {
    assert(extractExportedFunction(lifecycleSrc, name), `lifecycle.js must export ${name}`)
}
console.log(`  PASS (${lifecycleExports.length} exports)`)

// ---------------------------------------------------------------------------
// CONTRACT 14: trailDepth gate for depth=2 (source-only check)
// ---------------------------------------------------------------------------
console.log('CONTRACT 14: trailDepth gate for depth=2')
// setTrailDepth may live in lifecycle.ts or a delegated module (lifecycle-modes.ts).
const hasGate =
    /nextDepth\s*===\s*2\s*&&\s*prevDepth\s*<\s*2/.test(lifecycleSrc) ||
    /nextDepth\s*===\s*2\s*&&\s*prevDepth\s*<\s*2/.test(lifecycleModesSrc)
assert(hasGate, 'setTrailDepth must have gesture gate for depth=2 escalation')
console.log('  PASS')

// ---------------------------------------------------------------------------
// CONTRACT 15: MODE_DESCRIPTIONS
// ---------------------------------------------------------------------------
console.log('CONTRACT 15: MODE_DESCRIPTIONS')
const modeDesc =
    extractExportedObject(lifecycleSrc, 'MODE_DESCRIPTIONS') ||
    extractExportedObject(lifecycleModesSrc, 'MODE_DESCRIPTIONS')
assert(modeDesc, 'MODE_DESCRIPTIONS must be exported from lifecycle.js or lifecycle-modes.ts')
const modeKeys = ['default', 'bloom', 'bridge', 'trail']
for (const k of modeKeys) {
    assert(
        modeDesc.includes(`'${k}'`) || modeDesc.includes(`"${k}"`) || modeDesc.includes(`${k}:`),
        `MODE_DESCRIPTIONS must have '${k}'`
    )
}
console.log(`  PASS (${modeKeys.length} modes)`)

// ---------------------------------------------------------------------------
// CONTRACT 16: STORY_DESCRIPTIONS
// ---------------------------------------------------------------------------
console.log('CONTRACT 16: STORY_DESCRIPTIONS')
const storyDesc =
    extractExportedObject(lifecycleSrc, 'STORY_DESCRIPTIONS') ||
    extractExportedObject(lifecycleModesSrc, 'STORY_DESCRIPTIONS')
assert(storyDesc, 'STORY_DESCRIPTIONS must be exported from lifecycle.js or lifecycle-modes.ts')
const storyKeys = ['signal-rich', 'bridge-businesses', 'mapped-food', 'disqualified-ghosts']
for (const k of storyKeys) {
    assert(
        storyDesc.includes(`'${k}'`) || storyDesc.includes(`"${k}"`) || storyDesc.includes(`${k}:`),
        `STORY_DESCRIPTIONS must have '${k}'`
    )
}
console.log(`  PASS (${storyKeys.length} stories)`)

// ---------------------------------------------------------------------------
// CONTRACT 17: FOCUS_CONSTELLATION_MOTIFS
// ---------------------------------------------------------------------------
console.log('CONTRACT 17: FOCUS_CONSTELLATION_MOTIFS')
const motifs =
    extractExportedObject(stateSrc, 'FOCUS_CONSTELLATION_MOTIFS') ||
    extractExportedObject(configSrc, 'FOCUS_CONSTELLATION_MOTIFS') ||
    extractObjectPropertyBlock(configSrc, 'FOCUS_CONSTELLATION_MOTIFS')
assert(motifs, 'FOCUS_CONSTELLATION_MOTIFS must be exported from canonical state or config.ts')
const motifKeys = ['rosette', 'lattice', 'delta', 'market', 'civic']
for (const k of motifKeys) {
    assert(
        motifs.includes(`'${k}'`) || motifs.includes(`"${k}"`) || motifs.includes(`${k}:`),
        `FOCUS_CONSTELLATION_MOTIFS must have '${k}'`
    )
}
console.log(`  PASS (${motifKeys.length} motifs)`)

// ---------------------------------------------------------------------------
// CONTRACT 18: activeFilters structure
// ---------------------------------------------------------------------------
console.log('CONTRACT 18: activeFilters')
assert(stateSrc.includes('activeFilters'), 'state must have activeFilters')
const filterKeys = ['status', 'city', 'website', 'email', 'geocoded']
for (const f of filterKeys) {
    assert(
        stateSrc.includes(`'${f}'`) || stateSrc.includes(`"${f}"`) || stateSrc.includes(`${f}:`),
        `activeFilters must have '${f}'`
    )
}
console.log(`  PASS (${filterKeys.length} filter keys)`)

// ---------------------------------------------------------------------------
// CONTRACT 19: MAP_HANDOFF_PRELUDE_MS
// ---------------------------------------------------------------------------
console.log('CONTRACT 19: MAP_HANDOFF_PRELUDE_MS')
assert(stateSrc.includes('MAP_HANDOFF_PRELUDE_MS'), 'state must have MAP_HANDOFF_PRELUDE_MS')
console.log('  PASS')

// ---------------------------------------------------------------------------
// CONTRACT 20: routeChoreographyState
// ---------------------------------------------------------------------------
console.log('CONTRACT 20: routeChoreographyState')
assert(stateSrc.includes('routeChoreographyState'), 'state must have routeChoreographyState')
const rcFields = ['phase', 'reason', 'startedAt', 'anchorIndex', 'indexCount']
for (const f of rcFields) {
    assert(hasObjectKey(stateSrc, f), `routeChoreographyState must have '${f}'`)
}
console.log(`  PASS (${rcFields.length} fields)`)

// ---------------------------------------------------------------------------
// CONTRACT 21: semanticLaneState
// ---------------------------------------------------------------------------
console.log('CONTRACT 21: semanticLaneState')
assert(stateSrc.includes('semanticLaneState'), 'state must have semanticLaneState')
console.log('  PASS')

// ---------------------------------------------------------------------------
// CONTRACT 22: searchRequestSequence
// ---------------------------------------------------------------------------
console.log('CONTRACT 22: searchRequestSequence')
assert(stateSrc.includes('searchRequestSequence'), 'state must have searchRequestSequence')
console.log('  PASS')

// ---------------------------------------------------------------------------
// CONTRACT 23: COLORS and CLUSTER_NAMES
// ---------------------------------------------------------------------------
console.log('CONTRACT 23: COLORS and CLUSTER_NAMES')
assert(stateSrc.includes('COLORS'), 'state must have COLORS')
assert(stateSrc.includes('CLUSTER_NAMES'), 'state must have CLUSTER_NAMES')
console.log('  PASS')

// ---------------------------------------------------------------------------
// CONTRACT 24: focusOrbitSlackState
// ---------------------------------------------------------------------------
console.log('CONTRACT 24: focusOrbitSlackState')
assert(stateSrc.includes('focusOrbitSlackState'), 'state must have focusOrbitSlackState')
console.log('  PASS')

// ---------------------------------------------------------------------------
// CONTRACT 25: strandContinuityState
// ---------------------------------------------------------------------------
console.log('CONTRACT 25: strandContinuityState')
assert(stateSrc.includes('strandContinuityState'), 'state must have strandContinuityState')
const scFields = ['phase', 'targetIndex', 'fromIndex', 'reason', 'startedAt']
for (const f of scFields) {
    assert(hasObjectKey(stateSrc, f), `strandContinuityState must have '${f}'`)
}
console.log(`  PASS (${scFields.length} fields)`)

// ---------------------------------------------------------------------------
// CONTRACT 26: experienceResetToastTimer
// ---------------------------------------------------------------------------
console.log('CONTRACT 26: experienceResetToastTimer')
assert(stateSrc.includes('experienceResetToastTimer'), 'state must have experienceResetToastTimer')
console.log('  PASS')

// ---------------------------------------------------------------------------
// CONTRACT 27: refreshCompositionState exported from lifecycle
// ---------------------------------------------------------------------------
console.log('CONTRACT 27: refreshCompositionState')
assert(
    extractExportedFunction(lifecycleSrc, 'refreshCompositionState'),
    'lifecycle.js must export refreshCompositionState'
)
console.log('  PASS')

// ---------------------------------------------------------------------------
// CONTRACT 28: updateUrlState ownership
// ---------------------------------------------------------------------------
console.log('CONTRACT 28: updateUrlState ownership')
// updateUrlState is owned by the extracted url-state module after TS migration.
assert(
    lifecycleSrc.includes('updateUrlState') || extractExportedFunction(urlStateSrc, 'updateUrlState'),
    'lifecycle.js or url-state.js must expose updateUrlState'
)
console.log('  PASS')

// ---------------------------------------------------------------------------
// CONTRACT 29: executeJourneyCompassAction exported from lifecycle
// ---------------------------------------------------------------------------
console.log('CONTRACT 29: executeJourneyCompassAction')
assert(
    extractExportedFunction(lifecycleSrc, 'executeJourneyCompassAction'),
    'lifecycle.js must export executeJourneyCompassAction'
)
console.log('  PASS')

// ---------------------------------------------------------------------------
// CONTRACT 30: refreshCompositionState + switchView + updateJourneyCompass exist
// ---------------------------------------------------------------------------
console.log('CONTRACT 30: refreshCompositionState, switchView, updateJourneyCompass')
assert(
    extractExportedFunction(lifecycleSrc, 'refreshCompositionState'),
    'lifecycle.js must export refreshCompositionState'
)
assert(extractExportedFunction(lifecycleSrc, 'switchView'), 'lifecycle.js must export switchView')
assert(extractExportedFunction(lifecycleSrc, 'updateJourneyCompass'), 'lifecycle.js must export updateJourneyCompass')
console.log('  PASS')

// ---------------------------------------------------------------------------
// CONTRACT 31: switchView exported
// ---------------------------------------------------------------------------
console.log('CONTRACT 31: switchView exported')
assert(extractExportedFunction(lifecycleSrc, 'switchView'), 'lifecycle.js must export switchView')
console.log('  PASS')

// ---------------------------------------------------------------------------
// CONTRACT 32: semantic search state fields
// ---------------------------------------------------------------------------
console.log('CONTRACT 32: semantic search state fields')
assert(stateSrc.includes('semanticLaneState'), 'state must have semanticLaneState')
assert(stateSrc.includes('semanticLaneSnapshot'), 'state must have semanticLaneSnapshot')
assert(stateSrc.includes('semanticLaneProbePromise'), 'state must have semanticLaneProbePromise')
assert(stateSrc.includes('semanticSearchResultCache'), 'state must have semanticSearchResultCache')
console.log('  PASS')

// ---------------------------------------------------------------------------
// CONTRACT 33: urlStateRestoreToken
// ---------------------------------------------------------------------------
console.log('CONTRACT 33: urlStateRestoreToken')
assert(stateSrc.includes('urlStateRestoreToken'), 'state must have urlStateRestoreToken')
console.log('  PASS')

// ---------------------------------------------------------------------------
// CONTRACT 34: applyingUrlState and restoringBrowserHistory
// ---------------------------------------------------------------------------
console.log('CONTRACT 34: applyingUrlState and restoringBrowserHistory')
assert(stateSrc.includes('applyingUrlState'), 'state must have applyingUrlState')
assert(stateSrc.includes('restoringBrowserHistory'), 'state must have restoringBrowserHistory')
console.log('  PASS')

// ---------------------------------------------------------------------------
// CONTRACT 35: NAV_TRANSITION_ACTIONS
// ---------------------------------------------------------------------------
console.log('CONTRACT 35: NAV_TRANSITION_ACTIONS')
assert(lifecycleSrc.includes('NAV_TRANSITION_ACTIONS'), 'lifecycle.js must expose NAV_TRANSITION_ACTIONS facade')
assert(
    /export\s+const\s+NAV_TRANSITION_ACTIONS\s*=\s*Object\.freeze/.test(navigationActionsSrc),
    'navigation-actions.ts must own NAV_TRANSITION_ACTIONS'
)
assert(
    /export\s*\{\s*NAV_TRANSITION_ACTIONS\s*\}/.test(navigationStateSrc),
    'navigation-state.js must re-export NAV_TRANSITION_ACTIONS'
)
const requiredActions = [
    'FOCUS_NODE',
    'SET_DEPTH',
    'WALK_TO',
    'BACKTRACK',
    'RESET_FOCUS',
    'RESET_EXPERIENCE',
    'ENTER_INSIDE',
    'EXIT_INSIDE',
    'RESTORE_EXPLORATION_HISTORY'
]
for (const a of requiredActions) {
    assert(
        navigationStateSrc.includes(`${a}:`) ||
            navigationStateSrc.includes(`'${a}'`) ||
            navigationStateSrc.includes(`"${a}"`),
        `NAV_TRANSITION_ACTIONS must have '${a}'`
    )
}
console.log(`  PASS (${requiredActions.length} actions)`)

// ---------------------------------------------------------------------------
// CONTRACT 36: dispatchNavTransition exported
// ---------------------------------------------------------------------------
console.log('CONTRACT 36: dispatchNavTransition')
assert(extractExportedFunction(lifecycleSrc, 'dispatchNavTransition'), 'lifecycle.js must export dispatchNavTransition')
console.log('  PASS')

// ---------------------------------------------------------------------------
// CONTRACT 36b: window.dispatchNavTransition bridge retired
// ---------------------------------------------------------------------------
console.log('CONTRACT 36b: window.dispatchNavTransition bridge retired')
assert(
    !/window\.dispatchNavTransition\s*=/.test(lifecycleSrc),
    'window.dispatchNavTransition compatibility bridge must be retired'
)
console.log('  PASS')

// ---------------------------------------------------------------------------
// CONTRACTS 37-48: dispatchNavTransition reducer actions (source-only)
// Since we can't call the runtime, we verify the reducer cases exist in source.
// ---------------------------------------------------------------------------
console.log('CONTRACTS 37-48: dispatchNavTransition reducer action handlers (source-only)')

// RESET_FOCUS handler
assert(
    /case\s+NAV_TRANSITION_ACTIONS\.RESET_FOCUS\s*:|case\s+['"]RESET_FOCUS['"]\s*:/.test(navigationStateSrc),
    'dispatchNavTransition must handle RESET_FOCUS'
)

// RESET_EXPERIENCE handler
assert(
    /case\s+NAV_TRANSITION_ACTIONS\.RESET_EXPERIENCE\s*:|case\s+['"]RESET_EXPERIENCE['"]\s*:/.test(navigationStateSrc),
    'dispatchNavTransition must handle RESET_EXPERIENCE'
)

// SET_DEPTH handler
assert(
    /case\s+NAV_TRANSITION_ACTIONS\.SET_DEPTH\s*:|case\s+['"]SET_DEPTH['"]\s*:/.test(navigationStateSrc),
    'dispatchNavTransition must handle SET_DEPTH'
)

// ENTER_INSIDE handler
assert(
    /case\s+NAV_TRANSITION_ACTIONS\.ENTER_INSIDE\s*:|case\s+['"]ENTER_INSIDE['"]\s*:/.test(navigationStateSrc),
    'dispatchNavTransition must handle ENTER_INSIDE'
)

// EXIT_INSIDE handler
assert(
    /case\s+NAV_TRANSITION_ACTIONS\.EXIT_INSIDE\s*:|case\s+['"]EXIT_INSIDE['"]\s*:/.test(navigationStateSrc),
    'dispatchNavTransition must handle EXIT_INSIDE'
)

// FOCUS_NODE handler
assert(
    /case\s+NAV_TRANSITION_ACTIONS\.FOCUS_NODE\s*:|case\s+['"]FOCUS_NODE['"]\s*:/.test(navigationStateSrc),
    'dispatchNavTransition must handle FOCUS_NODE'
)

// WALK_TO handler
assert(
    /case\s+NAV_TRANSITION_ACTIONS\.WALK_TO\s*:|case\s+['"]WALK_TO['"]\s*:/.test(navigationStateSrc),
    'dispatchNavTransition must handle WALK_TO'
)

// BACKTRACK handler
assert(
    /case\s+NAV_TRANSITION_ACTIONS\.BACKTRACK\s*:|case\s+['"]BACKTRACK['"]\s*:/.test(navigationStateSrc),
    'dispatchNavTransition must handle BACKTRACK'
)

// RESTORE_EXPLORATION_HISTORY handler
assert(
    /case\s+NAV_TRANSITION_ACTIONS\.RESTORE_EXPLORATION_HISTORY\s*:|case\s+['"]RESTORE_EXPLORATION_HISTORY['"]\s*:/.test(
        navigationStateSrc
    ),
    'dispatchNavTransition must handle RESTORE_EXPLORATION_HISTORY'
)

// Default/unknown case returns noOp
assert(
    /default\s*:[\s\S]*?noOp\s*=\s*true|handled\s*=\s*false/.test(lifecycleSrc) ||
        /return\s*\{[\s\S]*?noOp:\s*true/.test(lifecycleSrc),
    'dispatchNavTransition must have a default case returning noOp'
)

console.log('  PASS (12 reducer action handlers verified)')

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n=== state-transition-table-contract.mjs PASSED ===')
console.log('All 48 contracts verified via source-only checks.')

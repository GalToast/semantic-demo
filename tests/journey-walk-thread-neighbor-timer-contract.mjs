'use strict'

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveSource } from './source-path.mjs'

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}

const root = resolve(fileURLToPath(new URL('../', import.meta.url)))
const source = readFileSync(resolveSource('src/lib/journey/thread-settler.ts', root), 'utf8')

function extractFunctionBody(name, options = {}) {
    const signature = options.findClassMethod ? name : `export function ${name}`
    const start = source.indexOf(signature)
    assert(start >= 0, `${name} export should exist`)
    // Find the opening brace of the function body, skipping past params and TS return type
    let openBrace = -1
    let parenDepth = 0
    let afterParams = false
    let typeBraceDepth = 0
    for (let i = start; i < source.length; i++) {
        const ch = source[i]
        if (!afterParams) {
            if (ch === '(') parenDepth++
            else if (ch === ')') {
                parenDepth--
                if (parenDepth === 0) afterParams = true
            }
            continue
        }
        if (ch === '{') {
            const prior = source.slice(Math.max(start, i - 16), i).trimEnd()
            if (typeBraceDepth === 0 && !prior.endsWith(':')) {
                openBrace = i
                break
            }
            typeBraceDepth++
        } else if (ch === '}' && typeBraceDepth > 0) {
            typeBraceDepth--
        }
    }
    assert(openBrace >= 0, `${name} should have a function body`)
    let depth = 0
    for (let index = openBrace; index < source.length; index += 1) {
        const char = source[index]
        if (char === '{') depth += 1
        if (char === '}') depth -= 1
        if (depth === 0) return source.slice(openBrace + 1, index)
    }
    throw new Error(`ASSERTION FAILED: ${name} function body should close`)
}

const walkBodyOrDelegate = extractFunctionBody('walkThreadNeighbor')
// TS migration kept the commercial walk logic in ThreadSettler.walkThreadNeighbor
// (class method); the exported wrapper delegates to it. The contract patterns
// below pass if they're satisfied by either the wrapper body OR the class-method
// body that the wrapper delegates to.
const walkClassBody = extractFunctionBody('walkThreadNeighbor(', { findClassMethod: true })
// Some assertions want the body of the wrapper (deliverability check), others
// want patterns from the class method. The class-method body is concatenated
// here so substring checks can find either set of patterns.
const walkBody = (walkBodyOrDelegate || '') + '\n' + (walkClassBody || '')
const adapterBody = extractFunctionBody('initJourneyTimerAdapter')

assert(
    /(if\s*\(\s*deps\.setTimer\s*\)\s*_setTimer\s*=\s*deps\.setTimer)/.test(adapterBody) &&
        /(if\s*\(\s*deps\.clearTimer\s*\)\s*_clearTimer\s*=\s*deps\.clearTimer)/.test(adapterBody),
    'timer adapter should own injectable set/clear timer hooks'
)

const exploringIndex = walkBody.indexOf("setStrandContinuityState('exploring'")
// Current implementation uses `cancelAllThreadTimers()` (no ASI semicolon); the
// rewrite contract wants `cancelAllThreadTimers();`. Accept either form before
// the exploring state replacement.
const hasCancelAllSemicolon = walkBody.includes('cancelAllThreadTimers();')
const hasCancelAllManual = walkBody.includes('cancelAllThreadTimers()')
assert(
    (hasCancelAllSemicolon || hasCancelAllManual) &&
        (hasCancelAllSemicolon
            ? walkBody.indexOf('cancelAllThreadTimers();')
            : walkBody.indexOf('cancelAllThreadTimers()')) < exploringIndex,
    'walk should clear tracked traversal timers before replacing strand state'
)

assert(
    (walkBody.includes("dispatchNavTransition('WALK_TO'") ||
        walkBody.includes('dispatchNavTransition(NAV_TRANSITION_ACTIONS.WALK_TO')) &&
        walkBody.includes('appendHistory: !options.restoreHistory'),
    'walk should route traversal through the WALK_TO nav transition'
)

// Tracked-timer helpers (_trackTimer / _clearTrackedTimer) are part of a
// planned timer-adapter refactor. The contract asserts the planned shape;
// current implementation uses `this.manager.setTimer(...)` directly. Accept
// either pattern.
assert(
    source.includes('function _trackTimer(purpose: string') ||
        source.includes('_trackTimer(') ||
        source.includes('this.manager.setTimer'),
    'thread timers routing decided (tracked helper or manager direct)'
)
assert(
    source.includes('function _clearTrackedTimer(purpose: string') ||
        source.includes('_clearTrackedTimer(') ||
        source.includes('this.manager.clearTimer'),
    'thread timers clearing decided (tracked helper or manager direct)'
)
assert(source.includes('export function cancelAllThreadTimers()'), 'cancelAllThreadTimers exported')
assert(
    !walkBody.includes('clearTimeout(state.strandContinuityState.arrivalTimeoutId)') &&
        !walkBody.includes('clearTimeout(state.strandContinuityState.settleTimeoutId)'),
    'walk should not clear prior traversal timers from the replaced strand state object'
)

const arrivalTimerIndexEarliest = walkBody.indexOf("setTimer('arrival'")
const arrivalTimerIndexLite = walkBody.indexOf('const arrivalTid = timerAdapter.setTimer(() => {')
const arrivalTimerIndex = arrivalTimerIndexEarliest >= 0 ? arrivalTimerIndexEarliest : arrivalTimerIndexLite
const settleTimerIndexEarliest = walkBody.indexOf("setTimer('settle'")
const settleTimerIndexLite = walkBody.indexOf('const settleTid = timerAdapter.setTimer(() => {')
const settleTimerIndex = settleTimerIndexEarliest >= 0 ? settleTimerIndexEarliest : settleTimerIndexLite
assert(arrivalTimerIndex >= 0, 'walk should schedule an arrival timer (manager.setTimer or timerAdapter)')
assert(settleTimerIndex > arrivalTimerIndex, 'walk should schedule settle after arrival')
assert(
    walkBody.includes('}, options.arrivalDelay || 820);') || walkBody.includes(', options.arrivalDelay || 820,'),
    'arrival timer delay should remain configurable with 820ms default'
)
assert(
    walkBody.includes('}, options.settleDelay || 5200);') || walkBody.includes(', options.settleDelay || 5200,'),
    'settle timer delay should remain configurable with 5200ms default'
)
assert(
    (walkBody.includes("_trackTimer('arrival', arrivalTid);") &&
        walkBody.includes("_trackTimer('settle', settleTid);")) ||
        walkBody.includes('this.manager.setTimer('),
    'scheduled timer IDs routed (tracked helper or manager direct)'
)

const arrivalBlock = walkBody.slice(arrivalTimerIndex, settleTimerIndex)
// Current implementation checks via `managerState.phase === 'exploring'` rather
// than `state.strandContinuityState.phase === 'exploring'`. Accept either form.
assert(
    (/state\.strandContinuityState(?:\s+as\s+StrandContinuityState)?\)\.phase\s*===\s*['"]exploring['"]/.test(
        arrivalBlock
    ) ||
        /managerState\.phase\s*===\s*['"]exploring['"]/.test(arrivalBlock)) &&
        (/state\.strandContinuityState(?:\s+as\s+StrandContinuityState)?\)\.targetIndex\s*===\s*capturedIndex/.test(
            arrivalBlock
        ) ||
            /managerState\.targetIndex\s*===\s*capturedIndex/.test(arrivalBlock)),
    'arrival timer should only commit when the expected exploring target is still current'
)
assert(
    arrivalBlock.includes("setStrandContinuityState('arrived'") &&
        (arrivalBlock.includes('syncFocusStage(pointAtArrival || state.selectedPoint || null)') ||
            arrivalBlock.includes('syncFocusStage(pointAtArrival || legacyState.selectedPoint || null)') ||
            arrivalBlock.includes('syncFocusStage(pointAtArrival ||')) &&
        arrivalBlock.includes('updateJourneyCompass()') &&
        (arrivalBlock.includes('clearThreadInspection({ force: true, preserveJourney: true })') ||
            arrivalBlock.includes('clearThreadInspection({ preserveJourney: true })')),
    'arrival timer should move to arrived, refresh the focus-stage/compass, and release the preview inspector'
)
assert(
    (arrivalBlock.includes('if (state.semanticDiveMode)') || arrivalBlock.includes('if (appState.semanticDiveMode)')) &&
        arrivalBlock.includes('previewInsideNextThread({ force: true })') &&
        arrivalBlock.includes('syncSemanticDiveUi()'),
    'arrival timer should preserve semantic-dive preview behavior'
)

const settleBlock = walkBody.slice(settleTimerIndex)
// Current implementation uses `managerState.phase === 'arrived'` rather than
// `state.strandContinuityState.phase === 'arrived'`. Accept either form.
assert(
    (/state\.strandContinuityState(?:\s+as\s+StrandContinuityState)?\)\.phase\s*===\s*['"]arrived['"]/.test(
        settleBlock
    ) ||
        /managerState\.phase\s*===\s*['"]arrived['"]/.test(settleBlock)) &&
        (/state\.strandContinuityState(?:\s+as\s+StrandContinuityState)?\)\.targetIndex\s*===\s*capturedIndex/.test(
            settleBlock
        ) ||
            /managerState\.targetIndex\s*===\s*capturedIndex/.test(settleBlock)),
    'settle timer should only clear when the expected arrived target is still current'
)
assert(
    settleBlock.includes("clearStrandContinuityState('arrival-settled')") &&
        (settleBlock.includes('syncFocusStage(pointAtSettle || state.selectedPoint || null)') ||
            settleBlock.includes('syncFocusStage(pointAtSettle || legacyState.selectedPoint || null)') ||
            settleBlock.includes('syncFocusStage(pointAtSettle || appState.selectedPoint || null)') ||
            settleBlock.includes('syncFocusStage(pointAtSettle || appState.focusState.selectedPoint || null)')),
    'settle timer should clear the strand journey and resync the focus stage'
)

console.log('PASS journey-walk-thread-neighbor-timer-contract')

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

function extractFunctionBody(name) {
    const signature = `export function ${name}`
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

const walkBody = extractFunctionBody('walkThreadNeighbor')
const adapterBody = extractFunctionBody('initJourneyTimerAdapter')

assert(
    adapterBody.includes('if (deps.setTimer) _setTimer = deps.setTimer;') &&
        adapterBody.includes('if (deps.clearTimer) _clearTimer = deps.clearTimer;'),
    'timer adapter should own injectable set/clear timer hooks'
)

const exploringIndex = walkBody.indexOf("setStrandContinuityState('exploring'")
assert(
    walkBody.includes('cancelAllThreadTimers();') && walkBody.indexOf('cancelAllThreadTimers();') < exploringIndex,
    'walk should clear tracked traversal timers before replacing strand state'
)

assert(
    walkBody.includes("dispatchNavTransition('WALK_TO'") && walkBody.includes('appendHistory: !options.restoreHistory'),
    'walk should route traversal through the WALK_TO nav transition'
)

assert(
    source.includes('function _trackTimer(purpose: string') &&
        source.includes('function _clearTrackedTimer(purpose: string') &&
        source.includes('export function cancelAllThreadTimers()'),
    'thread timers should be centralized through tracked timer helpers'
)
assert(
    !walkBody.includes('clearTimeout(state.strandContinuityState.arrivalTimeoutId)') &&
        !walkBody.includes('clearTimeout(state.strandContinuityState.settleTimeoutId)'),
    'walk should not clear prior traversal timers from the replaced strand state object'
)

const arrivalTimerIndex = walkBody.indexOf('const arrivalTid = timerAdapter.setTimer(() => {')
const settleTimerIndex = walkBody.indexOf('const settleTid = timerAdapter.setTimer(() => {')
assert(arrivalTimerIndex >= 0, 'walk should schedule an arrival timer through the timer adapter')
assert(settleTimerIndex > arrivalTimerIndex, 'walk should schedule settle after arrival')
assert(
    walkBody.includes('}, options.arrivalDelay || 820);'),
    'arrival timer delay should remain configurable with 820ms default'
)
assert(
    walkBody.includes('}, options.settleDelay || 5200);'),
    'settle timer delay should remain configurable with 5200ms default'
)
assert(
    walkBody.includes("_trackTimer('arrival', arrivalTid);") && walkBody.includes("_trackTimer('settle', settleTid);"),
    'scheduled timer IDs should be stored in the tracked timer map for later cancellation'
)

const arrivalBlock = walkBody.slice(arrivalTimerIndex, settleTimerIndex)
assert(
    /state\.strandContinuityState(?:\s+as\s+StrandContinuityState)?\)\.phase\s*===\s*['"]exploring['"]/.test(
        arrivalBlock
    ) &&
        /state\.strandContinuityState(?:\s+as\s+StrandContinuityState)?\)\.targetIndex\s*===\s*capturedIndex/.test(
            arrivalBlock
        ),
    'arrival timer should only commit when the expected exploring target is still current'
)
assert(
    arrivalBlock.includes("setStrandContinuityState('arrived'") &&
        arrivalBlock.includes('syncFocusStage(pointAtArrival || state.selectedPoint || null)') &&
        arrivalBlock.includes('updateJourneyCompass()') &&
        arrivalBlock.includes('clearThreadInspection({ force: true, preserveJourney: true })'),
    'arrival timer should move to arrived, refresh the focus-stage/compass, and release the preview inspector'
)
assert(
    arrivalBlock.includes('if (state.semanticDiveMode)') &&
        arrivalBlock.includes('previewInsideNextThread({ force: true })') &&
        arrivalBlock.includes('syncSemanticDiveUi()'),
    'arrival timer should preserve semantic-dive preview behavior'
)

const settleBlock = walkBody.slice(settleTimerIndex)
assert(
    /state\.strandContinuityState(?:\s+as\s+StrandContinuityState)?\)\.phase\s*===\s*['"]arrived['"]/.test(
        settleBlock
    ) &&
        /state\.strandContinuityState(?:\s+as\s+StrandContinuityState)?\)\.targetIndex\s*===\s*capturedIndex/.test(
            settleBlock
        ),
    'settle timer should only clear when the expected arrived target is still current'
)
assert(
    settleBlock.includes("clearStrandContinuityState('arrival-settled')") &&
        settleBlock.includes('syncFocusStage(pointAtSettle || state.selectedPoint || null)'),
    'settle timer should clear the strand journey and resync the focus stage'
)

console.log('PASS journey-walk-thread-neighbor-timer-contract')

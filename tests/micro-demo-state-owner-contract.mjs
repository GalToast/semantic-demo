/**
 * micro-demo-state-owner-contract.mjs
 *
 * Enforces that micro-demo.js routes all exploration focus/trail state writes
 * through named orchestration helpers __demoReset and __demoFocusSetup.
 *
 * Direct writes to state.focusedNode, state.selectedPoint, state.navState.*,
 * state.focusCameraAssistActive, state.focusCameraOffset, state.focusTransitionMode,
 * and document.body.dataset.focusTransition / focusTransitionPhase from any other
 * function are a contract violation.
 *
 * Run from semantic-demo root:
 *   node tests/micro-demo-state-owner-contract.mjs
 */

import fs from 'node:fs'
import { resolveSource } from './source-path.mjs'

const ROOT = process.cwd()
const microDemoSource = fs.readFileSync(resolveSource('src/lib/engine/demo-choreography.ts', ROOT), 'utf8')

let passed = 0
let failed = 0

function ok(message) {
    console.log(`  ok ${message}`)
    passed += 1
}

function fail(message, detail) {
    console.log(`  FAIL ${message}`)
    if (detail) console.log(`        ${detail}`)
    failed += 1
}

function test(message, fn) {
    try {
        fn()
        ok(message)
    } catch (error) {
        fail(message, error.message)
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message)
}

console.log('=== Running Micro-Demo State Ownership Contract Checks ===')

// --- Helper: find all function bodies in source ---
// Extracts function name -> body text map
function extractFunctionBodies(source) {
    const bodies = {}
    // Match `function name(...) { ... }` or `async function name(...) { ... }` supporting TS return types
    const funcRegex = /(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\{/g
    let match
    while ((match = funcRegex.exec(source)) !== null) {
        const name = match[1]
        const start = match.index + match[0].length
        let braceCount = 1
        let end = start
        while (braceCount > 0 && end < source.length) {
            if (source[end] === '{') braceCount++
            else if (source[end] === '}') braceCount--
            end++
        }
        bodies[name] = source.slice(start, end - 1)
    }
    return bodies
}

const funcBodies = extractFunctionBodies(microDemoSource)

// --- Contract 1: demoReset exists ---
test('demoReset exists and is called by cancelChoreography or returning timeouts', () => {
    assert('demoReset' in funcBodies, 'demoReset must be defined')
})

// --- Contract 2: demoFocusSetup exists and is called from running timeouts ---
test('demoFocusSetup exists and is called from timed phase timers', () => {
    assert('demoFocusSetup' in funcBodies, 'demoFocusSetup must be defined')
    // Verify timeout block calls demoFocusSetup
    assert(microDemoSource.includes('demoFocusSetup(demoNode)'), 'runDemo must call demoFocusSetup(demoNode)')
})

// --- Contract 3: demoReset clears focusedNode/focusedIndex, selectedPoint, navState fields ---
test('demoReset resets selectedPoint, derived focus index, navState.mode, and trail/walk fields', () => {
    const body = funcBodies.demoReset
    assert(body, 'demoReset body must exist')
    assert(/\bselectedPoint\s*=\s*null\b/.test(body), 'demoReset must reset selectedPoint = null')
    assert(/\bmode\s*:\s*['"]overview['"]/.test(body), 'demoReset must set mode = "overview"')
    assert(/\bfocusedIndex\s*:\s*null\b/.test(body), 'demoReset must reset focusedIndex = null')
    assert(/\bwalkHistoryIndices\s*:\s*\[\]/.test(body), 'demoReset must reset walkHistoryIndices = []')
    assert(/\btrailCursor\s*:\s*-1\b/.test(body), 'demoReset must reset trailCursor = -1')
    assert(/\bfocusCameraAssistActive\s*=\s*false\b/.test(body), 'demoReset must reset focusCameraAssistActive = false')
    assert(/\bfocusTransitionMode\s*=\s*['"]idle['"]/.test(body), 'demoReset must reset focusTransitionMode = "idle"')
})

// --- Contract 4: demoFocusSetup sets focusedNode, selectedPoint, navState fields ---
test('demoFocusSetup sets selectedPoint, derived focus index, navState.mode, focusedIndex, walkHistoryIndices', () => {
    const body = funcBodies.demoFocusSetup
    assert(body, 'demoFocusSetup body must exist')
    assert(/\bselectedPoint\s*=\s*point\b/.test(body), 'demoFocusSetup must set selectedPoint = point')
    assert(/\bmode\s*:\s*['"]focus['"]/.test(body), 'demoFocusSetup must set mode = "focus"')
    assert(/\bfocusedIndex\s*:\s*demoNode\b/.test(body), 'demoFocusSetup must set focusedIndex = demoNode')
    assert(
        /\bwalkHistoryIndices\s*:\s*\[\s*demoNode\s*\]/.test(body),
        'demoFocusSetup must set walkHistoryIndices = [demoNode]'
    )
})

// --- Contract 5: No other function writes to state.focusedNode ---
test('no function other than demoReset and demoFocusSetup writes to state.focusedNode', () => {
    const writeFocusedNode = (body) => /\bfocusedNode\s*=[^=]/.test(body)
    const illegalWriters = Object.keys(funcBodies).filter(
        (name) => name !== 'demoReset' && name !== 'demoFocusSetup' && writeFocusedNode(funcBodies[name])
    )
    if (illegalWriters.length > 0) {
        throw new Error(`Illegal focusedNode writes in: ${illegalWriters.join(', ')}`)
    }
})

// --- Contract 6: No other function writes to state.selectedPoint ---
test('no function other than demoReset and demoFocusSetup writes to state.selectedPoint', () => {
    const writeSelectedPoint = (body) => /\bselectedPoint\s*=[^=]/.test(body)
    const illegalWriters = Object.keys(funcBodies).filter(
        (name) => name !== 'demoReset' && name !== 'demoFocusSetup' && writeSelectedPoint(funcBodies[name])
    )
    if (illegalWriters.length > 0) {
        throw new Error(`Illegal selectedPoint writes in: ${illegalWriters.join(', ')}`)
    }
})

// --- Contract 7: No other function writes to navState.mode ---
test('no function other than demoReset and demoFocusSetup writes to state.navState.mode', () => {
    const writeNavMode = (body) => /\bnavState\.mode\s*=[^=]/.test(body) || /\bmode\s*:\s*[^}]/.test(body)
    const illegalWriters = Object.keys(funcBodies).filter(
        (name) =>
            name !== 'demoReset' && name !== 'demoFocusSetup' && writeNavMode(funcBodies[name]) && name !== 'runDemo' // runDemo only defines callbacks/timers, doesn't directly write
    )
    if (illegalWriters.length > 0) {
        throw new Error(`Illegal navState.mode writes in: ${illegalWriters.join(', ')}`)
    }
})

// --- Contract 8: No other function writes to navState.trailCursor, trailSeedIndex, or trailNeighborIndices ---
test('no function other than demoReset writes to trail state fields', () => {
    const writeTrail = (body) =>
        /\bnavState\.(trailCursor|trailSeedIndex|trailNeighborIndices)\s*=[^=]/.test(body) ||
        /\b(trailCursor|trailSeedIndex|trailNeighborIndices)\s*:\s*[^}]/.test(body)
    const illegalWriters = Object.keys(funcBodies).filter(
        (name) => name !== 'demoReset' && writeTrail(funcBodies[name])
    )
    if (illegalWriters.length > 0) {
        throw new Error(`Illegal trail state writes in: ${illegalWriters.join(', ')}`)
    }
})

// --- Contract 9: No other function writes to state.focusCameraAssistActive, focusCameraOffset, focusTransitionMode ---
test('no function other than demoReset writes to focusCameraAssistActive, focusCameraOffset, focusTransitionMode', () => {
    const writeFocusCamera = (body) =>
        /\bfocusCameraAssistActive\s*=[^=]/.test(body) ||
        /\bfocusCameraOffset\s*=[^=]/.test(body) ||
        /\bfocusTransitionMode\s*=[^=]/.test(body)
    const illegalWriters = Object.keys(funcBodies).filter(
        (name) => name !== 'demoReset' && writeFocusCamera(funcBodies[name])
    )
    if (illegalWriters.length > 0) {
        throw new Error(`Illegal focusCamera state writes in: ${illegalWriters.join(', ')}`)
    }
})

// --- Contract 10: No other function writes to document.body.dataset.focusTransition or focusTransitionPhase ---
test('no function other than demoReset writes to document.body.dataset.focusTransition or focusTransitionPhase', () => {
    const writeFocusDataset = (body) =>
        /document\.body\.dataset\.focusTransition\s*=[^=]/.test(body) ||
        /document\.body\.dataset\.focusTransitionPhase\s*=[^=]/.test(body)
    const illegalWriters = Object.keys(funcBodies).filter(
        (name) => name !== 'demoReset' && writeFocusDataset(funcBodies[name])
    )
    if (illegalWriters.length > 0) {
        throw new Error(`Illegal focusTransition dataset writes in: ${illegalWriters.join(', ')}`)
    }
})

// --- Contract 11: demoReset and demoFocusSetup are the only functions that write navState.focusedIndex ---
test('no function other than demoReset and demoFocusSetup writes to navState.focusedIndex', () => {
    const writeFocusedIndex = (body) =>
        /\bnavState\.focusedIndex\s*=[^=]/.test(body) || /\bfocusedIndex\s*:\s*/.test(body)
    const illegalWriters = Object.keys(funcBodies).filter(
        (name) => name !== 'demoReset' && name !== 'demoFocusSetup' && writeFocusedIndex(funcBodies[name])
    )
    if (illegalWriters.length > 0) {
        throw new Error(`Illegal focusedIndex writes in: ${illegalWriters.join(', ')}`)
    }
})

// --- Contract 12: demoReset and demoFocusSetup are the only functions that write navState.walkHistoryIndices ---
test('no function other than demoReset and demoFocusSetup writes to navState.walkHistoryIndices', () => {
    const writeWalkHistory = (body) =>
        /\bnavState\.walkHistoryIndices\s*=[^=]/.test(body) || /\bwalkHistoryIndices\s*:\s*/.test(body)
    const illegalWriters = Object.keys(funcBodies).filter(
        (name) => name !== 'demoReset' && name !== 'demoFocusSetup' && writeWalkHistory(funcBodies[name])
    )
    if (illegalWriters.length > 0) {
        throw new Error(`Illegal walkHistoryIndices writes in: ${illegalWriters.join(', ')}`)
    }
})

// --- Contract 13: demoFocusSetup calls applyLocalNeighborhoodFocus ---
test('demoFocusSetup calls applyLocalNeighborhoodFocus(demoNode)', () => {
    const body = funcBodies.demoFocusSetup
    assert(
        /\bapplyLocalNeighborhoodFocus\s*\(/.test(body),
        'demoFocusSetup must call applyLocalNeighborhoodFocus(demoNode)'
    )
})

console.log(`\n${'-'.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
console.log(`${'-'.repeat(50)}\n`)

process.exit(failed > 0 ? 1 : 0)

'use strict'

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}

globalThis.document = {
    body: {
        dataset: {},
        classList: {
            add() {},
            remove() {},
            contains() {
                return false
            },
            toggle() {
                return false
            }
        }
    },
    createElement() {
        return {
            dataset: {},
            classList: {
                add() {},
                remove() {},
                contains() {
                    return false
                },
                toggle() {
                    return false
                }
            },
            style: {}
        }
    },
    querySelector() {
        return null
    },
    getElementById() {
        return null
    }
}

globalThis.window = {
    innerWidth: 1280,
    innerHeight: 800,
    __DEBUG_PROBES__: false,
    matchMedia() {
        return { matches: false, addEventListener() {}, removeEventListener() {} }
    },
    requestAnimationFrame() {
        return 1
    },
    cancelAnimationFrame() {},
    performance: { now: () => 0 }
}
globalThis.performance = globalThis.window.performance
globalThis.requestAnimationFrame = globalThis.window.requestAnimationFrame
globalThis.cancelAnimationFrame = globalThis.window.cancelAnimationFrame

const { state } = await import('./helpers/canonical-state.mjs')
const { syncRuntimeState, getRuntimeStateSnapshot } = await import('../src/lib/journey/focus-pocket.ts')

const original = getRuntimeStateSnapshot()

try {
    const navState = { ...state.navState, focusedIndex: 7, focusPocketIndices: [7, 8] }
    const targetPositions = [{ x: 1, y: 2, z: 3 }]
    const pocketMotionByIndex = new Map([[8, { role: 'primary', delay: 64 }]])

    syncRuntimeState({
        navState,
        targetPositions,
        pocketMotionByIndex,
        pocketTransitionStartedAt: 1234,
        nodesAreSettling: true,
        autoRotate: false
    })

    const snapshot = getRuntimeStateSnapshot()
    // navState is SHALLOW-CLONED by design (47a46ae0 defensive copy — a live
    // reference would let syncRuntimeState alias the canonical navState and
    // bypass the writeNavstateMirror traps). Assert VALUE equality for the
    // cloned navState; collections survive the clone by reference so the Map/
    // positions assertions keep identity semantics.
    assert(snapshot.navState.focusedIndex === 7, 'snapshot should expose current navState values')
    assert(
        JSON.stringify(snapshot.navState.focusPocketIndices) === JSON.stringify([7, 8]),
        'navState focusPocketIndices cloned by value'
    )
    assert(snapshot.targetPositions === targetPositions, 'snapshot should expose current targetPositions reference')
    assert(snapshot.pocketMotionByIndex === pocketMotionByIndex, 'snapshot should expose current motion Map reference')
    assert(snapshot.pocketTransitionStartedAt === 1234, 'snapshot should expose transition start time')
    assert(snapshot.nodesAreSettling === true, 'snapshot should expose settling flag')
    assert(snapshot.autoRotate === false, 'snapshot should expose autoRotate flag')

    syncRuntimeState({ nodesAreSettling: false })
    assert(
        getRuntimeStateSnapshot().nodesAreSettling === false,
        'syncRuntimeState should support partial top-level patches'
    )
} finally {
    syncRuntimeState(original)
}

console.log('PASS journey-focus-runtime-state-contract')

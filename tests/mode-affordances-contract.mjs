#!/usr/bin/env node
/**
 * tests/mode-affordances-contract.mjs
 *
 * Node contract for src/lib/navigation/mode-affordances.ts — the shared
 * selection-lock helpers (SELECTION_DEPENDENT_MODES + isModeLocked) used by
 * the Header mode-nav and @lib/ui/mode-bindings.ts.
 *
 * Pure JS, no DOM, no WebGL. Runs in plain Node.
 *
 * NOTE: SELECTION_DEPENDENT_MODES is a `Set<string>` in the source (NOT a
 * tuple/array), so the test treats it as a Set. Expected membership is
 * derived verbatim from the source: ['trail', 'focus', 'inside'].
 *
 * The lock rule (from the source, which is authoritative):
 *   isModeLocked(modeId, hasSelection) ===
 *     SELECTION_DEPENDENT_MODES.has(modeId) && !hasSelection
 */

import { register } from 'node:module'

const tsResolve = new URL('./helpers/ts-resolve-loader.mjs', import.meta.url)
register(tsResolve, import.meta.url)

// ── Helpers ──────────────────────────────────────────────────────────────────

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

// Deep-equal for a sorted array of strings (Set membership comparison).
function assertSetMembersEqual(actualSet, expectedArr, msg) {
    assert(actualSet instanceof Set, `${msg} — expected a Set`)
    const actual = Array.from(actualSet).sort()
    const expected = [...expectedArr].sort()
    assert(
        actual.length === expected.length &&
            actual.every((v, i) => v === expected[i]),
        `${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    )
}

// ── Tests ────────────────────────────────────────────────────────────────────

async function testSelectionDependentModesContents() {
    console.log('\n[TEST] SELECTION_DEPENDENT_MODES contents')

    const { SELECTION_DEPENDENT_MODES } = await import(
        '../src/lib/navigation/mode-affordances.ts'
    )

    assert(SELECTION_DEPENDENT_MODES instanceof Set, 'should be a Set')
    assertSetMembersEqual(
        SELECTION_DEPENDENT_MODES,
        ['trail', 'focus', 'inside'],
        'SELECTION_DEPENDENT_MODES membership'
    )
    // Every member is a string.
    for (const m of SELECTION_DEPENDENT_MODES) {
        assert(typeof m === 'string', `member ${JSON.stringify(m)} must be a string`)
    }

    console.log('  OK exactly {trail, focus, inside}, all members strings')
}

async function testSelectionDependentLockWithoutSelection() {
    console.log('\n[TEST] selection-dependent modes lock when no selection')

    const { isModeLocked, SELECTION_DEPENDENT_MODES } = await import(
        '../src/lib/navigation/mode-affordances.ts'
    )

    for (const mode of SELECTION_DEPENDENT_MODES) {
        assert(
            isModeLocked(mode, false) === true,
            `isModeLocked(${JSON.stringify(mode)}, false) should be true`
        )
    }

    console.log('  OK trail/focus/inside all lock with hasSelection=false')
}

async function testSelectionDependentUnlockWithSelection() {
    console.log('\n[TEST] selection-dependent modes unlock with a selection')

    const { isModeLocked, SELECTION_DEPENDENT_MODES } = await import(
        '../src/lib/navigation/mode-affordances.ts'
    )

    for (const mode of SELECTION_DEPENDENT_MODES) {
        assert(
            isModeLocked(mode, true) === false,
            `isModeLocked(${JSON.stringify(mode)}, true) should be false`
        )
    }

    console.log('  OK trail/focus/inside all unlock with hasSelection=true')
}

async function testNonSelectionDependentNeverLock() {
    console.log('\n[TEST] non-selection-dependent modes never lock')

    const { isModeLocked } = await import('../src/lib/navigation/mode-affordances.ts')

    // 'overview', 'map', 'search' are NOT in SELECTION_DEPENDENT_MODES.
    for (const mode of ['overview', 'map', 'search']) {
        assert(
            isModeLocked(mode, false) === false,
            `isModeLocked(${JSON.stringify(mode)}, false) should be false`
        )
        assert(
            isModeLocked(mode, true) === false,
            `isModeLocked(${JSON.stringify(mode)}, true) should be false`
        )
    }

    console.log('  OK overview/map/search never lock (regardless of selection)')
}

async function testUnknownModeNotGated() {
    console.log('\n[TEST] unknown mode id is not gated')

    const { isModeLocked } = await import('../src/lib/navigation/mode-affordances.ts')

    assert(
        isModeLocked('nonexistent-mode', true) === false,
        'unknown mode with selection should not be locked'
    )
    assert(
        isModeLocked('nonexistent-mode', false) === false,
        'unknown mode without selection should not be locked'
    )

    console.log('  OK unknown mode never locks')
}

async function testImmutability() {
    console.log('\n[TEST] SELECTION_DEPENDENT_MODES not mutated by isModeLocked')

    const { isModeLocked, SELECTION_DEPENDENT_MODES } = await import(
        '../src/lib/navigation/mode-affordances.ts'
    )

    // Snapshot membership + size before exercising isModeLocked across many
    // args (including the selection-dependent modes and an unknown id).
    const before = Array.from(SELECTION_DEPENDENT_MODES).sort()
    const beforeSize = SELECTION_DEPENDENT_MODES.size

    for (const mode of ['trail', 'focus', 'inside', 'overview', 'map', 'search', 'nonexistent-mode']) {
        isModeLocked(mode, false)
        isModeLocked(mode, true)
    }

    const after = Array.from(SELECTION_DEPENDENT_MODES).sort()
    const afterSize = SELECTION_DEPENDENT_MODES.size

    assert(afterSize === beforeSize, 'set size must be unchanged after isModeLocked calls')
    assert(
        before.length === after.length && before.every((v, i) => v === after[i]),
        `set membership must be unchanged — before ${JSON.stringify(before)}, after ${JSON.stringify(after)}`
    )

    // The source builds a plain `new Set(...)` (not frozen), so we do NOT assert
    // Object.isFrozen. The real invariant is that isModeLocked is a pure reader:
    // it only calls .has() and never adds/removes. That is what we lock here.
    console.log('  OK isModeLocked leaves SELECTION_DEPENDENT_MODES unmutated')
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const tests = [
        testSelectionDependentModesContents,
        testSelectionDependentLockWithoutSelection,
        testSelectionDependentUnlockWithSelection,
        testNonSelectionDependentNeverLock,
        testUnknownModeNotGated,
        testImmutability
    ]

    let passed = 0
    let failed = 0

    for (const test of tests) {
        try {
            await test()
            passed++
        } catch (err) {
            console.error(`  ${err.message}`)
            failed++
        }
    }

    console.log(`\n${'─'.repeat(50)}`)
    console.log(`  ${passed} passed, ${failed} failed`)
    if (failed > 0) process.exit(1)
}

main().catch((err) => {
    console.error('FATAL:', err)
    process.exit(1)
})

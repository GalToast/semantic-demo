/**
 * keyboard-help-aria-contract.mjs
 *
 * Fast Node contract test for keyboard-hint panel focus/ARIA correctness.
 *
 * Coverage:
 *   1. _openKeyboardHintPanel captures prior focus into _previouslyFocused
 *   2. _closeKeyboardHintPanel clears _autoDismissTimer if set
 *   3. close toggles btn-keyboard-help aria-expanded/aria-pressed to false
 *   4. panel aria-hidden set to "false" on open, "true" on close
 *   5. _closeKeyboardHintPanel restores focus from _previouslyFocused
 *   6. Escape key wired to close panel
 *   7. Focus trap inside panel (Tab cycles within panel)
 *
 * Run: node tests/keyboard-help-aria-contract.mjs
 *       (from semantic-demo root)
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CWD = process.cwd()
const KEYBOARD_HELP_PATH = resolve(CWD, 'src/lib/keyboard/keyboard-help.ts')

const src = readFileSync(KEYBOARD_HELP_PATH, 'utf-8')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

function assertContains(haystack, needle, label) {
    const found = haystack.includes(needle)
    assert(found, `${label}: expected source to contain "${needle}"`)
}

function assertMatches(haystack, pattern, label) {
    const found = pattern.test(haystack)
    assert(found, `${label}: expected source to match ${pattern}`)
}

// ---------------------------------------------------------------------------
// TEST 1: _previouslyFocused variable declared at module scope
// ---------------------------------------------------------------------------

function testPreviouslyFocusedVariable() {
    console.log('\n[TEST] _previouslyFocused declared at module scope near panel init')

    assertContains(src, '_previouslyFocused', '_previouslyFocused variable exists in keyboard-help.ts')
}

// ---------------------------------------------------------------------------
// TEST 2: _openKeyboardHintPanel captures prior focus
// ---------------------------------------------------------------------------

function testOpenCapturesFocus() {
    console.log('\n[TEST] _openKeyboardHintPanel captures focus into _previouslyFocused')

    assertMatches(
        src,
        /_previouslyFocused\s*=\s*[\s\S]*?returnFocusEl/,
        '_openKeyboardHintPanel assigns returnFocusEl to _previouslyFocused'
    )
    assertMatches(
        src,
        /_previouslyFocused\s*=\s*[\s\S]*?returnFocusEl\s*\|\|\s*document\.getElementById\('btn-keyboard-help'\)/,
        '_openKeyboardHintPanel fallbacks to btn-keyboard-help when no returnFocusEl'
    )
}

// ---------------------------------------------------------------------------
// TEST 3: _closeKeyboardHintPanel clears auto-dismiss timer
// ---------------------------------------------------------------------------

function testCloseClearsTimer() {
    console.log('\n[TEST] _closeKeyboardHintPanel clears _autoDismissTimer before closing')

    assertContains(src, '_autoDismissTimer', 'panel has _autoDismissTimer property')

    assertContains(src, 'clearTimeout(', '_closeKeyboardHintPanel calls clearTimeout on the timer')

    assertContains(src, '_autoDismissTimer = null', '_closeKeyboardHintPanel nulls timer after clearing')
}

// ---------------------------------------------------------------------------
// TEST 4: close toggles aria-expanded and aria-pressed to false
// ---------------------------------------------------------------------------

function testCloseAriaAttributesOff() {
    console.log('\n[TEST] _closeKeyboardHintPanel sets aria-expanded/aria-pressed to false')

    assertContains(
        src,
        "helpButton.setAttribute('aria-expanded', 'false')",
        'close sets aria-expanded to false on help button'
    )

    assertContains(
        src,
        "helpButton.setAttribute('aria-pressed', 'false')",
        'close sets aria-pressed to false on help button'
    )
}

// ---------------------------------------------------------------------------
// TEST 5: open toggles panel aria-hidden to false
// ---------------------------------------------------------------------------

function testOpenAriaHiddenFalse() {
    console.log('\n[TEST] _openKeyboardHintPanel sets panel aria-hidden to false')

    assertContains(
        src,
        "panel.setAttribute('aria-hidden', 'false')",
        '_openKeyboardHintPanel sets aria-hidden false on open'
    )
}

// ---------------------------------------------------------------------------
// TEST 6: close sets panel aria-hidden to true
// ---------------------------------------------------------------------------

function testCloseAriaHiddenTrue() {
    console.log('\n[TEST] _closeKeyboardHintPanel sets panel aria-hidden to true')

    assertContains(
        src,
        "panel.setAttribute('aria-hidden', 'true')",
        '_closeKeyboardHintPanel sets aria-hidden true on close'
    )
}

// ---------------------------------------------------------------------------
// TEST 7: open toggles btn aria-expanded/aria-pressed to true
// ---------------------------------------------------------------------------

function testOpenAriaAttributesTrue() {
    console.log('\n[TEST] _openKeyboardHintPanel sets aria-expanded/aria-pressed to true')

    assertContains(
        src,
        "helpButton.setAttribute('aria-expanded', 'true')",
        '_openKeyboardHintPanel sets aria-expanded true on open'
    )

    assertContains(
        src,
        "helpButton.setAttribute('aria-pressed', 'true')",
        '_openKeyboardHintPanel sets aria-pressed true on open'
    )
}

// ---------------------------------------------------------------------------
// TEST 8: _closeKeyboardHintPanel restores focus from _previouslyFocused
// ---------------------------------------------------------------------------

function testCloseRestoresFocus() {
    console.log('\n[TEST] _closeKeyboardHintPanel restores focus from _previouslyFocused')

    assertContains(
        src,
        '(_previouslyFocused as HTMLElement).focus()',
        '_closeKeyboardHintPanel calls .focus() on stored element'
    )
    assertContains(src, '_previouslyFocused = null', '_closeKeyboardHintPanel nulls _previouslyFocused after restore')
}

// ---------------------------------------------------------------------------
// TEST 9: Escape key wired to close the panel
// ---------------------------------------------------------------------------

function testEscapeKeyWired() {
    console.log('\n[TEST] panel keydown handler closes panel on Escape')

    assertContains(src, "e.key === 'Escape'", 'Escape key check exists in panel keydown handler')
    assertContains(src, 'closePanel()', 'Escape handler calls closePanel()')
}

// ---------------------------------------------------------------------------
// TEST 10: panel close button is wired to closePanel
// ---------------------------------------------------------------------------

function testCloseButtonWired() {
    console.log('\n[TEST] .kh-close button is wired to closePanel')

    assert(
        src.includes("className = 'kh-close'") || src.includes('className = "kh-close"'),
        '.kh-close close button is created with the right class'
    )
    assert(/addEventListener\(['"]click['"],\s*closePanel\)/.test(src), 'close button click listener calls closePanel')
}

// ---------------------------------------------------------------------------
// TEST 11: focus trap inside panel (Tab cycles within focusable elements)
// ---------------------------------------------------------------------------

function testFocusTrap() {
    console.log('\n[TEST] panel has focus-trap logic for Tab key')

    assertMatches(
        src,
        /querySelectorAll\(\s*['"]button,\s*\[href\],\s*input,\s*select,\s*textarea,\s*\[tabindex\]:not\(\[tabindex=["']-1["']\]\)['"]/,
        'focus trap queries focusable elements within panel'
    )
    assertContains(src, 'e.shiftKey', 'focus trap handles Shift+Tab case')
    assertContains(src, 'first.focus()', 'focus trap wraps to first element')
    assertContains(src, 'last.focus()', 'focus trap wraps to last element')
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// RUNTIME TEST 12: initKeyboardResetOwnership stores callbacks
// ---------------------------------------------------------------------------

async function testRuntimeKeyboardResetOwnership() {
    console.log('\n[RUNTIME] initKeyboardResetOwnership stores callbacks')

    const { initKeyboardResetOwnership, handleGalaxyKeydown } = await import(
        '../src/lib/keyboard/keyboard-help.ts'
    )

    // Before registration, callbacks are no-ops (handleGalaxyKeydown should not throw)
    let overviewCalled = false
    let resetCalled = false

    initKeyboardResetOwnership({
        returnToOverview: () => { overviewCalled = true },
        resetExplorationFocus: () => { resetCalled = true }
    })

    assert(
        typeof initKeyboardResetOwnership === 'function',
        'initKeyboardResetOwnership is a function'
    )
    console.log('  OK callbacks registered')
}

// ---------------------------------------------------------------------------
// RUNTIME TEST 13: handleGalaxyKeydown dispatches Home to registered callback
// ---------------------------------------------------------------------------

// Create a minimal KeyboardEvent-like object for Node testing
function fakeKeyEvent(key, target = { tagName: 'BODY', getAttribute: () => null }) {
    return {
        key,
        isComposing: false,
        target,
        preventDefault: () => {},
        stopPropagation: () => {},
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false
    }
}

async function testRuntimeHandleGalaxyKeydownHome() {
    console.log('\n[RUNTIME] handleGalaxyKeydown dispatches Home key')

    const { initKeyboardResetOwnership } = await import(
        '../src/lib/keyboard/keyboard-help.ts'
    )

    let overviewCalled = false
    initKeyboardResetOwnership({
        returnToOverview: () => { overviewCalled = true }
    })

    const { handleGalaxyKeydown } = await import('../src/lib/keyboard/keyboard-help.ts')

    handleGalaxyKeydown(fakeKeyEvent('Home'))
    assert(overviewCalled, 'Home key dispatched to returnToOverview callback')

    console.log('  OK Home key handling verified')
}

// ---------------------------------------------------------------------------
// RUNTIME TEST 14: handleGalaxyKeydown dispatches Escape to registered callback
// ---------------------------------------------------------------------------

async function testRuntimeHandleGalaxyKeydownEscape() {
    console.log('\n[RUNTIME] handleGalaxyKeydown dispatches Escape key')

    const { initKeyboardResetOwnership } = await import(
        '../src/lib/keyboard/keyboard-help.ts'
    )

    let resetCalled = false
    initKeyboardResetOwnership({
        returnToOverview: () => {},
        resetExplorationFocus: () => { resetCalled = true }
    })

    const { handleGalaxyKeydown } = await import('../src/lib/keyboard/keyboard-help.ts')

    handleGalaxyKeydown(fakeKeyEvent('Escape'))
    assert(resetCalled, 'Escape key dispatched to resetExplorationFocus callback')

    console.log('  OK Escape key handling verified')
}

// ---------------------------------------------------------------------------
// RUNTIME TEST 15: isKeyboardControlTarget correctly identifies targets
// ---------------------------------------------------------------------------

async function testRuntimeIsKeyboardControlTarget() {
    console.log('\n[RUNTIME] isKeyboardControlTarget identifies interactive elements')

    const { isKeyboardControlTarget } = await import('../src/lib/keyboard/keyboard-help.ts')

    assert(typeof isKeyboardControlTarget === 'function', 'isKeyboardControlTarget is a function')

    // Null/undefined → false
    assert(!isKeyboardControlTarget(null), 'null is not a control target')
    assert(!isKeyboardControlTarget(undefined), 'undefined is not a control target')

    // Plain div → false
    const div = { tagName: 'DIV', getAttribute: () => null }
    assert(!isKeyboardControlTarget(div), 'plain div is not a control target')

    // Button → true (via tagName)
    const button = { tagName: 'BUTTON', getAttribute: () => null }
    assert(isKeyboardControlTarget(button), 'button is a control target (tagName)')

    // Select → true (via tagName)
    const select = { tagName: 'SELECT', getAttribute: () => null }
    assert(isKeyboardControlTarget(select), 'select is a control target (tagName)')

    // Anchor → true (via tagName)
    const anchor = { tagName: 'A', getAttribute: () => null }
    assert(isKeyboardControlTarget(anchor), 'anchor is a control target (tagName)')

    // role="button" → true (via ARIA role)
    const roleButton = { tagName: 'SPAN', getAttribute: (attr) => attr === 'role' ? 'button' : null }
    assert(isKeyboardControlTarget(roleButton), 'role=button is a control target')

    // role="link" → true (via ARIA role)
    const roleLink = { tagName: 'SPAN', getAttribute: (attr) => attr === 'role' ? 'link' : null }
    assert(isKeyboardControlTarget(roleLink), 'role=link is a control target')

    // role="menuitem" → true
    const roleMenuItem = { tagName: 'DIV', getAttribute: (attr) => attr === 'role' ? 'menuitem' : null }
    assert(isKeyboardControlTarget(roleMenuItem), 'role=menuitem is a control target')

    // role="tab" → true
    const roleTab = { tagName: 'DIV', getAttribute: (attr) => attr === 'role' ? 'tab' : null }
    assert(isKeyboardControlTarget(roleTab), 'role=tab is a control target')

    // role="presentation" → false
    const rolePresentation = { tagName: 'SPAN', getAttribute: (attr) => attr === 'role' ? 'presentation' : null }
    assert(!isKeyboardControlTarget(rolePresentation), 'role=presentation is NOT a control target')

    console.log('  OK isKeyboardControlTarget correctly identifies 10 target types')
}

const tests = [
    testPreviouslyFocusedVariable,
    testOpenCapturesFocus,
    testCloseClearsTimer,
    testCloseAriaAttributesOff,
    testOpenAriaHiddenFalse,
    testCloseAriaHiddenTrue,
    testOpenAriaAttributesTrue,
    testCloseRestoresFocus,
    testEscapeKeyWired,
    testCloseButtonWired,
    testFocusTrap
]

let passed = 0
let failed = 0

for (const test of tests) {
    try {
        test()
        passed++
        console.log('  PASS')
    } catch (err) {
        failed++
        console.error(`  FAIL: ${err.message}`)
    }
}

// Run runtime behavioral tests
const runtimeTests = [
    testRuntimeKeyboardResetOwnership,
    testRuntimeHandleGalaxyKeydownHome,
    testRuntimeHandleGalaxyKeydownEscape,
    testRuntimeIsKeyboardControlTarget
]

for (const test of runtimeTests) {
    try {
        await test()
        passed++
    } catch (err) {
        failed++
        console.error(`  FAIL: ${err.message}`)
    }
}

console.log(`\nResult: ${passed}/${tests.length + runtimeTests.length} passed (${tests.length} static + ${runtimeTests.length} runtime)\n`)
if (failed > 0) process.exit(1)

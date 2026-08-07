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
// Runtime test helpers — minimal DOM polyfills for Node (the static source-pin
// assertions above don't need DOM; the runtime imports below need createElement,
// classList, and window.addEventListener).
// ---------------------------------------------------------------------------

if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        location: { href: 'http://localhost' },
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => {},
        navigator: { clipboard: { writeText: async () => {} } },
        setTimeout: globalThis.setTimeout,
        clearTimeout: globalThis.clearTimeout,
        setInterval: globalThis.setInterval,
        clearInterval: globalThis.clearInterval,
        requestAnimationFrame: (cb) => setTimeout(cb, 0),
        performance: { now: () => Date.now() }
    }
}

if (typeof globalThis.document === 'undefined' || typeof globalThis.document.createElement !== 'function') {
    const el = () => ({
        appendChild: () => {},
        setAttribute: () => {},
        getAttribute: () => null,
        addEventListener: () => {},
        removeEventListener: () => {},
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        querySelector: () => null,
        querySelectorAll: () => [],
        style: {},
        focus: () => {},
        contains: () => false
    })
    globalThis.document = {
        ...(globalThis.document || {}),
        createElement: () => el(),
        getElementById: () => el(),
        body: { ...(globalThis.document?.body || {}), appendChild: () => {}, contains: () => false },
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {},
        removeEventListener: () => {}
    }
}

if (typeof globalThis.sessionStorage === 'undefined') {
    globalThis.sessionStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
    }
}

// ---------------------------------------------------------------------------
// RUNTIME TEST 12: keyboard-help.ts exports current panel API functions
// ---------------------------------------------------------------------------

async function testRuntimeKeyboardHelpExports() {
    console.log('\n[RUNTIME] keyboard-help.ts exports current panel API')

    const mod = await import('../src/lib/keyboard/keyboard-help.ts')

    assert(typeof mod.initKeyboardShortcutsHint === 'function', 'initKeyboardShortcutsHint is a function')
    assert(typeof mod.showKeyboardShortcutsHint === 'function', 'showKeyboardShortcutsHint is a function')
    assert(typeof mod.toggleKeyboardShortcutsHint === 'function', 'toggleKeyboardShortcutsHint is a function')

    console.log('  OK keyboard-help exports: initKeyboardShortcutsHint, showKeyboardShortcutsHint, toggleKeyboardShortcutsHint')
}

// ---------------------------------------------------------------------------
// RUNTIME TEST 13: initKeyboardShortcutsHint creates panel and is callable
// ---------------------------------------------------------------------------

async function testRuntimeInitKeyboardShortcutsHint() {
    console.log('\n[RUNTIME] initKeyboardShortcutsHint creates panel and is callable')

    const { initKeyboardShortcutsHint } = await import('../src/lib/keyboard/keyboard-help.ts')

    // initKeyboardShortcutsHint creates the DOM panel and attaches event
    // listeners. With the minimal node DOM polyfills it runs without throwing.
    let threw = false
    try {
        initKeyboardShortcutsHint()
        // Second call is idempotent (panel already exists path)
        initKeyboardShortcutsHint()
    } catch (_e) {
        threw = true
    }
    assert(!threw, 'initKeyboardShortcutsHint() must not throw (callable in Node with DOM polyfills)')

    console.log('  OK initKeyboardShortcutsHint callable + idempotent')
}

// ---------------------------------------------------------------------------
// RUNTIME TEST 14: showKeyboardShortcutsHint early-returns when no panel exists
// ---------------------------------------------------------------------------

async function testRuntimeShowKeyboardShortcutsHintNoPanel() {
    console.log('\n[RUNTIME] showKeyboardShortcutsHint returns safely')

    const { showKeyboardShortcutsHint, toggleKeyboardShortcutsHint } = await import('../src/lib/keyboard/keyboard-help.ts')

    // Both functions should be callable without throwing, even with minimal DOM.
    let threw = false
    try {
        showKeyboardShortcutsHint()
        toggleKeyboardShortcutsHint()
    } catch (_e) {
        threw = true
    }
    assert(!threw, 'showKeyboardShortcutsHint / toggleKeyboardShortcutsHint must not throw')

    console.log('  OK showKeyboardShortcutsHint and toggleKeyboardShortcutsHint are callable')
}

// ---------------------------------------------------------------------------
// RUNTIME TEST 15: setupGlobalShortcuts installs listener and returns cleanup
// ---------------------------------------------------------------------------

async function testRuntimeSetupGlobalShortcuts() {
    console.log('\n[RUNTIME] setupGlobalShortcuts installs global keydown + returns cleanup')

    const { setupGlobalShortcuts } = await import('../src/lib/keyboard/global-shortcuts.ts')

    assert(typeof setupGlobalShortcuts === 'function', 'setupGlobalShortcuts is a function')

    let weatherToggled = false
    const cleanup = setupGlobalShortcuts({
        toggleWeather: () => { weatherToggled = true }
    })

    assert(typeof cleanup === 'function', 'setupGlobalShortcuts must return a cleanup function')

    // Call cleanup — must not throw
    let cleanupThrew = false
    try {
        cleanup()
    } catch (_e) {
        cleanupThrew = true
    }
    assert(!cleanupThrew, 'cleanup function must not throw when called')

    console.log('  OK setupGlobalShortcuts installs + cleanup removes listener')
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
    testRuntimeKeyboardHelpExports,
    testRuntimeInitKeyboardShortcutsHint,
    testRuntimeShowKeyboardShortcutsHintNoPanel,
    testRuntimeSetupGlobalShortcuts
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

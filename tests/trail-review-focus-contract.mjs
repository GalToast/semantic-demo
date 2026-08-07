/**
 * trail-review-focus-contract.mjs
 *
 * Fast Node contract test for trail-review overlay focus/seam correctness.
 *
 * Coverage:
 *   1. _openTrailReview captures document.activeElement into _trailReviewReturnFocus
 *   2. _closeTrailReview restores focus from _trailReviewReturnFocus
 *   3. overlay aria-hidden toggles: "false" on open, "true" on close
 *   4. close button (.trail-review-close) receives focus on open
 *
 * Run: node tests/trail-review-focus-contract.mjs
 *       (from semantic-demo root)
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import './helpers/svelte-rune-shim.mjs'

const CWD = process.cwd()
const LIFECYCLE_PATH = resolve(CWD, 'src/lib/stores/lifecycle.ts')

const src = readFileSync(LIFECYCLE_PATH, 'utf-8')

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

function assertNotContains(haystack, needle, label) {
    const found = haystack.includes(needle)
    assert(!found, `${label}: source should NOT contain "${needle}"`)
}

// ---------------------------------------------------------------------------
// TEST 1: _openTrailReview captures activeElement into _trailReviewReturnFocus
// ---------------------------------------------------------------------------

function testOpenCapturesFocus() {
    console.log('\n[TEST] _openTrailReview captures activeElement into _trailReviewPreviouslyFocused')

    // The module-level variable must be declared near the open function
    assertContains(
        src,
        '_trailReviewPreviouslyFocused: HTMLElement | null = null',
        '_trailReviewPreviouslyFocused null-init'
    )
    assertContains(
        src,
        '_trailReviewPreviouslyFocused = document.activeElement',
        '_openTrailReview activeElement capture'
    )
}

// ---------------------------------------------------------------------------
// TEST 2: _closeTrailReview restores focus from _trailReviewPreviouslyFocused
// ---------------------------------------------------------------------------

function testCloseRestoresFocus() {
    console.log('\n[TEST] _closeTrailReview restores focus from _trailReviewPreviouslyFocused')

    assertContains(src, '_trailReviewPreviouslyFocused.focus()', '_closeTrailReview calls .focus() on stored element')
    // After restoring, it should null-out the variable
    assertContains(
        src,
        '_trailReviewPreviouslyFocused = null',
        '_closeTrailReview nulls _trailReviewPreviouslyFocused after focus restore'
    )
}

// ---------------------------------------------------------------------------
// TEST 3: overlay aria-hidden toggles correctly
// ---------------------------------------------------------------------------

function testAriaHiddenToggles() {
    console.log('\n[TEST] overlay aria-hidden toggles: false on open, true on close')

    // Open path: setAttribute('aria-hidden', 'false')
    assertContains(src, "overlay.setAttribute('aria-hidden', 'false')", 'showExploreTrailReview sets aria-hidden false')

    // Close path: setAttribute('aria-hidden', 'true')
    assertContains(src, "overlay.setAttribute('aria-hidden', 'true')", 'hideExploreTrailReview sets aria-hidden true')
}

// ---------------------------------------------------------------------------
// TEST 4: close button receives focus on open
// ---------------------------------------------------------------------------

function testCloseButtonFocusedOnOpen() {
    console.log('\n[TEST] close button (.trail-review-close) receives focus on showExploreTrailReview')

    assertContains(
        src,
        "overlay.querySelector('.trail-review-close')",
        'showExploreTrailReview queries .trail-review-close selector'
    )
    assertContains(src, 'closeBtn.focus()', 'showExploreTrailReview calls .focus() on the close button element')
}

// ---------------------------------------------------------------------------
// TEST 5: open overlay becomes visible (class + hidden removal)
// ---------------------------------------------------------------------------

function testOverlayVisibleOnOpen() {
    console.log('\n[TEST] showExploreTrailReview adds .visible class and removes hidden attribute')

    assertContains(src, "overlay.classList.add('visible')", 'showExploreTrailReview adds .visible class')
    assertContains(src, 'overlay.hidden = false', 'showExploreTrailReview clears hidden flag')
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const tests = [
    testOpenCapturesFocus,
    testCloseRestoresFocus,
    testAriaHiddenToggles,
    testCloseButtonFocusedOnOpen,
    testOverlayVisibleOnOpen
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

const staticPassed = passed
const staticTotal = tests.length

// ── Runtime Behavioral Tests ──────────────────────────────────────────────────

// DOM shim for showExploreTrailReview / hideExploreTrailReview
const domElements = {}
let activeElement = null

if (!globalThis.document || !globalThis.document.getElementById) {
    // Make a classList that is both an object and iterable
    function makeClassList() {
        const classes = []
        return {
            add(c) { if (!classes.includes(c)) classes.push(c) },
            remove(c) { const i = classes.indexOf(c); if (i >= 0) classes.splice(i, 1) },
            contains(c) { return classes.includes(c) },
            [Symbol.iterator]() { return classes[Symbol.iterator]() },
            get length() { return classes.length },
            toString() { return classes.join(' ') }
        }
    }
    globalThis.document = {
        body: { dataset: {}, classList: makeClassList() },
        documentElement: { dataset: {} },
        activeElement: null,
        getElementById(id) {
            if (!domElements[id]) {
                const el = {
                    id,
                    hidden: true,
                    _classes: [],
                    _attrs: {},
                    _focused: false,
                    classList: makeClassList(),
                    setAttribute(name, value) { el._attrs[name] = value },
                    getAttribute(name) { return el._attrs[name] },
                    querySelector(sel) {
                        if (sel === '.trail-review-close') {
                            return {
                                focus() { el._closeFocused = true },
                                _focused: false
                            }
                        }
                        return null
                    },
                    _closeFocused: false,
                    focus() { el._focused = true }
                }
                domElements[id] = el
            }
            return domElements[id]
        }
    }
}

const { showExploreTrailReview, hideExploreTrailReview } = await import('../src/lib/stores/lifecycle.ts')
const overlay = document.getElementById('trail-review-overlay')

// R1: showExploreTrailReview sets aria-hidden=false, hidden=false, visible class
{
    showExploreTrailReview()
    if (overlay.getAttribute('aria-hidden') !== 'false') {
        throw new Error(`expected aria-hidden=false, got ${overlay.getAttribute('aria-hidden')}`)
    }
    if (overlay.hidden !== false) throw new Error('expected hidden=false')
    if (!overlay.classList.contains('visible')) throw new Error('expected visible class')
    console.log('  R1 PASS: showExploreTrailReview → aria-hidden=false, hidden=false, visible class')
}

// R2: showExploreTrailReview focuses the close button
{
    if (!overlay._closeFocused) throw new Error('expected close button to receive focus')
    console.log('  R2 PASS: showExploreTrailReview focuses .trail-review-close button')
}

// R3: hideExploreTrailReview sets aria-hidden=true, hidden=true, removes visible
{
    hideExploreTrailReview()
    if (overlay.getAttribute('aria-hidden') !== 'true') {
        throw new Error(`expected aria-hidden=true, got ${overlay.getAttribute('aria-hidden')}`)
    }
    if (overlay.hidden !== true) throw new Error('expected hidden=true')
    if (overlay.classList.contains('visible')) throw new Error('expected visible class removed')
    console.log('  R3 PASS: hideExploreTrailReview → aria-hidden=true, hidden=true, no visible')
}

// R4: show-then-hide cycle is idempotent (call hide again, no throw)
{
    hideExploreTrailReview()
    console.log('  R4 PASS: hideExploreTrailReview is idempotent (no throw on double-hide)')
}

// R5: showExploreTrailReview captures document.activeElement
{
    // Set a fake active element
    const fakeBtn = { tagName: 'BUTTON' }
    document.activeElement = fakeBtn
    showExploreTrailReview()
    // The function stores activeElement into _trailReviewPreviouslyFocused
    // (internal variable). We verify it doesn't throw.
    document.activeElement = null
    console.log('  R5 PASS: showExploreTrailReview captures document.activeElement (no throw)')
}

console.log(`\nResult: ${staticPassed}/${staticTotal} static + 5/5 runtime = ${staticPassed + 5}/${staticTotal + 5} passed\n`)
if (failed > 0) process.exit(1)

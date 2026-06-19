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

console.log(`\nResult: ${passed}/${tests.length} passed\n`)
if (failed > 0) process.exit(1)

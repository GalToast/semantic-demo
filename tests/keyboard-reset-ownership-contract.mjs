/**
 * keyboard-reset-ownership-contract.mjs
 *
 * Fast Node contract test for keyboard reset ownership injection.
 * Verifies the lifecycle <-> keyboard-help cycle is broken via
 * initKeyboardResetOwnership dependency injection.
 *
 * Coverage:
 *   1. keyboard-help.js does NOT import lifecycle.js
 *   2. initKeyboardResetOwnership is exported from keyboard-help.js
 *   3. lifecycle.js calls initKeyboardResetOwnership before wiring keyboard handler
 *   4. _returnToOverview and _resetExplorationFocus are module-scoped vars in keyboard-help.js
 *   5. handleGalaxyKeydown calls _returnToOverview and _resetExplorationFocus (not window)
 *   6. Window fallback is still available when initKeyboardResetOwnership not called
 *
 * Run: node tests/keyboard-reset-ownership-contract.mjs
 *       (from semantic-demo root)
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CWD = process.cwd();
const KEYBOARD_HELP_PATH = resolve(CWD, 'js/modules/keyboard-help.js');
const LIFECYCLE_PATH = resolve(CWD, 'js/modules/lifecycle.js');

const keyboardHelpSrc = readFileSync(KEYBOARD_HELP_PATH, 'utf-8');
const lifecycleSrc = readFileSync(LIFECYCLE_PATH, 'utf-8');

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertContains(haystack, needle, label) {
    const found = haystack.includes(needle);
    assert(found, `${label}: expected source to contain "${needle}"`);
}

function assertNotContains(haystack, needle, label) {
    const found = haystack.includes(needle);
    assert(!found, `${label}: expected source NOT to contain "${needle}"`);
}

// ---------------------------------------------------------------------------
// TEST 1: keyboard-help.js does NOT import lifecycle.js
// ---------------------------------------------------------------------------
function testNoLifecycleImport() {
    console.log('\n[TEST] keyboard-help.js does NOT import lifecycle.js');

    // The old import line must not exist
    assertNotContains(
        keyboardHelpSrc,
        "import { returnToOverview, resetExplorationFocus } from './lifecycle.js';",
        'Old lifecycle import removed'
    );

    // Verify no bare import of lifecycle at all
    assertNotContains(
        keyboardHelpSrc,
        "from './lifecycle.js'",
        'keyboard-help.js must not import lifecycle.js'
    );

    console.log('  PASS — keyboard-help.js has no lifecycle import');
}

// ---------------------------------------------------------------------------
// TEST 2: initKeyboardResetOwnership is exported from keyboard-help.js
// ---------------------------------------------------------------------------
function testInitExportExists() {
    console.log('\n[TEST] initKeyboardResetOwnership exported from keyboard-help.js');

    assertContains(
        keyboardHelpSrc,
        'export function initKeyboardResetOwnership',
        'initKeyboardResetOwnership is exported'
    );

    console.log('  PASS — initKeyboardResetOwnership export confirmed');
}

// ---------------------------------------------------------------------------
// TEST 3: keyboard-help.js has _returnToOverview and _resetExplorationFocus module vars
// ---------------------------------------------------------------------------
function testModuleVarsExist() {
    console.log('\n[TEST] keyboard-help.js has _returnToOverview and _resetExplorationFocus vars');

    assertContains(
        keyboardHelpSrc,
        'let _returnToOverview = () =>',
        '_returnToOverview module variable declared'
    );
    assertContains(
        keyboardHelpSrc,
        'let _resetExplorationFocus = () =>',
        '_resetExplorationFocus module variable declared'
    );

    console.log('  PASS — module-scoped reset vars confirmed');
}

// ---------------------------------------------------------------------------
// TEST 4: handleGalaxyKeydown calls _returnToOverview and _resetExplorationFocus
// ---------------------------------------------------------------------------
function testHandleGalaxyCallsInjectedFns() {
    console.log('\n[TEST] handleGalaxyKeydown uses injected _returnToOverview/_resetExplorationFocus');

    // Must call _returnToOverview() not returnToOverview()
    assertContains(
        keyboardHelpSrc,
        '_returnToOverview();',
        'Esc path calls _returnToOverview() not returnToOverview()'
    );

    // Must call _resetExplorationFocus() not resetExplorationFocus()
    assertContains(
        keyboardHelpSrc,
        '_resetExplorationFocus();',
        'Home path calls _resetExplorationFocus() not resetExplorationFocus()'
    );

    // The old bare returnToOverview() call must not appear in handleGalaxyKeydown
    const handleStart = keyboardHelpSrc.indexOf('export function handleGalaxyKeydown');
    assert(handleStart >= 0, 'handleGalaxyKeydown export must exist');
    const khSection = keyboardHelpSrc.substring(handleStart);
    assert(
        !khSection.includes('returnToOverview()') || khSection.includes('_returnToOverview()'),
        'handleGalaxyKeydown must not call bare returnToOverview()'
    );
    assert(
        !khSection.includes('resetExplorationFocus()') || khSection.includes('_resetExplorationFocus()'),
        'handleGalaxyKeydown must not call bare resetExplorationFocus()'
    );

    console.log('  PASS — handleGalaxyKeydown uses injected function refs');
}

// ---------------------------------------------------------------------------
// TEST 5: lifecycle.js imports initKeyboardResetOwnership from keyboard-help.js
// ---------------------------------------------------------------------------
function testLifecycleImportsInjectionFn() {
    console.log('\n[TEST] lifecycle.js imports initKeyboardResetOwnership from keyboard-help.js');

    assertContains(
        lifecycleSrc,
        'initKeyboardResetOwnership',
        'lifecycle.js imports initKeyboardResetOwnership'
    );

    console.log('  PASS — lifecycle.js imports initKeyboardResetOwnership');
}

// ---------------------------------------------------------------------------
// TEST 6: lifecycle.js calls initKeyboardResetOwnership before event wiring
// ---------------------------------------------------------------------------
function testLifecycleCallsInjectionFn() {
    console.log('\n[TEST] lifecycle.js calls initKeyboardResetOwnership in initEventListeners');

    const initSection = lifecycleSrc.substring(
        lifecycleSrc.indexOf('export function initEventListeners()'),
        lifecycleSrc.indexOf('// Global exposure for compatibility')
    );

    assertContains(
        initSection,
        'initKeyboardResetOwnership',
        'initKeyboardResetOwnership called in initEventListeners'
    );
    assertContains(
        initSection,
        'returnToOverview',
        'returnToOverview passed to initKeyboardResetOwnership'
    );
    assertContains(
        initSection,
        'resetExplorationFocus',
        'resetExplorationFocus passed to initKeyboardResetOwnership'
    );

    console.log('  PASS — initKeyboardResetOwnership called before event wiring');
}

// ---------------------------------------------------------------------------
// TEST 7: Window fallback exists when initKeyboardResetOwnership not called
// ---------------------------------------------------------------------------
function testWindowFallbackExists() {
    console.log('\n[TEST] keyboard-help.js window fallback preserved when injection not called');

    assertContains(
        keyboardHelpSrc,
        'typeof window.returnToOverview',
        'window fallback for returnToOverview'
    );
    assertContains(
        keyboardHelpSrc,
        'typeof window.resetExplorationFocus',
        'window fallback for resetExplorationFocus'
    );

    console.log('  PASS — window fallback preserved');
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const tests = [
    testNoLifecycleImport,
    testInitExportExists,
    testModuleVarsExist,
    testHandleGalaxyCallsInjectedFns,
    testLifecycleImportsInjectionFn,
    testLifecycleCallsInjectionFn,
    testWindowFallbackExists,
];

let passed = 0;
let failed = 0;

for (const test of tests) {
    try {
        test();
        passed++;
        console.log('  PASS');
    } catch (err) {
        failed++;
        console.error(`  FAIL: ${err.message}`);
    }
}

console.log(`\nResult: ${passed}/${tests.length} passed\n`);
if (failed > 0) process.exit(1);

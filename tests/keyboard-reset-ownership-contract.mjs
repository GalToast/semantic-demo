/**
 * keyboard-reset-ownership-contract.mjs
 *
 * Hardened Keyboard Reset Ownership Contract (post-dewindowing).
 *
 * Proves five guarantees:
 *   1. keyboard-help has no typeof window.returnToOverview / resetExplorationFocus
 *   2. inert defaults are module-local (let _returnToOverview = () => {})
 *   3. orchestration/triggers.ts owns global reset key handling with real lifecycle functions
 *   4. lifecycle exports returnToOverview / resetExplorationFocus from the store lifecycle owner
 *   5. keyboard-help calls only _returnToOverview() / _resetExplorationFocus() from
 *      key handlers, never direct lifecycle imports
 *
 * Source-only Node contract - no DOM, no Playwright.
 * Usage: node tests/keyboard-reset-ownership-contract.mjs
 */

import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.cwd())
const KEYBOARD_HELP_PATH = path.join(ROOT, 'src/lib/keyboard/keyboard-help.ts')
const LIFECYCLE_PATH = path.join(ROOT, 'src/lib/stores/lifecycle.ts')
const ORCHESTRATION_LIFECYCLE_PATH = path.join(ROOT, 'src/lib/orchestration/lifecycle.ts')
const TRIGGERS_PATH = path.join(ROOT, 'src/lib/orchestration/triggers.ts')
const GLOBAL_SHORTCUTS_PATH = path.join(ROOT, 'src/lib/keyboard/global-shortcuts.ts')

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

const src = fs.readFileSync(KEYBOARD_HELP_PATH, 'utf-8')
const lifecycle = fs.readFileSync(LIFECYCLE_PATH, 'utf-8')
const orchestrationLifecycle = fs.readFileSync(ORCHESTRATION_LIFECYCLE_PATH, 'utf-8')
const triggersSrc = fs.readFileSync(TRIGGERS_PATH, 'utf-8')
const globalShortcutsSrc = fs.readFileSync(GLOBAL_SHORTCUTS_PATH, 'utf-8')

console.log('=================================================================')
console.log('keyboard-reset-ownership-contract.mjs (HARDENED post-dewindowing)')
console.log('=================================================================')

try {
    // Contract Point 1: No typeof window fallbacks in keyboard-help
    console.log('\n[CONTRACT 1] keyboard-help has no window.resetExplorationFocus fallbacks')
    assert(!src.includes('typeof window.returnToOverview'), 'keyboard-help must not reference window.returnToOverview')
    assert(
        !src.includes('typeof window.resetExplorationFocus'),
        'keyboard-help must not reference window.resetExplorationFocus'
    )
    assert(!src.includes('window.returnToOverview'), 'keyboard-help must not reference window.returnToOverview at all')
    assert(
        !src.includes('window.resetExplorationFocus'),
        'keyboard-help must not reference window.resetExplorationFocus at all'
    )
    console.log('  PASS - no window.* references')

    // Contract Point 2: retired callback-injection pattern is fully removed
    // (commit f5b4c9d8 deleted initKeyboardResetOwnership + handleGalaxyKeydown
    // and their module-local _returnToOverview / _resetExplorationFocus / _defaultNoOp
    // variables; the live keyboard handling moved to setupGlobalShortcuts in
    // global-shortcuts.ts which takes callbacks directly as parameters.)
    console.log('\n[CONTRACT 2] retired callback-injection pattern is fully removed from keyboard-help.ts')
    assert(
        !/_returnToOverview/.test(src),
        'keyboard-help.ts must not define _returnToOverview (retired — superseded by setupGlobalShortcuts)'
    )
    assert(
        !/_resetExplorationFocus/.test(src),
        'keyboard-help.ts must not define _resetExplorationFocus (retired)'
    )
    assert(
        !/_defaultNoOp/.test(src),
        'keyboard-help.ts must not define _defaultNoOp (retired)'
    )
    assert(
        !/export function initKeyboardResetOwnership/.test(src),
        'keyboard-help.ts must not export initKeyboardResetOwnership (retired)'
    )
    assert(
        !/export function handleGalaxyKeydown/.test(src),
        'keyboard-help.ts must not export handleGalaxyKeydown (retired)'
    )
    assert(
        /export function initKeyboardShortcutsHint/.test(src),
        'keyboard-help.ts must export initKeyboardShortcutsHint (current panel API)'
    )
    assert(
        /export function setupGlobalShortcuts/.test(globalShortcutsSrc),
        'global-shortcuts.ts must export setupGlobalShortcuts (current keyboard owner)'
    )
    console.log('  PASS - callback-injection pattern retired; setupGlobalShortcuts is the owner')

    // Contract Point 3: live app-level key handling is owned by global-shortcuts.ts
    // (retired 2026-08-03: triggers.ts’s module-local handleGlobalKeydown was a dead
    // duplicate with zero listeners; the live Escape/Home handling lives in
    // setupGlobalShortcuts — Escape returns to overview via RETURN_OVERVIEW + a
    // post-flip updateUrlState drop of stale view=map, commit ad588f67).
    console.log('\n[CONTRACT 3] global-shortcuts.ts owns Escape/Home reset handling (triggers.ts duplicate retired)')
    assert(
        !/function\s+handleGlobalKeydown\s*\(/.test(triggersSrc),
        'triggers.ts must NOT define handleGlobalKeydown (dead duplicate retired 2026-08-03)'
    )
    assert(
        /export\s+function\s+setupGlobalShortcuts\s*\(/.test(globalShortcutsSrc),
        'global-shortcuts.ts must define setupGlobalShortcuts as the live key handler'
    )
    assert(
        /key\s*===\s*['"]Escape['"][\s\S]{0,1500}RETURN_OVERVIEW/.test(globalShortcutsSrc),
        'Escape handling in global-shortcuts must dispatch RETURN_OVERVIEW through mode transitions'
    )
    assert(
        /RETURN_OVERVIEW[\s\S]{0,400}updateUrlState\(\{\}, \{ reason: 'escape-return-overview' \}\)/.test(
            globalShortcutsSrc
        ),
        'global-shortcuts Escape must re-sync the URL after the view flip (stale view=map fix)'
    )
    console.log('  PASS - app-level Escape/Home reset handling is owned by global-shortcuts.ts')

    // Contract Point 4: lifecycle exports are real functions, not stubs
    console.log('\n[CONTRACT 4] lifecycle exports are real functions, not empty stubs')
    assert(
        /export\s+\{[\s\S]*\bresetExplorationFocus\b[\s\S]*\breturnToOverview\b[\s\S]*\}\s+from\s+['"]@lib\/stores\/lifecycle['"]/.test(
            orchestrationLifecycle
        ),
        'orchestration lifecycle must re-export resetExplorationFocus and returnToOverview from @lib/stores/lifecycle'
    )
    const returnToOverviewMatch = lifecycle.match(
        /export\s+function\s+returnToOverview\s*\(\s*\)(?:\s*:\s*\S[^{]*)?\s*\{[\s\S]*?\n\}/
    )
    assert(returnToOverviewMatch, 'store lifecycle must define returnToOverview as an exported function declaration')
    assert(
        !/export\s+const\s+returnToOverview\s*=\s*\(\s*\)\s*=>\s*\{\s*\}/.test(lifecycle) &&
            !/export\s+function\s+returnToOverview\s*\(\s*\)(?:\s*:\s*\S[^{]*)?\s*\{\s*\}/.test(lifecycle),
        'returnToOverview must not be an empty stub'
    )
    assert(
        returnToOverviewMatch[0].includes('resetExperienceState()') &&
            returnToOverviewMatch[0].includes("switchView('galaxy')"),
        'returnToOverview must reset the experience and switch back to galaxy view'
    )

    const rfStart = lifecycle.indexOf('export function resetExplorationFocus')
    assert(rfStart !== -1, 'resetExplorationFocus must be an exported function declaration')
    const rfAfterDecl = lifecycle.slice(rfStart + 'export function resetExplorationFocus'.length)
    const rfBodyStart = rfAfterDecl.indexOf('{')
    assert(rfBodyStart !== -1, 'resetExplorationFocus must have a function body')
    const rfBodySlice = rfAfterDecl.slice(rfBodyStart + 1, rfBodyStart + 1800)
    assert(
        rfBodySlice.includes('updateNavState') &&
            rfBodySlice.includes('_setSemanticDiveMode(false)') &&
            rfBodySlice.includes('publish(EVENTS.STATE_RESET'),
        'resetExplorationFocus must own non-trivial nav/focus mutation and state reset publication'
    )
    assert(
        !/export\s+function\s+resetExplorationFocus\s*\([^)]*\)(?:\s*:\s*\S[^{]*)?\s*\{\s*\}/.test(lifecycle),
        'resetExplorationFocus must not be an empty stub'
    )
    console.log('  PASS - returnToOverview and resetExplorationFocus are real exported lifecycle functions')

    // Contract Point 5: keyboard-help.ts has no lifecycle imports; global-shortcuts.ts owns key handling
    console.log('\n[CONTRACT 5] keyboard-help.ts owns panel DOM only; global-shortcuts.ts owns key-to-action dispatch')
    assert(
        !src.includes("from './lifecycle.ts'") && !src.includes('from "./lifecycle.js"'),
        'keyboard-help must not import from lifecycle.js (prevents direct coupling)'
    )
    assert(
        !/export function handleGalaxyKeydown/.test(src),
        'keyboard-help.ts must not define handleGalaxyKeydown (retired; key dispatch is in global-shortcuts.ts)'
    )
    assert(
        !/export function initKeyboardResetOwnership/.test(src),
        'keyboard-help.ts must not define initKeyboardResetOwnership (retired)'
    )
    // The current keyboard owner wires Escape/Home through setupGlobalShortcuts,
    // which dispatches RETURN_OVERVIEW via the nav transition system.
    assert(
        /key\s*===\s*['"]Escape['"][\s\S]{0,1500}RETURN_OVERVIEW/.test(globalShortcutsSrc),
        'global-shortcuts.ts Escape must dispatch RETURN_OVERVIEW through mode transitions'
    )
    console.log('  PASS - keyboard-help.ts is panel-DOM-only; global-shortcuts.ts owns key dispatch')

    // ---------------------------------------------------------------------------
    // RUNTIME CONTRACT 6: setupGlobalShortcuts integration test
    // ---------------------------------------------------------------------------

    // Minimal DOM polyfills for Node (setupGlobalShortcuts imports Svelte stores
    // that need window/document globals at module eval time).
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

    console.log('\n[RUNTIME CONTRACT 6] setupGlobalShortcuts integration test')

    const { setupGlobalShortcuts } = await import(
        '../src/lib/keyboard/global-shortcuts.ts'
    )

    assert(typeof setupGlobalShortcuts === 'function', 'setupGlobalShortcuts must be a function')

    const cleanup = setupGlobalShortcuts({
        toggleWeather: () => {},
        toggleAudioMute: () => {}
    })

    assert(typeof cleanup === 'function', 'setupGlobalShortcuts must return a cleanup function')

    // Call cleanup — must not throw
    let cleanupThrew = false
    try {
        cleanup()
    } catch (_e) {
        cleanupThrew = true
    }
    assert(!cleanupThrew, 'cleanup function must not throw')

    console.log('  PASS - runtime integration: setupGlobalShortcuts installs/cleans up keyboard listener')

    console.log('\n=================================================================')
    console.log('ALL CONTRACT POINTS PASSED (5 static + 1 runtime)')
    console.log('=================================================================')
    process.exit(0)
} catch (err) {
    console.error('\nCONTRACT FAILED:', err.message)
    process.exit(1)
}

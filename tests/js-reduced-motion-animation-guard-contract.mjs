/**
 * js-reduced-motion-animation-guard-contract.mjs
 *
 * Source-level contract ensuring that JS-driven continuous/loop animations
 * respect the OS-level `prefers-reduced-motion: reduce` preference.
 *
 * Rationale: CSS `@media (prefers-reduced-motion: reduce)` does not reach
 * animation state that is advanced inside `requestAnimationFrame` loops,
 * shader uniform updates, or setTimeout-driven DOM transitions. The modules
 * listed here have continuous or user-triggered motion that must be gated
 * in JS.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const ROOT = path.resolve(path.dirname(__filename), '..')

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}

function readSrc(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf-8')
}

function assertContains(source, substring, label) {
    assert(source.includes(substring), `${label}: expected to contain "${substring}"`)
}

console.log('\n[JS reduced-motion guard contract]')

// 1. Focus decoration loop: freezes time-derived pulses and stops lens rotation.
const interactionSrc = readSrc('src/lib/engine/three-interaction-visuals.ts')
assertContains(
    interactionSrc,
    "import { prefersReducedMotion } from '@lib/utils/environment'",
    'three-interaction-visuals imports prefersReducedMotion'
)
assertContains(
    interactionSrc,
    'const reducedMotion = prefersReducedMotion()',
    'three-interaction-visuals computes reducedMotion'
)
assertContains(
    interactionSrc,
    'const time = reducedMotion ? 0 : now / 1000',
    'three-interaction-visuals freezes time under reduced motion'
)
assertContains(interactionSrc, 'timeUniform.value = reducedMotion ? 0 : time', 'focus-lens time uniform is gated')
assertContains(interactionSrc, 'if (!reducedMotion) {', 'focus-lens rotation is gated')
assertContains(interactionSrc, 'state.focusLens.rotation.y += rotationSpeed', 'focus-lens rotation code remains')
console.log('  ✓ three-interaction-visuals.ts focus-lens/motes/petals/filaments frozen under reduced motion')

// 2. Point material breath: uTime only advances when motion is allowed.
// 2026-08-07: the raw `matchMedia('(prefers-reduced-motion: reduce)')` call
// was replaced with the shared `prefersReducedMotion()` helper (cached MQL in
// @lib/utils/environment). Assert the helper import + the guard on the
// computed flag rather than the literal query string.
const frameUpdatesSrc = readSrc('src/lib/engine/three-engine-frame-updates.ts')
assertContains(
    frameUpdatesSrc,
    "import { prefersReducedMotion } from '@lib/utils/environment'",
    'three-engine-frame-updates imports prefersReducedMotion helper'
)
assertContains(frameUpdatesSrc, 'uTime.value', 'three-engine-frame-updates writes uTime')
assertContains(frameUpdatesSrc, 'if (!prefersReduced)', 'three-engine-frame-updates guards uTime write')
console.log('  ✓ three-engine-frame-updates.ts point uTime uniform gated under reduced motion')

// 3. Search corridor shader pulse: uTime frozen under reduced motion.
const searchAnimSrc = readSrc('src/lib/engine/three-search-corridor-animations.ts')
assertContains(
    searchAnimSrc,
    "import { prefersReducedMotion } from '@lib/utils/environment'",
    'three-search-animations (corridor module) imports prefersReducedMotion'
)
assertContains(
    searchAnimSrc,
    'const reducedMotion = prefersReducedMotion()',
    'three-search-animations (corridor module) computes reducedMotion'
)
assertContains(
    searchAnimSrc,
    'const time = reducedMotion ? 0 : frameNow / 1000',
    'corridor uTime uniform is gated (refactored to const+assign)'
)
console.log('  ✓ three-search-animations.ts corridor uTime uniform gated under reduced motion')

// 4. Canvas click pulse: suppressed under reduced motion.
const canvasInteractionSrc = readSrc('src/lib/journey/canvas-interaction.ts')
assertContains(
    canvasInteractionSrc,
    "import { prefersReducedMotion } from '@lib/utils/environment'",
    'canvas-interaction imports prefersReducedMotion'
)
assertContains(
    canvasInteractionSrc,
    'if (prefersReducedMotion()) return',
    'showClickPulse suppresses animation under reduced motion'
)
console.log('  ✓ canvas-interaction.ts click pulse suppressed under reduced motion')

// 5. Selected-card fade: duration collapsed to 0ms under reduced motion.
const stageRendererSrc = readSrc('src/lib/focus/stage-renderer.ts')
assertContains(stageRendererSrc, 'prefersReducedMotion', 'stage-renderer imports/checks prefersReducedMotion')
assertContains(
    stageRendererSrc,
    "cardEl.style.setProperty('--selected-card-fade-ms', '0ms')",
    'triggerSelectedCardFade collapses duration under reduced motion'
)
console.log('  ✓ stage-renderer.ts selected-card fade suppressed under reduced motion')

// 6. Search result scrolls: smooth scrollIntoView collapses to 'auto' under reduced motion.
const searchResultsSrc = readSrc('src/components/SearchResults.svelte')
assertContains(
    searchResultsSrc,
    "import { prefersReducedMotion } from '@lib/utils/environment'",
    'SearchResults imports prefersReducedMotion'
)
assertContains(
    searchResultsSrc,
    "firstNewItem.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' })",
    'SearchResults Show more scroll respects reduced motion'
)
console.log('  ✓ SearchResults.svelte Show more scroll gated under reduced motion')

const resultRendererSrc = readSrc('src/lib/search/result-renderer.ts')
assertContains(
    resultRendererSrc,
    "import { getViewportSize, prefersReducedMotion } from '../utils/environment'",
    'result-renderer imports prefersReducedMotion'
)
assertContains(
    resultRendererSrc,
    "rowToReveal.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })",
    'result-renderer reveal scroll respects reduced motion'
)
console.log('  ✓ result-renderer.ts active-result reveal scroll gated under reduced motion')

// ---------------------------------------------------------------------------
// RUNTIME BEHAVIORAL TESTS — wave7b P3 hardening
// ---------------------------------------------------------------------------
// These tests verify the runtime behavior of the reduced-motion animation
// guards that the static assertions above inspect. The static pins prove the
// source patterns exist; the runtime tests prove the guard function works
// correctly and the guarded animation modules are importable and callable.
//
// Pattern: follows wave4a/wave6b — additive-preserving, all static
// assertions retained, runtime tests added at end.

let runtimePasses = 0
let runtimeFailures = 0
function runtimeAssert(condition, message) {
    if (condition) {
        runtimePasses++
        console.log(`  ✓ R${runtimePasses + runtimeFailures}: ${message}`)
    } else {
        runtimeFailures++
        console.error(`  ✗ R${runtimePasses + runtimeFailures}: ${message}`)
        throw new Error(`RUNTIME ASSERTION FAILED: ${message}`)
    }
}

console.log('\n[RUNTIME] Reduced-motion animation guard behavioral tests')

// --- R1: prefersReducedMotion SSR-safe (no window) ---
{
    const savedWindow = globalThis.window
    try {
        delete globalThis.window
        const { prefersReducedMotion } = await import('@lib/utils/environment')
        const result = prefersReducedMotion()
        runtimeAssert(result === false, `prefersReducedMotion() returns false in SSR (got: ${result})`)
    } finally {
        if (savedWindow !== undefined) globalThis.window = savedWindow
    }
}

// --- R2: prefersReducedMotion with mock matchMedia (reduce: yes) ---
{
    globalThis.window = {
        matchMedia: (query) => ({
            matches: true,
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {}
        })
    }
    const { prefersReducedMotion } = await import('@lib/utils/environment')
    const result = prefersReducedMotion()
    runtimeAssert(
        result === true,
        `prefersReducedMotion() returns true when OS prefers reduced motion (got: ${result})`
    )
}

// --- R3: prefersReducedMotion with mock matchMedia (reduce: no) ---
{
    // Replace window.matchMedia identity to trigger cache rebuild
    globalThis.window = {
        matchMedia: (query) => ({
            matches: false,
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {}
        })
    }
    const { prefersReducedMotion } = await import('@lib/utils/environment')
    const result = prefersReducedMotion()
    runtimeAssert(
        result === false,
        `MQL cache rebuild: prefersReducedMotion() returns false after matchMedia swap (got: ${result})`
    )
}

// --- R4: prefersReducedMotion canonical API surface ---
{
    const env = await import('@lib/utils/environment')
    runtimeAssert(typeof env.prefersReducedMotion === 'function', 'prefersReducedMotion is exported as a function')
    const result = env.prefersReducedMotion()
    runtimeAssert(typeof result === 'boolean', `prefersReducedMotion() returns boolean (got: ${typeof result})`)
}

// --- R5: updateInteractionVisuals importable & callable (focus-lens guard anchor) ---
// The static pins above verify the source contains the reducedMotion guard.
// This runtime test proves the guarded function is wired and callable without
// Three.js state — the early-return path handles missing WebGL context.
{
    const mod = await import('@lib/engine/three-interaction-visuals')
    runtimeAssert(typeof mod.updateInteractionVisuals === 'function', 'updateInteractionVisuals is exported')
    try {
        mod.updateInteractionVisuals()
        runtimeAssert(true, 'updateInteractionVisuals() called without throw (early-return on missing state)')
    } catch (e) {
        runtimeAssert(false, `updateInteractionVisuals() threw: ${e.message}`)
    }
}

// --- R6: updatePointsShaderHoverBoost importable & callable (uTime guard anchor) ---
// The static pins verify the source gates uTime writes behind prefersReduced.
// This runtime test proves the guarded frame-update function is wired.
{
    const mod = await import('@lib/engine/three-engine-frame-updates')
    runtimeAssert(typeof mod.updatePointsShaderHoverBoost === 'function', 'updatePointsShaderHoverBoost is exported')
    try {
        mod.updatePointsShaderHoverBoost()
        runtimeAssert(true, 'updatePointsShaderHoverBoost() called without throw (early-return on missing state)')
    } catch (e) {
        runtimeAssert(false, `updatePointsShaderHoverBoost() threw: ${e.message}`)
    }
}

// --- R7: triggerSearchCorridorAnimation importable (corridor uTime guard anchor) ---
{
    const mod = await import('@lib/engine/three-search-animations')
    runtimeAssert(
        typeof mod.triggerSearchCorridorAnimation === 'function',
        'triggerSearchCorridorAnimation is exported'
    )
    runtimeAssert(typeof mod.updateSearchCorridorAnimation === 'function', 'updateSearchCorridorAnimation is exported')
}

// --- R8: triggerSelectedCardFade importable (stage-renderer fade guard anchor) ---
{
    const mod = await import('@lib/focus/stage-renderer')
    runtimeAssert(typeof mod.triggerSelectedCardFade === 'function', 'triggerSelectedCardFade is exported')
}

// Restore clean state
if (typeof globalThis.window !== 'undefined') {
    delete globalThis.window
}

console.log(`\n[RUNTIME] ${runtimePasses} passed, ${runtimeFailures} failed`)
if (runtimeFailures > 0) {
    console.error('RUNTIME TESTS FAILED')
    process.exit(1)
}

console.log('\njs-reduced-motion-animation-guard-contract OK (21 static assertions + 8 runtime behavioral tests)')

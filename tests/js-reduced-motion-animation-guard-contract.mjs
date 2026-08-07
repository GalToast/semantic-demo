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
const searchAnimSrc = readSrc('src/lib/engine/three-search-animations.ts')
assertContains(
    searchAnimSrc,
    "import { prefersReducedMotion } from '@lib/utils/environment'",
    'three-search-animations imports prefersReducedMotion'
)
assertContains(
    searchAnimSrc,
    'const reducedMotion = prefersReducedMotion()',
    'three-search-animations computes reducedMotion'
)
assertContains(searchAnimSrc, 'uTime.value = reducedMotion ? 0 : frameNow / 1000', 'corridor uTime uniform is gated')
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
assertContains(searchResultsSrc, "import { prefersReducedMotion } from '@lib/utils/environment'", 'SearchResults imports prefersReducedMotion')
assertContains(
    searchResultsSrc,
    "firstNewItem.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' })",
    'SearchResults Show more scroll respects reduced motion'
)
console.log('  ✓ SearchResults.svelte Show more scroll gated under reduced motion')

const resultRendererSrc = readSrc('src/lib/search/result-renderer.ts')
assertContains(resultRendererSrc, "import { getViewportSize, prefersReducedMotion } from '../utils/environment'", 'result-renderer imports prefersReducedMotion')
assertContains(
    resultRendererSrc,
    "rowToReveal.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })",
    'result-renderer reveal scroll respects reduced motion'
)
console.log('  ✓ result-renderer.ts active-result reveal scroll gated under reduced motion')

console.log('\njs-reduced-motion-animation-guard-contract OK')

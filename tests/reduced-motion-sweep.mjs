/**
 * reduced-motion-sweep.mjs
 *
 * Consolidated sweep: merges reduced-motion-coverage-contract.mjs +
 * js-reduced-motion-animation-guard-contract.mjs (W2 Phase 3+4). Checks
 * reduced-motion at two layers: CSS @keyframes scan + JS RAF loop guards.
 *
 * Sweep sources (loc before/after):
 *   tests/reduced-motion-coverage-contract.mjs                  194 LOC
 *   tests/js-reduced-motion-animation-guard-contract.mjs       282 LOC
 *   Total originals: 476 LOC → ~320 LOC in this sweep
 *
 * Pass-fail criterion: exit 0 = no violations; exit 1 + error messages = fail.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const ROOT = path.resolve(path.dirname(__filename), '..')
const COMPONENTS_DIR = path.join(ROOT, 'src', 'components')
const CSS_DIR = path.join(ROOT, 'css')

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}

function* walkFiles(dir, ext) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            yield* walkFiles(fullPath, ext)
        } else if (entry.isFile() && entry.name.endsWith(ext)) {
            yield fullPath
        }
    }
}

// ─── Sweep Part 1: reduced-motion-coverage (CSS @keyframes + runtime tests) ───

const ALLOWLIST = new Set([
    // css/strands.css defines keyframes consumed by other modules; it contains
    // no animation declarations of its own.
])

const cssOffenders = []
for (const file of walkFiles(CSS_DIR, '.css')) {
    const relative = path.relative(ROOT, file).replace(/\\/g, '/')
    const source = fs.readFileSync(file, 'utf-8')
    if (!source.includes('@keyframes')) continue
    if (ALLOWLIST.has(relative)) continue
    const consumesAnimations = /[\s;:{}]animation\s*:/.test(source)
    if (!consumesAnimations) continue
    const hasReducedMotion = source.includes('@media (prefers-reduced-motion')
    if (!hasReducedMotion) {
        cssOffenders.push(relative)
    }
}

const svelteOffenders = []
for (const file of walkFiles(COMPONENTS_DIR, '.svelte')) {
    const relative = path.relative(ROOT, file).replace(/\\/g, '/')
    const source = fs.readFileSync(file, 'utf-8')
    if (!source.includes('@keyframes')) continue
    if (ALLOWLIST.has(relative)) continue
    const hasReducedMotion = source.includes('@media (prefers-reduced-motion')
    if (!hasReducedMotion) {
        svelteOffenders.push(relative)
    }
}

const offenders = [...cssOffenders, ...svelteOffenders]
assert(
    offenders.length === 0,
    `Files with @keyframes that consume animations must include a prefers-reduced-motion override:\n${offenders.join('\n')}`
)
console.log(`reduced-motion-sweep [part 1] CSS scan: ${CSS_DIR} + ${COMPONENTS_DIR} — ${cssOffenders.length + svelteOffenders.length} offenders, 0 violations.`)

// Runtime tests for prefersReducedMotion()
console.log('\n[RUNTIME] prefersReducedMotion SSR-safe (no window)')
const savedWindowMatchMedia = globalThis.window?.matchMedia
try {
    delete globalThis.window
    const { prefersReducedMotion } = await import('../src/lib/utils/environment.ts')
    const result = prefersReducedMotion()
    assert(result === false, `prefersReducedMotion() must return false in SSR, got: ${result}`)
    console.log('  OK prefersReducedMotion() returns false in SSR')
} finally {
    if (savedWindowMatchMedia !== undefined) {
        globalThis.window = { matchMedia: savedWindowMatchMedia }
    } else {
        globalThis.window = undefined
    }
}

console.log('\n[RUNTIME] prefersReducedMotion respects matchMedia (reduce: yes)')
globalThis.window = {
    matchMedia: (query) => ({
        matches: true,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {}
    })
}
const mod2 = await import('../src/lib/utils/environment.ts?t=' + Date.now())
const resultYes = mod2.prefersReducedMotion()
assert(resultYes === true, `prefersReducedMotion() must return true when OS prefers reduced motion, got: ${resultYes}`)
console.log('  OK prefersReducedMotion() returns true')

console.log('\n[RUNTIME] prefersReducedMotion canonical API surface')
assert(typeof mod2.prefersReducedMotion === 'function', 'prefersReducedMotion must be exported as a function')
const prmResult = mod2.prefersReducedMotion()
assert(typeof prmResult === 'boolean', `prefersReducedMotion() must return boolean, got: ${typeof prmResult}`)
console.log(`  OK prefersReducedMotion() returns ${prmResult} (boolean)`)

console.log('\n[RUNTIME] MQL cache rebuilds when window.matchMedia is replaced')
globalThis.window = {
    matchMedia: (query) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {}
    })
}
const cachedResult = mod2.prefersReducedMotion()
assert(cachedResult === false, `MQL cache rebuild detected new matchMedia, got: ${cachedResult}`)
console.log('  OK MQL cache rebuilds when window.matchMedia identity changes')

if (typeof globalThis.window !== 'undefined') {
    delete globalThis.window
}
console.log('reduced-motion-sweep [part 1] coverage: static scan + 4 runtime behavioral tests passed.')

// ─── Sweep Part 2: js-reduced-motion-animation-guard (static source + runtime) ─

function readSrc(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf-8')
}

function assertContains(source, substring, label) {
    assert(source.includes(substring), `${label}: expected to contain "${substring}"`)
}

console.log('\n[JS reduced-motion guard contract]')

// 1. Focus decoration loop
const interactionSrc = readSrc('src/lib/engine/three-interaction-visuals.ts')
assertContains(interactionSrc, "import { prefersReducedMotion } from '@lib/utils/environment'", 'three-interaction-visuals imports prefersReducedMotion')
assertContains(interactionSrc, 'const reducedMotion = prefersReducedMotion()', 'three-interaction-visuals computes reducedMotion')
assertContains(interactionSrc, 'const time = reducedMotion ? 0 : now / 1000', 'three-interaction-visuals freezes time under reduced motion')
assertContains(interactionSrc, 'timeUniform.value = reducedMotion ? 0 : time', 'focus-lens time uniform is gated')
assertContains(interactionSrc, 'if (!reducedMotion) {', 'focus-lens rotation is gated')
assertContains(interactionSrc, 'state.focusLens.rotation.y += rotationSpeed', 'focus-lens rotation code remains')
console.log('  ✓ three-interaction-visuals.ts focus-lens/motes/petals/filaments frozen under reduced motion')

// 2. Point material breath
const frameUpdatesSrc = readSrc('src/lib/engine/three-engine-frame-updates.ts')
assertContains(frameUpdatesSrc, "import { prefersReducedMotion } from '@lib/utils/environment'", 'three-engine-frame-updates imports prefersReducedMotion helper')
assertContains(frameUpdatesSrc, 'uTime.value', 'three-engine-frame-updates writes uTime')
assertContains(frameUpdatesSrc, 'if (!prefersReduced)', 'three-engine-frame-updates guards uTime write')
console.log('  ✓ three-engine-frame-updates.ts point uTime uniform gated under reduced motion')

// 3. Search corridor shader pulse
const searchAnimSrc = readSrc('src/lib/engine/three-search-corridor-animations.ts')
assertContains(searchAnimSrc, "import { prefersReducedMotion } from '@lib/utils/environment'", 'three-search-animations (corridor module) imports prefersReducedMotion')
assertContains(searchAnimSrc, 'const reducedMotion = prefersReducedMotion()', 'three-search-animations (corridor module) computes reducedMotion')
assertContains(searchAnimSrc, 'const time = reducedMotion ? 0 : frameNow / 1000', 'corridor uTime uniform is gated (refactored to const+assign)')
console.log('  ✓ three-search-animations.ts corridor uTime uniform gated under reduced motion')

// 4. Canvas click pulse
const canvasInteractionSrc = readSrc('src/lib/journey/canvas-interaction.ts')
assertContains(canvasInteractionSrc, "import { prefersReducedMotion } from '@lib/utils/environment'", 'canvas-interaction imports prefersReducedMotion')
assertContains(canvasInteractionSrc, 'if (prefersReducedMotion()) return', 'showClickPulse suppresses animation under reduced motion')
console.log('  ✓ canvas-interaction.ts click pulse suppressed under reduced motion')

// 5. Selected-card fade
const stageRendererSrc = readSrc('src/lib/focus/stage-renderer.ts')
assertContains(stageRendererSrc, 'prefersReducedMotion', 'stage-renderer imports/checks prefersReducedMotion')
assertContains(stageRendererSrc, "cardEl.style.setProperty('--selected-card-fade-ms', '0ms')", 'triggerSelectedCardFade collapses duration under reduced motion')
console.log('  ✓ stage-renderer.ts selected-card fade suppressed under reduced motion')

// 6. Search result scrolls
const searchResultsSrc = readSrc('src/components/SearchResults.svelte')
assertContains(searchResultsSrc, "import { prefersReducedMotion } from '@lib/utils/environment'", 'SearchResults imports prefersReducedMotion')
assertContains(searchResultsSrc, "firstNewItem.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' })", 'SearchResults Show more scroll respects reduced motion')
console.log('  ✓ SearchResults.svelte Show more scroll gated under reduced motion')

const resultRendererSrc = readSrc('src/lib/search/result-renderer.ts')
assertContains(resultRendererSrc, "import { getViewportSize, prefersReducedMotion } from '../utils/environment'", 'result-renderer imports prefersReducedMotion')
assertContains(resultRendererSrc, "rowToReveal.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })", 'result-renderer reveal scroll respects reduced motion')
console.log('  ✓ result-renderer.ts active-result reveal scroll gated under reduced motion')

// Runtime behavioral tests
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

// R1: prefersReducedMotion SSR-safe
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

// R2: prefersReducedMotion with mock matchMedia (reduce: yes)
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
    runtimeAssert(result === true, `prefersReducedMotion() returns true when OS prefers reduced motion (got: ${result})`)
}

// R3: prefersReducedMotion with mock matchMedia (reduce: no)
{
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
    runtimeAssert(result === false, `MQL cache rebuild: prefersReducedMotion() returns false after matchMedia swap (got: ${result})`)
}

// R4: prefersReducedMotion canonical API surface
{
    const env = await import('@lib/utils/environment')
    runtimeAssert(typeof env.prefersReducedMotion === 'function', 'prefersReducedMotion is exported as a function')
    const result = env.prefersReducedMotion()
    runtimeAssert(typeof result === 'boolean', `prefersReducedMotion() returns boolean (got: ${typeof result})`)
}

// R5: updateInteractionVisuals importable & callable
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

// R6: updatePointsShaderHoverBoost importable & callable
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

// R7: triggerSearchCorridorAnimation importable
{
    const mod = await import('@lib/engine/three-search-animations')
    runtimeAssert(typeof mod.triggerSearchCorridorAnimation === 'function', 'triggerSearchCorridorAnimation is exported')
    runtimeAssert(typeof mod.updateSearchCorridorAnimation === 'function', 'updateSearchCorridorAnimation is exported')
}

// R8: triggerSelectedCardFade importable
{
    const mod = await import('@lib/focus/stage-renderer')
    runtimeAssert(typeof mod.triggerSelectedCardFade === 'function', 'triggerSelectedCardFade is exported')
}

if (typeof globalThis.window !== 'undefined') {
    delete globalThis.window
}

console.log(`\n[RUNTIME] ${runtimePasses} passed, ${runtimeFailures} failed`)
if (runtimeFailures > 0) {
    console.error('RUNTIME TESTS FAILED')
    process.exit(1)
}

console.log('reduced-motion-sweep OK: CSS @keyframes scan (194 LOC) + JS RAF guards (282 LOC) both pass.')

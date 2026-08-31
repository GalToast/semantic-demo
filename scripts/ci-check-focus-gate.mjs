#!/usr/bin/env node
/**
 * ci-check-focus-gate.mjs
 * Lockstep gate for focusActive / chromeHasFocus (W53).
 * Ensures both focus gates are single-sourced via isFocusSurfaceActive()
 * — the one-line fix in 52f285d6 must never drift asymmetrically.
 *
 * What this guards (AGENTS.md W53):
 *  - use-surface-composition.svelte.ts:  focusActive   = $derived(isFocusSurfaceActive(...))
 *  - JourneyChrome.svelte:               chromeHasFocus = $derived(isFocusSurfaceActive(...))
 * Any inline predicate (e.g. `panelSurface === 'focus'`) re-introduced
 * directly in those files would bypass parity and cause silent 30s e2e timeouts.
 *
 * Usage: node scripts/ci-check-focus-gate.mjs
 * Exit 0 = ok, 1 = violation (also used by `npm run check:focus-gate` and CI).
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dir, '..')

const COMPO_PATH = resolve(ROOT, 'src/lib/ui/use-surface-composition.svelte.ts')
const CHROME_PATH = resolve(ROOT, 'src/components/JourneyChrome.svelte')
const PARITY_PATH = resolve(ROOT, 'src/lib/ui/use-parity-attrs.svelte.ts')

function read(p) {
    return readFileSync(p, 'utf8')
}

function fail(msg) {
    console.error(`[focus-gate] ✗ ${msg}`)
    process.exitCode = 1
}

let violations = 0

// 1. Wire-through check: both files must call isFocusSurfaceActive inside $derived
for (const [label, path, varName] of [
    ['use-surface-composition', COMPO_PATH, 'focusActive'],
    ['JourneyChrome', CHROME_PATH, 'chromeHasFocus']
]) {
    let src
    try {
        src = read(path)
    } catch {
        fail(`Cannot read ${label} at ${path}`)
        violations++
        continue
    }
    const needle = `const ${varName} = $derived(isFocusSurfaceActive(`
    if (!src.includes(needle)) {
        // also allow `const focusActive: boolean = $derived(isFocus...` (type annotation)
        const loose = src.includes(`$derived(isFocusSurfaceActive(`) && src.includes(varName)
        if (!loose) {
            fail(
                `${label}: \`${varName}\` must be \`$derived(isFocusSurfaceActive(...))\` — single-sourced via use-parity-attrs. Found no match for \`${needle}\`.`
            )
            violations++
        }
    }
}

// 2. Helper must contain the full expected surface set (parity)
const FOCUS_LITERALS = ['focus', 'inside', 'trail', 'focus-search', 'map-trail', 'semantic-dive']
try {
    const paritySrc = read(PARITY_PATH)
    const expected = new Set(FOCUS_LITERALS)
    const found = new Set([...paritySrc.matchAll(/panelSurface\s*===\s*'([^']+)'/g)].map((m) => m[1]))
    for (const lit of expected) {
        if (!found.has(lit)) {
            fail(
                `use-parity-attrs: helper is missing surface literal '${lit}' (expected set: ${FOCUS_LITERALS.join(', ')})`
            )
            violations++
        }
    }
} catch (e) {
    fail(`Cannot read parity helper at ${PARITY_PATH}: ${e.message}`)
    violations++
}

if (violations === 0) {
    console.log('[focus-gate] ✓ focusActive + chromeHasFocus are lockstep via isFocusSurfaceActive()')
    process.exit(0)
} else {
    console.error(
        `[focus-gate] ${violations} violation(s) — see AGENTS.md W53 (671af64c) and src/lib/ui/use-parity-attrs.svelte.ts`
    )
    process.exit(1)
}

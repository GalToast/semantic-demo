/**
 * Gates-vs-Canonical-Surface-Map contract (parity-report.md §5 / §6.1;
 * upgraded 2026-08-15 after A1 predicate extraction, commit `52f285d6`).
 *
 * Pins App.svelte `focusActive` and JourneyChrome.svelte `chromeHasFocus`
 * to the canonical surface set exported by surface-mode-map.ts
 * (PANEL_SURFACES / isPanelSurface) AND to the shared predicate helper
 * `isFocusSurfaceActive()` in src/lib/ui/use-parity-attrs.svelte.ts.
 *
 * Why the upgrade: A1 moved the gate logic OUT of the `$derived` expressions
 * into the shared helper, so a `$derived`-only text probe went empty
 * (trivially-passing gate-vs-gate equality + phantom-literal checks).
 * The durable contract is now: (a) the helper's `panelSurface ===` literal
 * set exactly equals the documented W53 focus set, and (b) BOTH components
 * wire their focus gate through that single helper call (no inlined
 * derivative predicates that could drift asymmetrically — the W53 lockstep
 * /em 30s-e2e-timeout landmine).
 *
 * Existing call-site truths (asserted by wire-in test):
 *   use-surface-composition.svelte.ts  focusActive = $derived(isFocusSurfaceActive(nav.mode, nav.focusedIndex ?? null, parity))
 *   JourneyChrome.svelte:139 chromeHasFocus = $derived(isFocusSurfaceActive(navSnapshot.mode, currentFocusedIndex ?? null, parity))
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { isPanelSurface, PANEL_SURFACES } from '@lib/stores/navigation/surface-mode-map'

const APP_PATH = resolve(import.meta.dirname, '../../src/App.svelte')
const SURFACE_COMPOSITION_PATH = resolve(import.meta.dirname, '../../src/lib/ui/use-surface-composition.svelte.ts')
const CHROME_PATH = resolve(import.meta.dirname, '../../src/components/JourneyChrome.svelte')
const PARITY_PATH = resolve(import.meta.dirname, '../../src/lib/ui/use-parity-attrs.svelte.ts')

/** Source-of-truth W53 focus surface set (AGENTS.md lockstep predicate set
 *  `panelSurface in {focus, inside, trail, focus-search, map-trail,
 *  semantic-dive}`). 'semantic-dive' remains the parity-only exception that
 *  is intentionally NOT a member of PANEL_SURFACES (body-attr bypass). */
const EXPECTED_FOCUS_SURFACES = ['focus', 'inside', 'trail', 'focus-search', 'map-trail', 'semantic-dive'] as const

/** Slice from `needle` to the matching close paren of the first '(' after it. */
function sliceCall(source: string, needle: string): string {
    const start = source.indexOf(needle)
    if (start < 0) throw new Error(`Missing ${needle} in source`)
    const open = source.indexOf('(', start)
    if (open < 0) throw new Error(`No '(' following ${needle}`)
    let depth = 0
    for (let i = open; i < source.length; i++) {
        if (source[i] === '(') depth++
        else if (source[i] === ')') {
            depth--
            if (depth === 0) return source.slice(open + 1, i)
        }
    }
    throw new Error(`Unclosed paren after ${needle}`)
}

/** SelectorSlice for a function BODY: slice `export function isFocusSurfaceActive(`'s {...} block. */
function readCallExpression(source: string, needle: string): string {
    return sliceCall(source, needle)
}

function readFunctionBody(source: string, fnName: string): string {
    const start = source.indexOf(`function ${fnName}(`)
    if (start < 0) throw new Error(`Missing function ${fnName} in parity module`)
    const open = source.indexOf('{', start)
    if (open < 0) throw new Error(`Missing body brace for ${fnName}`)
    let depth = 0
    for (let i = open; i < source.length; i++) {
        if (source[i] === '{') depth++
        else if (source[i] === '}') {
            depth--
            if (depth === 0) return source.slice(open + 1, i)
        }
    }
    throw new Error(`Unclosed body for ${fnName}`)
}

/** Normalize: strip nav dialects + store prefixes + whitespace. */
function normalize(source: string): string {
    return source
        .replace(/navSnapshot/g, 'nav')
        .replace(/currentFocusedIndex/g, 'focusedIndex')
        .replace(/\b(?:nav|parity)\./g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

/** Pull every `panelSurface === '<x>'` literal out of a normalized source expr. */
function extractPanelSurfaceLiterals(source: string): string[] {
    return [...source.matchAll(/\bpanelSurface\s*===\s*'([^']+)'/g)].map((m) => m[1])
}

function hasCall(source: string, fnName: string): boolean {
    return source.includes(fnName) && source.includes(`${fnName}(`)
}

function sortedUnique(values: string[]): string[] {
    return [...new Set(values)].sort()
}

const parityBody = readFunctionBody(readFileSync(PARITY_PATH, 'utf8'), 'isFocusSurfaceActive')
const helperSurfaces = extractPanelSurfaceLiterals(normalize(parityBody))
const expected = sortedUnique([...EXPECTED_FOCUS_SURFACES])

describe('focus gates pinned to canonical surface-mode-map (via shared helper)', () => {
    const appGate = normalize(readCallExpression(readFileSync(SURFACE_COMPOSITION_PATH, 'utf8'), 'const focusActive = $derived('))
    const chromeGate = normalize(
        readCallExpression(readFileSync(CHROME_PATH, 'utf8'), 'const chromeHasFocus = $derived(')
    )

    it('documents which canonical surfaces the focus mount gate depends on', () => {
        for (const surface of EXPECTED_FOCUS_SURFACES) {
            if (surface === 'semantic-dive') {
                expect(
                    isPanelSurface(surface),
                    '"semantic-dive" is intentionally parity-only, not in PANEL_SURFACES'
                ).toBe(false)
            } else {
                expect(
                    isPanelSurface(surface),
                    `expected focus surface "${surface}" to be a canonical PANEL_SURFACE`
                ).toBe(true)
            }
        }
        expect(PANEL_SURFACES.length).toBeGreaterThan(0)
    })

    it("keeps the shared helper's `panelSurface` literals canonical — no typo/phantom", () => {
        const invalid = helperSurfaces.filter((s) => !isPanelSurface(s) && s !== 'semantic-dive')
        expect(
            invalid,
            `non-canonical panelSurface literal(s) in isFocusSurfaceActive; add to PANEL_SURFACES or document as parity-only`
        ).toEqual([])
    })

    it('wires BOTH gates through the shared isFocusSurfaceActive helper (no inlined asymmetric derivation)', () => {
        expect(appGate, 'App.svelte focusActive must call isFocusSurfaceActive').toMatch(/isFocusSurfaceActive\(/)
        expect(chromeGate, 'JourneyChrome chromeHasFocus must call isFocusSurfaceActive').toMatch(
            /isFocusSurfaceActive\(/
        )
        // dialect-normalized (navSnapshot→nav, currentFocusedIndex→focusedIndex, no store
        // prefixes): both gates must reduce to the SAME call — true lockstep.
        expect(appGate, 'dialect-normalized gates must be literally identical').toEqual(chromeGate)
    })

    it('pins the shared helper to exactly the documented W53 focus-surface set', () => {
        expect(sortedUnique(helperSurfaces)).toEqual(expected)
    })
})

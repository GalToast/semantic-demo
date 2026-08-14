/**
 * Gates-vs-Canonical-Surface-Map contract (parity-report.md §5 / §6.1).
 *
 * Pins App.svelte `focusActive` and JourneyChrome.svelte `chromeHasFocus`
 * to the canonical surface set exported by surface-mode-map.ts
 * (PANEL_SURFACES / isPanelSurface) — the gap the existing
 * focus-gate-lockstep-contract.test.ts leaves: it enforces gate-vs-gate
 * predicate *equality* via a hardcoded PREDICATES array of String.includes()
 * substrings, but never cross-checks that the `panelSurface === '<x>'`
 * literals in either gate are members of the canonical PANEL_SURFACES enum
 * (a phantom limb like 'focus-search' misspelled as 'focuss-earch' would
 * still `.includes()`-match) nor that the documented focus-relevant
 * surfaces all appear in BOTH gates.
 *
 * Drop-in: tests/unit-active/gates-vs-surfacemap.test.ts
 * Path alias `@lib` and relative `../../src/...` resolve from both
 * tests/unit-active/ and tmp/swarm-audit/.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { isPanelSurface, PANEL_SURFACES } from '@lib/stores/navigation/surface-mode-map'

const APP_PATH = resolve(import.meta.dirname, '../../src/App.svelte')
const CHROME_PATH = resolve(import.meta.dirname, '../../src/components/JourneyChrome.svelte')

/**
 * Documented W53 lockstep focus-surface set (AGENTS.md lockstep predicate set:
 * `panelSurface in {focus, inside, trail, focus-search, map-trail, semantic-dive}`
 * plus the focusPanelMode === 'field-node' and focusSearchForced branches, which
 * are handled by the sibling lockstep test, not this surface-only contract).
 * Of these, all except 'semantic-dive' are members of PANEL_SURFACES;
 * 'semantic-dive' is a parity-only bypass body-attr by design, so it is the
 * single documented exception to the canonical-enum pinning.
 */
const EXPECTED_FOCUS_SURFACES = [
    'focus',
    'inside',
    'trail',
    'focus-search',
    'map-trail',
    'semantic-dive'
] as const

/** Reused verbatim from focus-gate-lockstep-contract.test.ts so the two
 *  tests agree on how the $derived( gate expression is sliced from source. */
function readDerivedExpression(path: string, declaration: string): string {
    const source = readFileSync(path, 'utf8')
    const start = source.indexOf(declaration)
    if (start < 0) throw new Error(`Missing ${declaration} in ${path}`)

    const open = source.indexOf('$derived(', start)
    if (open < 0) throw new Error(`Missing $derived expression for ${declaration}`)

    let depth = 0
    for (let i = open + '$derived('.length; i < source.length; i++) {
        const char = source[i]
        if (char === '(') depth++
        if (char === ')') {
            if (depth === 0) return source.slice(open, i + 1)
            depth--
        }
    }
    throw new Error(`Unclosed $derived expression for ${declaration}`)
}

/** Strip store prefixes + collapse whitespace so the two gate dialects
 *  (navSnapshot / nav, parity.* inlined vs getter, currentFocusedIndex /
 *  focusedIndex, parity. prefixed) reduce to the same literal surface form. */
function normalize(source: string): string {
    return source
        .replace(/navSnapshot/g, 'nav')
        .replace(/currentFocusedIndex/g, 'focusedIndex')
        .replace(/\b(?:nav|parity)\./g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

/** Pull every `panelSurface === '<x>'` literal out of a normalized gate expr. */
function extractPanelSurfaceLiterals(gate: string): string[] {
    return [...gate.matchAll(/\bpanelSurface\s*===\s*'([^']+)'/g)].map((m) => m[1])
}

function sortedUnique(values: string[]): string[] {
    return [...new Set(values)].sort()
}

describe('focus gates pinned to canonical surface-mode-map', () => {
    const appGate = normalize(readDerivedExpression(APP_PATH, 'let focusActive = $derived('))
    const chromeGate = normalize(readDerivedExpression(CHROME_PATH, 'const chromeHasFocus = $derived('))
    const appSurfaces = extractPanelSurfaceLiterals(appGate)
    const chromeSurfaces = extractPanelSurfaceLiterals(chromeGate)
    const expected = sortedUnique([...EXPECTED_FOCUS_SURFACES])

    it('documents which canonical surfaces the focus mount gate depends on', () => {
        // Guards against surface-mode-map.ts silently dropping a surface the
        // gates are pinned to: every EXPECTED focus surface (except the
        // parity-only 'semantic-dive') must still be a canonical enum member.
        for (const surface of EXPECTED_FOCUS_SURFACES) {
            if (surface === 'semantic-dive') {
                expect(isPanelSurface(surface), `"semantic-dive" is intentionally parity-only, not in PANEL_SURFACES`).toBe(false)
            } else {
                expect(
                    isPanelSurface(surface),
                    `expected focus surface "${surface}" to be a canonical PANEL_SURFACE`
                ).toBe(true)
            }
        }
        expect(PANEL_SURFACES.length).toBeGreaterThan(0)
    })

    it('references only canonical surfaces — no typo/phantom panelSurface literals', () => {
        const invalid = [...new Set([...appSurfaces, ...chromeSurfaces])].filter(
            (s) => !isPanelSurface(s) && s !== 'semantic-dive'
        )
        expect(
            invalid,
            `non-canonical panelSurface literal(s) in a focus gate; add to PANEL_SURFACES in surface-mode-map.ts or document as parity-only`
        ).toEqual([])
    })

    it('keeps App.svelte focusActive and JourneyChrome.svelte chromeHasFocus on the same panelSurface literal set', () => {
        expect(sortedUnique(appSurfaces)).toEqual(sortedUnique(chromeSurfaces))
    })

    it('pins both gates to exactly the documented W53 focus-surface set', () => {
        expect(sortedUnique(appSurfaces)).toEqual(expected)
        expect(sortedUnique(chromeSurfaces)).toEqual(expected)
    })
})

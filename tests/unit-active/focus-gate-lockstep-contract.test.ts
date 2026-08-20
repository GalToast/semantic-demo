/**
 * Focus gate lockstep contract.
 *
 * App.svelte and JourneyChrome.svelte intentionally carry twin visibility
 * logic. A one-sided change can leave the focus controls unmounted while
 * the parent surface is active, producing a silent journey timeout.
 *
 * Post-A1 (commit `52f285d6`): the twin predicates live ONCE in
 * `isFocusSurfaceActive(navMode, focusedIndex, parity)` at
 * src/lib/ui/use-parity-attrs.svelte.ts, and both gates are thin
 * `$derived(isFocusSurfaceActive(...))` calls. This contract therefore
 * re-points its probe at the HELP:` the body must still carry the full W53
 * predicate set, and both components must still wire through the helper
 * (no inlined derivations drifting apart).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const APP_PATH = resolve(import.meta.dirname, '../../src/App.svelte')
const SURFACE_COMPOSITION_PATH = resolve(import.meta.dirname, '../../src/lib/ui/use-surface-composition.svelte.ts')
const CHROME_PATH = resolve(import.meta.dirname, '../../src/components/JourneyChrome.svelte')
const PARITY_PATH = resolve(import.meta.dirname, '../../src/lib/ui/use-parity-attrs.svelte.ts')

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

function readGateExpression(path: string, declaration: string): string {
    const source = readFileSync(path, 'utf8')
    const start = source.indexOf(declaration)
    if (start < 0) throw new Error(`Missing ${declaration} in ${path}`)
    const open = source.indexOf('$derived(', start)
    if (open < 0) throw new Error(`Missing $derived expression for ${declaration}`)
    let depth = 0
    for (let i = open + '$derived('.length; i < source.length; i++) {
        const char = source[i]
        if (char === '(') depth++
        else if (char === ')') {
            if (depth === 0) return source.slice(open, i + 1)
            depth--
        }
    }
    throw new Error(`Unclosed $derived expression for ${declaration}`)
}

function normalize(source: string): string {
    return source
        .replace(/navSnapshot/g, 'nav')
        .replace(/currentFocusedIndex/g, 'focusedIndex')
        .replace(/navMode/g, 'mode')
        .replace(/\b(?:nav|parity)\./g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

describe('focus gate lockstep', () => {
    const appGate = normalize(readGateExpression(SURFACE_COMPOSITION_PATH, 'const focusActive = $derived('))
    const chromeGate = normalize(readGateExpression(CHROME_PATH, 'const chromeHasFocus = $derived('))

    it('wires App.svelte focusActive through the shared helper', () => {
        expect(appGate).toMatch(/isFocusSurfaceActive\(/)
    })

    it('wires JourneyChrome.svelte chromeHasFocus through the shared helper', () => {
        expect(chromeGate).toMatch(/isFocusSurfaceActive\(/)
    })

    it('keeps the two gates literally identical (dialect-normalized) — real lockstep', () => {
        expect(appGate).toEqual(chromeGate)
    })
})

/**
 * Focus gate lockstep contract.
 *
 * App.svelte and JourneyChrome.svelte intentionally carry twin visibility
 * predicates. A one-sided change can leave the focus controls unmounted while
 * the parent surface is active, producing a silent journey timeout.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const APP_PATH = resolve(import.meta.dirname, '../../src/App.svelte')
const CHROME_PATH = resolve(import.meta.dirname, '../../src/components/JourneyChrome.svelte')

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

function normalize(source: string): string {
    return source
        .replace(/navSnapshot/g, 'nav')
        .replace(/currentFocusedIndex/g, 'focusedIndex')
        .replace(/\b(?:nav|parity)\./g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

const PREDICATES = [
    "mode === 'focus'",
    "mode === 'inside'",
    "mode === 'trail'",
    'focusedIndex != null',
    "focusPanelMode === 'field-node'",
    "panelSurface === 'focus'",
    "panelSurface === 'inside'",
    "panelSurface === 'trail'",
    "panelSurface === 'focus-search'",
    "panelSurface === 'map-trail'",
    'focusSearchForced',
    "panelSurface === 'semantic-dive'"
] as const

describe('focus gate lockstep', () => {
    const appGate = normalize(readDerivedExpression(APP_PATH, 'let focusActive = $derived('))
    const chromeGate = normalize(readDerivedExpression(CHROME_PATH, 'const chromeHasFocus = $derived('))

    it('keeps the App and JourneyChrome focus gates on the same predicate set', () => {
        const appMissing = PREDICATES.filter((predicate) => !appGate.includes(predicate))
        const chromeMissing = PREDICATES.filter((predicate) => !chromeGate.includes(predicate))

        expect(appMissing, 'App.svelte focusActive is missing lockstep predicates').toEqual([])
        expect(chromeMissing, 'JourneyChrome.svelte chromeHasFocus is missing lockstep predicates').toEqual([])
    })

    it('does not allow one gate to carry an extra focus predicate', () => {
        const appPredicates = PREDICATES.filter((predicate) => appGate.includes(predicate))
        const chromePredicates = PREDICATES.filter((predicate) => chromeGate.includes(predicate))
        expect(appPredicates).toEqual(chromePredicates)
    })
})

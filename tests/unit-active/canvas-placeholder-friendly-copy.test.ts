/**
 * canvas-placeholder-friendly-copy.test.ts — W48-J friendly-copy guard
 *
 * Locks the 2026-07-13 copy fixes in Canvas.svelte + Placeholder2D.svelte so
 * the forbidden jargon ("mycelium") and the "semantic" descriptor in the
 * canvas aria-label cannot regress. Mirrors the thread-lens-friendly-copy
 * pattern (source-inspect, extract string literals, assert).
 *
 * Product-name uses of "Semantic Explorer" (the H1, the placeholder region
 * aria-label) are intentional and are NOT blanket-forbidden here — only the
 * descriptor uses ("Loading mycelium", "3D semantic business explorer") are.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const CANVAS = join(ROOT, 'src/components/Canvas.svelte')
const PLACEHOLDER = join(ROOT, 'src/components/Placeholder2D.svelte')

function read(path: string): string {
    return readFileSync(path, 'utf-8')
}

/** Strip comments so the test only sees user-visible literals. */
function extractStringLiterals(src: string): string[] {
    const stripped = src
        .replace(/<!--[\s\S]*?-->/g, '') // svelte/html comments
        .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
        .replace(/(^|\n)\s*\/\/.*$/g, '$1') // line comments
    const lits: string[] = []
    const re = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g
    let m: RegExpExecArray | null
    while ((m = re.exec(stripped)) !== null) lits.push(m[0])
    return lits
}

describe('Friendly copy — Canvas + Placeholder2D (2026-07-13 sweep)', () => {
    let canvasSrc: string
    let placeholderSrc: string
    let canvasLits: string[]
    let placeholderLits: string[]

    beforeAll(() => {
        canvasSrc = read(CANVAS)
        placeholderSrc = read(PLACEHOLDER)
        canvasLits = extractStringLiterals(canvasSrc)
        placeholderLits = extractStringLiterals(placeholderSrc)
    })

    it('Canvas.svelte exposes no "mycelium" in any string literal', () => {
        const offenders = canvasLits.filter((l) => /mycelium/i.test(l))
        expect(offenders, `offenders: ${JSON.stringify(offenders)}`).toEqual([])
    })

    it('Canvas.svelte loading copy is jargon-free', () => {
        expect(canvasSrc).toContain('Loading the map')
        expect(canvasSrc).not.toContain('Loading mycelium')
    })

    it('Canvas.svelte aria-label is jargon-free (no "semantic" descriptor)', () => {
        expect(canvasSrc).toContain('aria-label="3D business network"')
        expect(canvasSrc).not.toContain('aria-label="3D semantic')
    })

    it('Placeholder2D.svelte exposes no "mycelium" in any string literal', () => {
        const offenders = placeholderLits.filter((l) => /mycelium/i.test(l))
        expect(offenders, `offenders: ${JSON.stringify(offenders)}`).toEqual([])
    })

    it('Placeholder2D.svelte subtitle is jargon-free', () => {
        expect(placeholderSrc).toContain('Montgomery County businesses')
        expect(placeholderSrc).not.toContain('business mycelium')
    })
})

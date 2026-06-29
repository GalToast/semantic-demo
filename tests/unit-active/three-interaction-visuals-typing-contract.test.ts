/**
 * three-interaction-visuals — typing contract test
 *
 * Lock-in: ensures the W47 type-safety tightening pass on
 * three-interaction-visuals.ts does not regress. Before this pass the
 * file had 8 `any` occurrences; after, 1 (the file-level engine-boundary
 * escape hatch that matches the same pattern used in
 * thread-inspector-webgl.ts and three-search-animations.ts).
 *
 * What this guards:
 *   1. any count is exactly 1, on the documented escape-hatch line
 *   2. getSemanticLensNeighborIndices uses `number` for focusedNode
 *   3. The 3 update*Node* helpers use (Vector3 | null, number, boolean)
 *   4. updateInteractionVisuals uses (number, number, number | null)
 *   5. petal in forEach/some is typed `Mesh` (not any)
 *   6. worldPos narrowing uses `!== null` (not Boolean())
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore
import { readFileSync } from 'node:fs'
// @ts-ignore
import { fileURLToPath } from 'node:url'
// @ts-ignore
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const SRC_PATH = resolve(__dirname, '../../src/lib/engine/three-interaction-visuals.ts')
const MOTES_PATH = resolve(__dirname, '../../src/lib/engine/three-lens-motes.ts')
const PETALS_PATH = resolve(__dirname, '../../src/lib/engine/three-lens-petals.ts')
const FILAMENTS_PATH = resolve(__dirname, '../../src/lib/engine/three-lens-filaments.ts')

function readSource(p: string): string {
    return readFileSync(p, 'utf-8')
}

// Strip line + block comments so regexes don't false-positive on JSDoc prose.
function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('three-interaction-visuals — typing contract (W47 tightening)', () => {
    const src = readSource(SRC_PATH)
    const motes = readSource(MOTES_PATH)
    const petals = readSource(PETALS_PATH)
    const filaments = readSource(FILAMENTS_PATH)
    const stripped = stripComments(src)

    it('has 0 any occurrences (fully tightened)', () => {
        const matches = src.match(/: any\b| as any\b|<any>| any\[\]/g) ?? []
        expect(matches.length).toBe(0)
    })

    it('documented engine-boundary escape hatch was removed', () => {
        const lines = src.split('\n')
        const line = lines.find((l) => /as any/.test(l)) ?? ''
        expect(line).toBe('')
    })

    it('getSemanticLensNeighborIndices uses `number` for focusedNode (not any)', () => {
        const match = stripped.match(/function\s+getSemanticLensNeighborIndices\s*\(\s*focusedNode\s*:\s*([^)]+)\)/)
        expect(match, 'function signature not found').toBeTruthy()
        expect(match![1].trim()).toBe('number')
    })

    it('getSemanticLensNeighborIndices returns number[]', () => {
        const match = stripped.match(/function\s+getSemanticLensNeighborIndices\s*\([^)]+\)\s*:\s*([^{]+)/)
        expect(match, 'return type not found').toBeTruthy()
        expect(match![1].trim()).toBe('number[]')
    })

    it('updateSelectedNodeMotes uses (Vector3 | null, number, boolean)', () => {
        const match = motes.match(/function\s+updateSelectedNodeMotes\s*\(([^)]+)\)/)
        expect(match, 'function signature not found').toBeTruthy()
        const params = match![1]
        expect(params).toMatch(/worldPos\s*:\s*Vector3\s*\|\s*null/)
        expect(params).toMatch(/time\s*:\s*number/)
        expect(params).toMatch(/isInside\s*:\s*boolean/)
    })

    it('updateSelectedNodePetals uses (Vector3 | null, number, boolean)', () => {
        const match = petals.match(/function\s+updateSelectedNodePetals\s*\(([^)]+)\)/)
        expect(match, 'function signature not found').toBeTruthy()
        const params = match![1]
        expect(params).toMatch(/worldPos\s*:\s*Vector3\s*\|\s*null/)
        expect(params).toMatch(/time\s*:\s*number/)
        expect(params).toMatch(/isInside\s*:\s*boolean/)
    })

    it('updateSelectedNodeFilaments uses (Vector3 | null, number, boolean)', () => {
        const match = filaments.match(/function\s+updateSelectedNodeFilaments\s*\(([^)]+)\)/)
        expect(match, 'function signature not found').toBeTruthy()
        const params = match![1]
        expect(params).toMatch(/worldPos\s*:\s*Vector3\s*\|\s*null/)
        expect(params).toMatch(/time\s*:\s*number/)
        expect(params).toMatch(/isInside\s*:\s*boolean/)
    })

    it('updateInteractionVisuals uses (number, number, number | null): void', () => {
        const match = stripped.match(/export\s+function\s+updateInteractionVisuals\s*\(([^)]+)\)\s*:\s*([^{]+)/)
        expect(match, 'function signature not found').toBeTruthy()
        const params = match![1]
        expect(params).toMatch(/now\s*:\s*number/)
        expect(params).toMatch(/hoveredNode\s*:\s*number/)
        expect(params).toMatch(/focusedNode\s*:\s*number\s*\|\s*null/)
        expect(match![2].trim()).toBe('void')
    })

    it('petal in forEach is typed `Mesh` (not any)', () => {
        const match = petals.match(/state\.focusPetals\.forEach\s*\(\s*\(\s*petal\s*:\s*([^,)]+)/)
        expect(match, 'forEach signature not found').toBeTruthy()
        expect(match![1].trim()).toBe('Mesh')
    })

    it('petal in `some` callback is typed `Mesh` (not any)', () => {
        const match = petals.match(/state\.focusPetals\.some\s*\(\s*\(\s*petal\s*:\s*([^)]+)/)
        expect(match, 'some signature not found').toBeTruthy()
        expect(match![1].trim()).toBe('Mesh')
    })

    it('all 3 update*Node* helpers use `worldPos !== null` for narrowing (not Boolean)', () => {
        const helpers = [
            { name: 'updateSelectedNodeMotes', src: motes },
            { name: 'updateSelectedNodePetals', src: petals },
            { name: 'updateSelectedNodeFilaments', src: filaments }
        ]
        for (const { name, src } of helpers) {
            const re = new RegExp(`function\\s+${name}\\b[^{]*\\{`)
            const m = re.exec(src)
            expect(m, `${name} not found`).toBeTruthy()
            const start = m!.index + m![0].length
            let depth = 1
            let i = start
            while (i < src.length && depth > 0) {
                const c = src[i]
                if (c === '{') depth++
                else if (c === '}') depth--
                i++
            }
            const body = src.slice(start, i - 1)
            expect(body, `${name} must use worldPos !== null for narrowing`).toMatch(/worldPos\s*!==\s*null/)
            expect(body, `${name} must NOT use Boolean(worldPos) (doesn't narrow)`).not.toMatch(
                /Boolean\s*\(\s*worldPos\s*\)/
            )
        }
    })
})

/**
 * three-search-animations — typing contract test
 *
 * Lock-in: ensures the type-safety tightening pass on
 * three-search-animations.ts (W47) does not regress. Before this
 * pass the file had 16 `any` occurrences; after, 1 (the file-level
 * engine-boundary escape hatch that matches the same pattern used in
 * thread-inspector-webgl.ts).
 *
 * What this guards:
 *   1. any count is exactly 1 (the engine boundary escape hatch)
 *   2. The 5 trigger/update public functions use number params
 *      (anchorIndex, frameNow), not any
 *   3. The helper getCorridorPathPoints accepts Vector3, not any
 *   4. CorridorGlowState and CorridorAnimState interfaces are defined
 *   5. The private _corridorGlowNodes record is typed
 *      Record<number, CorridorGlowState | null>
 *   6. _corridorAnimState is typed (not any)
 *   7. _corridorAnimStartTime is typed number | null
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
const SRC_PATH = resolve(__dirname, '../../src/lib/engine/three-search-animations.ts')

function readSource(): string {
    return readFileSync(SRC_PATH, 'utf-8')
}

function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('three-search-animations — typing contract (W47 tightening)', () => {
    const src = readSource()
    const stripped = stripComments(src)

    it('has zero `any` occurrences (W48-Phase-3 tightened)', () => {
        // Strip comments so prose like "as any" in docstrings doesn't count.
        const matches = stripped.match(/: any\b| as any\b|<any>| any\[\]/g) ?? []
        // 0 = post-W48-Phase-3 (was 16 → 1). The remaining `_state as any`
        // engine-boundary escape hatch was tightened to typed appState access.
        expect(matches.length).toBe(0)
    })

    it('triggerSearchHeroMoment uses `number` for anchorIndex (not any)', () => {
        // Strip line comments + block comments to avoid matching prose
        const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
        const match = stripped.match(/export\s+function\s+triggerSearchHeroMoment\s*\(\s*anchorIndex\s*:\s*([^)]+)\)/)
        expect(match, 'function signature not found').toBeTruthy()
        expect(match![1].trim()).toBe('number')
    })

    it('triggerCorridorNodeGlow uses `number` for anchorIndex (not any)', () => {
        const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
        const match = stripped.match(/export\s+function\s+triggerCorridorNodeGlow\s*\(\s*anchorIndex\s*:\s*([^,)]+)/)
        expect(match, 'function signature not found').toBeTruthy()
        expect(match![1].trim()).toBe('number')
    })

    it('triggerSearchCorridorAnimation uses `number` for anchorIndex (not any)', () => {
        const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
        const match = stripped.match(
            /export\s+function\s+triggerSearchCorridorAnimation\s*\(\s*anchorIndex\s*:\s*([^,)]+)/
        )
        expect(match, 'function signature not found').toBeTruthy()
        expect(match![1].trim()).toBe('number')
    })

    it('updateCorridorNodeGlow uses `number` for frameNow (not any)', () => {
        const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
        const match = stripped.match(/export\s+function\s+updateCorridorNodeGlow\s*\(\s*frameNow\s*:\s*([^)]+)\)/)
        expect(match, 'function signature not found').toBeTruthy()
        expect(match![1].trim()).toBe('number')
    })

    it('updateSearchCorridorAnimation uses `number` for frameNow (not any)', () => {
        const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
        const match = stripped.match(
            /export\s+function\s+updateSearchCorridorAnimation\s*\(\s*frameNow\s*:\s*([^)]+)\)/
        )
        expect(match, 'function signature not found').toBeTruthy()
        expect(match![1].trim()).toBe('number')
    })

    it('getCorridorPathPoints accepts Vector3, not any', () => {
        const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
        const match = stripped.match(
            /function\s+getCorridorPathPoints\s*\(\s*anchorPos\s*:\s*([^,]+),\s*targetPos\s*:\s*([^,)]+)/
        )
        expect(match, 'function signature not found').toBeTruthy()
        expect(match![1].trim()).toBe('Vector3')
        expect(match![2].trim()).toBe('Vector3')
    })

    it('exports a CorridorGlowState interface with the 4 expected fields', () => {
        // The interface is a typed mirror of the per-node glow state.
        const match = src.match(/export\s+interface\s+CorridorGlowState\s*\{([\s\S]*?)\n\}/)
        expect(match, 'CorridorGlowState interface not found').toBeTruthy()
        const body = match![1]
        expect(body).toMatch(/startedAt\s*:\s*number/)
        expect(body).toMatch(/fadeStartDelay\s*:\s*number/)
        expect(body).toMatch(/fadeDuration\s*:\s*number/)
        expect(body).toMatch(/targetBoost\s*:\s*number/)
    })

    it('exports a CorridorAnimState interface with the 6 expected fields', () => {
        const match = src.match(/export\s+interface\s+CorridorAnimState\s*\{([\s\S]*?)\n\}/)
        expect(match, 'CorridorAnimState interface not found').toBeTruthy()
        const body = match![1]
        expect(body).toMatch(/anchorIndex\s*:\s*number/)
        expect(body).toMatch(/routeIndices\s*:\s*number\[\]/)
        expect(body).toMatch(/line\s*:\s*LineSegments/)
        expect(body).toMatch(/particles\s*:\s*Points\s*\|\s*null/)
        expect(body).toMatch(/material\s*:\s*ShaderMaterial/)
        expect(body).toMatch(/done\s*:\s*boolean/)
    })

    it('_corridorGlowNodes is typed Record<number, CorridorGlowState | null>', () => {
        const match = src.match(
            /const\s+_corridorGlowNodes\s*:\s*Record<number,\s*CorridorGlowState\s*\|\s*null>\s*=\s*\{\}/
        )
        expect(match, '_corridorGlowNodes type annotation not found').toBeTruthy()
    })

    it('_corridorAnimState is typed (not any)', () => {
        // Either `null | CorridorAnimState` or `CorridorAnimState | null` are both fine.
        const match = src.match(/let\s+_corridorAnimState\s*:\s*CorridorAnimState\s*\|\s*null\s*=\s*null/)
        expect(match, '_corridorAnimState type annotation not found').toBeTruthy()
    })

    it('_corridorAnimStartTime is typed number | null', () => {
        const match = src.match(/let\s+_corridorAnimStartTime\s*:\s*number\s*\|\s*null\s*=\s*null/)
        expect(match, '_corridorAnimStartTime type annotation not found').toBeTruthy()
    })
})

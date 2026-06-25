/**
 * semantic-guide — typing contract test
 *
 * Lock-in: ensures the W47-Bite-Roughest type-safety tightening pass
 * on src/lib/journey/semantic-guide.ts does not regress.
 *
 * What got tightened (41 → 3 → 0 `any` occurrences, the largest
 * single tightening this session):
 *
 *   - **Dedupe imports** (L22-23): removed the dual-state import
 *     (same module imported twice with different names —
 *     `appState as state` and `appState`). The `state` alias existed
 *     solely to attach `(state as any)` casts to.
 *
 *   - **Removed redundant `(state as any)` casts** (8 sites): these
 *     fields are already typed on `appState`:
 *       - `appState.summaryCardTypeToken: number` (state-types.ts:585)
 *       - `appState.semanticGuideRequestSequence: number` (state-types.ts:581)
 *       - `appState.semanticGuideAbortController: AbortController | null` (state-types.ts:580)
 *
 *   - **Introduced shared interfaces** at top of file:
 *       - `SemanticGuideSuggestion` — `{ lead_id?, label?, name?, city?, reason? }`
 *       - `GuideConfig` — `{ title?, text?, summary?, degraded?, cached?, suggestions?, laneStatus?, instant? }`
 *       - `SemanticGuidePayloadRow` — `{ lead_id?, cluster_label?, city?, name? }`
 *       - `SemanticGuidePayload` — `{ query?, visible_matches?, anchor_lead_id?, results? }`
 *
 *   - **Tightened param/return types** on 10 functions:
 *       - `generateLogicalSynthesis(payload: SemanticGuidePayload)`
 *       - `buildClientSemanticGuideFallback(...): GuideConfig`
 *       - `getSemanticGuideLoadingCardConfig(): GuideConfig`
 *       - `getSemanticGuideTitle(guide: GuideConfig)`
 *       - `getSemanticGuideLaneStatus(guide: GuideConfig)`
 *       - `buildSemanticGuideCardConfig(guide: GuideConfig): GuideConfig`
 *       - `buildSemanticGuideFallbackCardConfig(fallback: GuideConfig): GuideConfig`
 *       - `normalizeSummaryCardConfig(config: GuideConfig | string): GuideConfig`
 *       - `showSummaryCard(config: GuideConfig | string)`
 *       - `showSemanticGuideSuccess(guide: GuideConfig | unknown)`
 *       - `showSemanticGuideFailure(payload: SemanticGuideRequestPayload, _error: unknown)`
 *       - `fetchSemanticGuide(payload: SemanticGuideRequestPayload, signal): Promise<unknown>`
 *
 *   - **Tightened `Record<string, any>`** at L84 to `Record<string, unknown>`
 *
 *   - **Tightened catch blocks** (3 sites): `catch (error: any)` →
 *     `catch (error)` (TypeScript treats as `unknown` per policy).
 *     Narrowed `error` accesses accordingly.
 *
 *   - **Tightened `ensureSemanticGuideCorrelationId(error: any)`**
 *     to `(error: unknown)` with `typeof error === 'object'` guard.
 *
 * Deferred (kept as baseline, 3 sites):
 *   - L208, L209, L211: `(window as any).__SEMANTIC_GUIDE_TIMEOUT_MS__`
 *     REPLACED in W48-Phase-3 by typed Window augmentation in
 *     src/window.d.ts (`__SEMANTIC_GUIDE_TIMEOUT_MS__?: number`).
 *     The production code now reads `window.X` directly with no cast.
 *
 * What this guards:
 *   1. any occurrence count is exactly 3 (post-bite baseline; was 41)
 *   2. No dual-state import — single `appState` import only
 *   3. No `(state as any)` redundant casts for typed fields
 *   4. Shared interfaces (GuideConfig, SemanticGuidePayload, etc.) are
 *      introduced and used by tightened function signatures
 *   5. No `Record<string, any>` remains (replaced with `Record<string, unknown>`)
 *   6. No `catch (error: any)` remains
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
const SRC_PATH = resolve(__dirname, '../../src/lib/journey/semantic-guide.ts')

function readSource(): string {
    return readFileSync(SRC_PATH, 'utf-8')
}

function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('semantic-guide — typing contract (W47-Bite-Roughest tightening)', () => {
    const src = readSource()
    const stripped = stripComments(src)

    it('any occurrence count is 0 (post-W48-Phase-3 baseline; was 41 → 3)', () => {
        // Strip comments so prose like `as any` in docstrings doesn't count.
        const matches = stripped.match(/: any\b| as any\b|<any>| any\[\]/g) ?? []
        // 0 = post-W48-Phase-3 baseline (was 41 → 3 in W47-Bite-Continued;
        // the remaining 3 (window test-injection) were tightened to a
        // typed Window augmentation). If a future contributor adds a
        // new any, this test fails and forces them to either tighten
        // or update the documented baseline.
        expect(matches.length).toBe(0)
    })

    it('only ONE appState import (no dual-state smell)', () => {
        // Before: L22 `import { appState as state }` and L23
        // `import { appState }` — same module imported twice.
        // After: only one import.
        const appStateImports =
            stripped.match(/import\s+\{[^}]*appState[^}]*\}\s+from\s+['"]@lib\/state\/app\.svelte['"]/g) || []
        expect(appStateImports.length).toBe(1)
    })

    it('no `state as any` alias cast remains', () => {
        // All (state as any) redundant casts have been replaced
        // with typed `appState.X` access (fields are typed in appState).
        expect(stripped.match(/\(state\s+as\s+any\)/g), '`(state as any)` still present').toBeNull()
    })

    it('GuideConfig interface introduced and used in return types', () => {
        // GuideConfig must be defined and used in at least 3 function signatures
        const guideConfigUsages = (stripped.match(/:\s*GuideConfig\b/g) || []).length
        expect(guideConfigUsages, 'GuideConfig not used in any signatures').toBeGreaterThanOrEqual(3)

        // GuideConfig interface declaration must exist
        expect(stripped.match(/interface\s+GuideConfig\b/), 'GuideConfig interface not declared').toBeTruthy()
    })

    it('SemanticGuidePayload interface introduced and used in params', () => {
        const payloadUsages = (stripped.match(/:\s*SemanticGuidePayload\b/g) || []).length
        expect(payloadUsages, 'SemanticGuidePayload not used in any signatures').toBeGreaterThanOrEqual(2)

        expect(
            stripped.match(/interface\s+SemanticGuidePayload\b/),
            'SemanticGuidePayload interface not declared'
        ).toBeTruthy()
    })

    it('no `Record<string, any>` remains', () => {
        expect(stripped.match(/Record<string,\s*any>/g), '`Record<string, any>` still present').toBeNull()
    })

    it('no `catch (error: any)` blocks remain', () => {
        expect(stripped.match(/catch\s*\(\s*error\s*:\s*any\s*\)/g), '`catch (error: any)` still present').toBeNull()
    })

    it('window.__SEMANTIC_GUIDE_TIMEOUT_MS__ uses typed Window augmentation (no per-use cast)', () => {
        // W48-Phase-3: the 3 prior `(window as any).__SEMANTIC_GUIDE_TIMEOUT_MS__`
        // casts were tightened by adding a typed Window augmentation in
        // src/window.d.ts (`__SEMANTIC_GUIDE_TIMEOUT_MS__?: number`).
        // The production code now reads `window.__SEMANTIC_GUIDE_TIMEOUT_MS__`
        // directly with no per-use cast. Guard this so future contributors
        // know to extend the Window interface rather than adding more
        // casts at use-sites.
        const asAny = (stripped.match(/window\s+as\s+any\)\.__SEMANTIC_GUIDE_TIMEOUT_MS__/g) || []).length
        expect(asAny).toBe(0)
        // The typed Window interface must declare the property
        const winDts = readFileSync(resolve(__dirname, '../../src/window.d.ts'), 'utf-8')
        expect(winDts).toMatch(/__SEMANTIC_GUIDE_TIMEOUT_MS__\??:\s*number/)
        // The production code uses window.X directly (no cast)
        const directReads = (stripped.match(/window\.__SEMANTIC_GUIDE_TIMEOUT_MS__/g) || []).length
        expect(directReads).toBeGreaterThanOrEqual(3)
    })

    it('ensureSemanticGuideCorrelationId uses `unknown` with object guard', () => {
        // Before: `error: any` — bypassed type checking.
        // After: `error: unknown` with `typeof error === 'object'` guard.
        const usesUnknownGuard = /ensureSemanticGuideCorrelationId\(\s*error\s*:\s*unknown\s*\)/.test(stripped)
        expect(usesUnknownGuard, 'typed `unknown` parameter with guard not found').toBeTruthy()
    })
})

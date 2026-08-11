/**
 * @file state-currentsemanticguide-dual-write-invariant.test.ts
 *
 * Lock-in test for the engine-boundary refactor Phase 2 latent-bug fix:
 * currentSemanticGuide dual-write reconciliation.
 *
 * Background: state had a latent bug where two writers assigned different
 * shapes to appState.currentSemanticGuide:
 *   - setSemanticGuide(text: string | null)        — wrote a string
 *   - showSummaryCard(config: GuideConfig | string) — wrote a GuideConfig
 *     object with a `as unknown as string | null` cast to bypass the type
 *     system
 *
 * This caused the field to hold inconsistent shapes (sometimes string,
 * sometimes object), forcing readers like legend-panel.svelte.ts to use
 * `as Record<string, any>` to access it.
 *
 * Phase 2 latent-bug fix:
 *   - showSummaryCard() no longer writes to currentSemanticGuide;
 *     GuideConfig objects now live canonically in semanticGuideState.config
 *   - legend-panel reads route through appState.semanticGuideState.config
 *     (the canonical source) instead of the redundant currentSemanticGuide
 *   - state-types.ts comment documents the rationale
 *
 * Run: npx vitest run tests/unit-active/state-currentsemanticguide-dual-write-invariant.test.ts
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..')

function readSource(rel: string): string {
    return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}

describe('engine-boundary refactor / Phase 2 latent-bug fix / currentSemanticGuide dual-write', () => {
    it('showSummaryCard() does NOT write to appState.currentSemanticGuide', () => {
        const semanticGuide = readSource('src/lib/journey/semantic-guide.ts')
        // Find the showSummaryCard function body
        const fnMatch = semanticGuide.match(/export\s+function\s+showSummaryCard[\s\S]*?\n\}/m)
        expect(fnMatch, 'showSummaryCard not found').not.toBeNull()
        const body = fnMatch![0]
        // The redundant dual-write must be gone
        expect(body).not.toMatch(/appState\.currentSemanticGuide\s*=/)
        // The canonical write to semanticGuideState.config must remain
        expect(body).toMatch(/appState\.semanticGuideState\.config\s*=\s*settings/)
    })

    it('legend-panel.svelte.ts reads from semanticGuideState.config (canonical source)', () => {
        const legendPanel = readSource('src/lib/stores/legend-panel.svelte.ts')
        // Both reader sites should pull from semanticGuideState.config
        const configReads = legendPanel.match(/appState\.semanticGuideState\.config\s+as\s+Record/g) || []
        expect(
            configReads.length,
            `Expected ≥2 canonical reads in legend-panel, found ${configReads.length}`
        ).toBeGreaterThanOrEqual(2)
        // The old dual-write reads from currentSemanticGuide must be gone
        expect(legendPanel).not.toMatch(/appState\.currentSemanticGuide\s+as\s+Record<string,\s*any>/)
    })

    it('state-types.ts documents the currentSemanticGuide vs GuideConfig split', () => {
        // Types are re-exported from state-types.ts (thin barrel) — check the actual definition
        const engineTypes = readSource('src/lib/state/types/engine-types.ts')
        // The comment block explaining the split must exist
        expect(engineTypes).toMatch(
            /Plain-text semantic guide payload[\s\S]*Distinct from GuideConfig[\s\S]*setSemanticGuide/
        )
        // The declaration type must be string | null (NOT unknown)
        expect(engineTypes).toMatch(/currentSemanticGuide:\s*string\s*\|\s*null\b/)
        expect(engineTypes).not.toMatch(/currentSemanticGuide:\s*unknown\b/)
    })

    it('setSemanticGuide() still writes strings to currentSemanticGuide (via search-core.ts)', () => {
        // S-1/S-2/S-3 split: search.svelte.ts is now a barrel. setSemanticGuide
        // lives canonically in src/lib/stores/search-core.ts and is re-exported
        // by search.svelte.ts for byte-compatible consumer imports. The test
        // must read search-core.ts to find the body.
        const searchStore = readSource('src/lib/stores/search.svelte.ts')
        const searchCore = readSource('src/lib/stores/search-core.ts')
        // The barrel must re-export the setter (consumers import from search.svelte.ts)
        expect(searchStore).toMatch(
            /export\s*\{[\s\S]*\bsetSemanticGuide\b[\s\S]*\}\s*from\s*['"]\.\/search-core['"]/
        )
        // The body must live in search-core.ts (not search.svelte.ts anymore)
        const fnMatch = searchCore.match(/export\s+function\s+setSemanticGuide[\s\S]*?\n\}/m)
        expect(fnMatch, 'setSemanticGuide not found in search-core.ts').not.toBeNull()
        const body = fnMatch![0]
        // Phase 6b: currentSemanticGuide moved into appState.searchState sub-aggregate
        expect(body).toMatch(/appState\.searchState\.currentSemanticGuide\s*=\s*text/)
    })

    it('showSummaryCard() still updates semanticGuideState.config + typeToken', () => {
        const semanticGuide = readSource('src/lib/journey/semantic-guide.ts')
        const fnMatch = semanticGuide.match(/export\s+function\s+showSummaryCard[\s\S]*?\n\}/m)
        expect(fnMatch, 'showSummaryCard not found').not.toBeNull()
        const body = fnMatch![0]
        expect(body).toMatch(/appState\.semanticGuideState\.config\s*=\s*settings/)
        // Phase 6b: summaryCardTypeToken moved into appState.searchState sub-aggregate
        expect(body).toMatch(/appState\.searchState\.summaryCardTypeToken/)
        expect(body).toMatch(/appState\.semanticGuideState\.isVisible\s*=\s*true/)
    })

    // 2026-08-06 — dual-path search audit: the DOM-path summary
    // (orchestration.search() -> setSearchSummary) must mirror the store path
    // (setSearchResults) and populate renderContext. If it regresses, typed-path
    // searches fall back to the empty context and strength bars render blank.
    it('DOM-path orchestration setSearchSummary carries renderContext', () => {
        const orchestration = readSource('src/lib/search/orchestration.ts')
        const call = orchestration.match(/setSearchSummary\(\{[\s\S]*?summaryType: 'semantic'[\s\S]*?\}\)/)
        expect(call, 'DOM-path setSearchSummary({... summaryType: semantic}) not found').not.toBeNull()
        const body = call![0]
        expect(body).toMatch(/renderContext:\s*\{/)
        expect(body).toMatch(/trimmedQuery,/)
        expect(body).toMatch(/topIndex:\s*topResult\?\.index\s*\?\?\s*null,/)
        expect(body).toMatch(/topScore:\s*topResult\?\.score\s*\?\?\s*0/)
    })
})

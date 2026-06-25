/**
 * @file selected-card-point-typing-contract.test.ts
 *
 * Lock-in test for the W47-Bite-Continued (consumer-side) tightening of
 * src/lib/journey/selected-card.ts (15 → 10 any occurrences).
 *
 * Patterns tightened (7 sites, 5 net any removed):
 *
 *   - `(point: any)` callback parameter (L62) → `(point: Point)`
 *     in SelectedCardAdapter.hydrateLeadContext interface
 *
 *   - `(payload: any)` callback parameter (L100) → typed payload
 *     with point?: unknown + options?: UpdateSelectedBusinessOptions
 *     (matches the actual EXPLORATION_FOCUS_SYNC event payload shape)
 *
 *   - `function syncFocusStage(point: any)` (L117) → `function syncFocusStage(point: Point | null)`
 *
 *   - `const points: any[]` (L118) → `const points: Point[]`
 *
 *   - `const presentation: any = getBusinessNamePresentation(...)` (L229) →
 *     `const presentation: BusinessNamePresentation = ...`
 *
 *   - `function updateSelectedBusiness(point: any, ...)` (L248) →
 *     `function updateSelectedBusiness(point: Point | null, ...)`
 *
 *   - `const namePresentation: any` (L298) → typed
 *
 * Added 1 cast for pre-existing Point vs BusinessRecord mismatch at L253:
 *   - `focusOnPoint(point, ...)` expects `BusinessRecord | null` but we have `Point | null`
 *     - Cast: `as unknown as Parameters<typeof focusOnPoint>[0]`
 *     - Documents intent; pre-existing type mismatch unchanged at runtime
 *
 * Preserved (require module-level Map refactor to tighten):
 *   - 5x `(stage as any)._focusStageKeydownListener` — DOM property storage
 *   - 1x `(onboardingHint as any)._dismissedThisSession`
 *   - 2x `(onboardingHint as any)._autoHideTimer`
 *
 * Run: npx vitest run tests/unit-active/selected-card-point-typing-contract.test.ts
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..')

function readSource(rel: string): string {
    return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}

function countAnyOccurrences(source: string): number {
    const matches = source.match(/:\s*any\b|\bas\s+any\b|\bas\s+unknown\s+as\b/g) || []
    return matches.length
}

describe('W47-Bite-Continued / selected-card.ts / point typing', () => {
    it('any count is reduced from 15 baseline to ≤10 (post-tightening baseline)', () => {
        const source = readSource('src/lib/journey/selected-card.ts')
        const count = countAnyOccurrences(source)
        expect(count, `selected-card.ts has ${count} any occurrences (lock-in target ≤10)`).toBeLessThanOrEqual(10)
    })

    it('SelectedCardAdapter.hydrateLeadContext uses Point (not any)', () => {
        const source = readSource('src/lib/journey/selected-card.ts')
        expect(source).toMatch(/hydrateLeadContext:\s*\(point:\s*Point,\s*options\?:/)
        expect(source).not.toMatch(/hydrateLeadContext:\s*\(point:\s*any,/)
    })

    it('EXPLORATION_FOCUS_SYNC subscribeKeyed callback uses typed payload', () => {
        const source = readSource('src/lib/journey/selected-card.ts')
        // Typed payload (no any)
        expect(source).not.toMatch(/EXPLORATION_FOCUS_SYNC,\s*\(payload:\s*any\)/)
        // Has a typed payload signature
        expect(source).toMatch(/EXPLORATION_FOCUS_SYNC,\s*\(payload:\s*\{[^}]*point[^}]*\}/)
    })

    it('syncFocusStage function signature uses Point | null', () => {
        const source = readSource('src/lib/journey/selected-card.ts')
        expect(source).toMatch(/export\s+function\s+syncFocusStage\(point:\s*Point\s*\|\s*null\)/)
        expect(source).not.toMatch(/export\s+function\s+syncFocusStage\(point:\s*any\)/)
    })

    it('syncFocusStage uses typed points: Point[] (not any[])', () => {
        const source = readSource('src/lib/journey/selected-card.ts')
        // In syncFocusStage, the points local should be typed
        const fn = source.match(/function\s+syncFocusStage[\s\S]*?\n\}/m)
        expect(fn, 'syncFocusStage not found').not.toBeNull()
        const body = fn![0]
        expect(body).toMatch(/const\s+points:\s*Point\[\]\s*=/)
        expect(body).not.toMatch(/const\s+points:\s*any\[\]/)
    })

    it('updateSelectedBusiness function signature uses Point | null', () => {
        const source = readSource('src/lib/journey/selected-card.ts')
        expect(source).toMatch(/export\s+function\s+updateSelectedBusiness\(point:\s*Point\s*\|\s*null,/)
        expect(source).not.toMatch(/export\s+function\s+updateSelectedBusiness\(point:\s*any,/)
    })

    it('presentation locals use BusinessNamePresentation (not any)', () => {
        const source = readSource('src/lib/journey/selected-card.ts')
        expect(source).toMatch(/const\s+presentation:\s*BusinessNamePresentation\s*=/)
        expect(source).toMatch(/const\s+namePresentation:\s*BusinessNamePresentation\s*=/)
        // No presentation: any should remain
        expect(source).not.toMatch(/const\s+presentation:\s*any\s*=/)
        expect(source).not.toMatch(/const\s+namePresentation:\s*any\s*=/)
    })

    it('Point and BusinessNamePresentation types are imported', () => {
        const source = readSource('src/lib/journey/selected-card.ts')
        expect(source).toMatch(/import\s+type\s*\{[^}]*\bPoint\b[^}]*\}\s+from\s+['"][^'"]*state-types['"]/)
        expect(source).toMatch(/import\s+type\s*\{[^}]*\bBusinessNamePresentation\b[^}]*\}\s+from\s+['"][^'"]*dom-formatters['"]/)
    })

    it('focusOnPoint call uses Parameters<...> cast (documents pre-existing mismatch)', () => {
        const source = readSource('src/lib/journey/selected-card.ts')
        expect(source).toMatch(/focusOnPoint\(point\s+as\s+unknown\s+as\s+Parameters<typeof\s+focusOnPoint>\[0]/)
    })

    it('preserved: DOM property storage (stage/onboardingHint) — needs Map refactor', () => {
        // These can't be tightened without converting to module-level Maps
        const source = readSource('src/lib/journey/selected-card.ts')
        expect(source).toMatch(/\(stage\s+as\s+any\)\._focusStageKeydownListener/)
        expect(source).toMatch(/\(onboardingHint\s+as\s+any\)\._dismissedThisSession/)
        expect(source).toMatch(/\(onboardingHint\s+as\s+any\)\._autoHideTimer/)
    })
})
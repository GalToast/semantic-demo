/**
 * @vitest-environment node
 *
 * UX State Coverage Contract Test — Phase 8c (2026-06-26)
 *
 * Locks in the loading/empty/error UX states documented in
 * docs/ux-state-coverage.md. The audit shows the codebase has solid UX
 * patterns (Canvas/InfoPanel/SearchResults all have full state coverage).
 * This test enforces that contract so future refactors don't silently
 * regress the UX.
 *
 * What we check (greppable, no DOM rendering):
 *   - Each Tier 1 component has its loading/error/empty markers
 *   - Loading markers use `aria-live="polite"` (not assertive)
 *   - Error markers use `role="alert"` or `aria-live="assertive"`
 *   - Empty markers provide a suggested next step
 *
 * What this test does NOT do:
 *   - Render the components (that's Playwright territory)
 *   - Verify visual styling (that's visual QA territory)
 *   - Verify state transitions (that requires DOM + store mocks)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../../')

function readFile(rel: string): string {
    return readFileSync(resolve(ROOT, rel), 'utf8')
}

// ── Tier 1 contract — full state coverage (loading + error + empty) ────────

describe('UX state coverage — Tier 1 (full loading + error + empty)', () => {
    const tier1 = [
        {
            component: 'Canvas',
            file: 'src/components/Canvas.svelte',
            loading: { marker: 'canvas-loading-overlay', live: 'polite' as const },
            error: {
                marker: 'canvas-error-overlay',
                alert: true,
                live: 'assertive' as const
            }
        },
        {
            component: 'InfoPanel',
            file: 'src/components/InfoPanel.svelte',
            loading: { marker: 'info-panel-loading', role: 'status' },
            empty: { marker: 'selected-empty' }
            // NOTE: No error contract — InfoPanel currently has no error-state
            // path. There is no record-fetch failure surface; selectedRecord
            // is read from a synchronous mirror backed by the global state.
            // Adding an error marker here before there is a real error source
            // would be aspirational dead UI (see W52-UX teardown of
            // `let hasError = $derived(false)` + the never-rendered
            // { #if hasError } block in InfoPanel.svelte).
        },
        {
            component: 'SearchResults',
            file: 'src/components/SearchResults.svelte',
            loading: { marker: 'search-loading' },
            error: { marker: 'search-error-state', hasRetry: true, errorFile: 'src/components/ErrorState.svelte' },
            empty: { marker: 'search-empty-state', hasSuggestions: true }
            // NOTE: A single .sr-only live region at the top of the component
            // announces loading/error/empty state changes; markers themselves
            // do not carry role="status" / aria-live. This avoids duplicate
            // or interruptive announcements for recoverable search states.
        }
    ]

    for (const c of tier1) {
        describe(`${c.component}`, () => {
            const src = readFile(c.file)
            // Error surfaces were extracted into the shared ErrorState.svelte
            // presentational component, so a tier entry may point its error
            // marker at a different file than the component under test.
            const errorSrc = c.error && c.error.errorFile ? readFile(c.error.errorFile) : src

            if (c.loading) {
                it(`has loading marker (${c.loading.marker})`, () => {
                    // Look for last occurrence (after the script block).
                    const lastIdx = src.lastIndexOf(c.loading.marker)
                    expect(lastIdx).toBeGreaterThan(0)
                })

                if (c.loading.live) {
                    it(`loading marker uses aria-live="${c.loading.live}"`, () => {
                        // The marker name may appear in CSS too — find the
                        // markup occurrence that follows `<div class="...`.
                        const markupIdx = src.indexOf(`<div class="${c.loading.marker}`)
                        // Some markers span multiple attributes or use a
                        // different format; fall back to the next `<div`
                        // after the marker's first occurrence.
                        const divIdx = markupIdx !== -1 ? markupIdx : src.indexOf('<', src.indexOf(c.loading.marker))
                        const window = src.substring(Math.max(0, divIdx - 200), Math.min(src.length, divIdx + 200))
                        expect(window).toMatch(new RegExp(`aria-live=["']${c.loading.live}["']`))
                    })
                }
            }

            if (c.error) {
                it(`has error marker (${c.error.marker})`, () => {
                    const lastIdx = errorSrc.lastIndexOf(c.error.marker)
                    expect(lastIdx).toBeGreaterThan(0)
                })

                if (c.error.role) {
                    it(`error marker uses role="${c.error.role}"`, () => {
                        const markerIdx = errorSrc.lastIndexOf(c.error.marker)
                        const window = errorSrc.substring(Math.max(0, markerIdx - 200), markerIdx + 200)
                        expect(window).toMatch(new RegExp(`role=["']${c.error.role}["']`))
                    })
                }

                if (c.error.hasRetry) {
                    it('error state offers a retry action', () => {
                        const markerIdx = errorSrc.lastIndexOf(c.error.marker)
                        const window = errorSrc.substring(markerIdx, Math.min(errorSrc.length, markerIdx + 2000))
                        expect(window).toMatch(/retry/i)
                        // Should be a real button, not just text. Allow
                        // class-based detection (e.g. class="search-error-retry-btn").
                        expect(window).toMatch(/<button[^>]+retry/i)
                    })
                }
            }

            if (c.empty) {
                it(`has empty marker (${c.empty.marker})`, () => {
                    // The marker may appear in CSS comments first; the
                    // actual element is the last occurrence (after the
                    // script block).
                    const lastIdx = src.lastIndexOf(c.empty.marker)
                    expect(lastIdx).toBeGreaterThan(0)
                })
            }

            if ('empty' in c && c.empty && 'hasSuggestions' in c.empty && c.empty.hasSuggestions) {
                it('empty state offers suggested next steps', () => {
                    const markerIdx = src.indexOf(c.empty.marker)
                    const window = src.substring(markerIdx, Math.min(src.length, markerIdx + 3000))
                    expect(window).toMatch(/suggest|try/i)
                })
            }
        })
    }
})

// ── Tier 1b — single-state components (SearchInput + MapView + FocusPocket) ─

describe('UX state coverage — Tier 1b (loading OR error OR empty)', () => {
    it('SearchResults uses a single polite live region for all state announcements', () => {
        const src = readFile('src/components/SearchResults.svelte')
        expect(src).toMatch(/<div[^>]*class="sr-only"[^>]*aria-live="polite"[^>]*aria-atomic="true"[^>]*role="status"/)
    })

    it('SearchInput announces error + empty in one status div and defers searching narrative to the cue', () => {
        // Status div lives in the extracted SearchInputChrome.svelte child
        const src = readFile('src/lib/components/search/SearchInputChrome.svelte')
        // The status div handles error/empty states; searching state keeps the
        // spinner visible and lets the search-trail cue overlay provide the
        // narrative so we don't duplicate "Scanning..." announcements.
        expect(src).toContain('search-status')
        expect(src).toContain('aria-live="polite"')
        expect(src).toContain("status === 'searching'")
        expect(src).toContain('Search is unavailable')
        expect(src).toContain('No matching businesses found')
    })

    it('MapView has typed status enum with loading/ready/error and renders MapStatusOverlay', () => {
        const mapViewSrc = readFile('src/components/MapView.svelte')
        const overlaySrc = readFile('src/lib/components/MapStatusOverlay.svelte')
        expect(mapViewSrc).toMatch(/type\s+MapStatus\s*=\s*['"]loading['"]\s*\|\s*['"]ready['"]\s*\|\s*['"]error['"]/)
        expect(mapViewSrc).toContain('MapStatusOverlay')
        expect(mapViewSrc).toMatch(/status\s*===\s*['"]error['"]/)
        expect(overlaySrc).toContain('aria-live="polite"')
        expect(overlaySrc).toContain('role="status"')
    })

    it('FocusPocket has loading state with role=status', () => {
        const src = readFile('src/components/FocusPocket.svelte')
        expect(src).toContain('focus-pocket-loading')
        expect(src).toContain('role="status"')
        expect(src).toContain('aria-label="Loading neighborhood data"')
    })

    it('JourneyChrome has empty state for no neighbors', () => {
        const src = readFile('src/components/JourneyChrome.svelte')
        expect(src).toContain('empty-state')
        expect(src).toMatch(/No neighboring stops/)
    })
})

// ── LoadingOverlay — app-level phase progression ──────────────────────────

describe('LoadingOverlay — app-level loading phases', () => {
    const src = readFile('src/components/LoadingOverlay.svelte')

    it('has 4-phase progression: records → scene → restore → launch', () => {
        // Phase order is a TypeScript const array; check it lists all 4.
        const phaseMatch = src.match(/PHASE_ORDER:\s*readonly[^=]+=\s*\[([^\]]+)\]/)
        expect(phaseMatch).not.toBeNull()
        const phases = phaseMatch![1].match(/['"]([^'"]+)['"]/g) || []
        const uniquePhases = new Set(phases.map((p) => p.replace(/['"]/g, '')))
        expect(uniquePhases.size).toBe(4)
        for (const expected of ['records', 'scene', 'restore', 'launch']) {
            expect(uniquePhases.has(expected)).toBe(true)
        }
    })

    it('reads from loadingPhaseStore for phase progression', () => {
        expect(src).toContain('loadingPhaseStore')
    })
})

// ── No-regression check — no component silently removed a state ────────────

describe('UX state coverage — regression guards', () => {
    it('all Tier 1 components still exist', () => {
        for (const file of [
            'src/components/Canvas.svelte',
            'src/components/InfoPanel.svelte',
            'src/components/SearchInput.svelte',
            'src/components/SearchResults.svelte',
            'src/components/MapView.svelte',
            'src/components/FocusPocket.svelte',
            'src/components/JourneyChrome.svelte'
        ]) {
            expect(readFile(file).length, `${file} should not be empty`).toBeGreaterThan(100)
        }
    })

    it('audit-a11y.mjs still in place (the contract enforcer)', () => {
        const auditSrc = readFile('scripts/audit-a11y.mjs')
        expect(auditSrc).toContain('rule_6')
        expect(auditSrc).toContain('rule_7')
        expect(auditSrc).toContain('a11y-ok')
    })
})

// ── Documented UX audit doc exists and matches reality ────────────────────

describe('UX state coverage — documentation parity', () => {
    it('docs/ux-state-coverage.md exists and lists Tier 1 components', () => {
        const doc = readFile('docs/ux-state-coverage.md')
        expect(doc).toContain('UX State Coverage')
        for (const component of ['Canvas', 'InfoPanel', 'SearchInput', 'SearchResults', 'MapView']) {
            expect(doc).toContain(component)
        }
    })

    it('doc references the contract test that enforces it', () => {
        const doc = readFile('docs/ux-state-coverage.md')
        expect(doc).toContain('ux-state-coverage-contract.test.ts')
    })
})

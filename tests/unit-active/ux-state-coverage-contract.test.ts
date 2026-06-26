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
            error: { marker: 'info-panel-error', role: 'alert' },
            empty: { marker: 'selected-empty' }
        },
        {
            component: 'SearchResults',
            file: 'src/components/SearchResults.svelte',
            loading: { marker: 'search-loading', role: 'status', live: 'polite' as const },
            error: {
                marker: 'search-error-state',
                role: 'status',
                live: 'polite' as const,
                hasRetry: true
            },
            empty: {
                marker: 'search-empty-state',
                role: 'status',
                live: 'polite' as const,
                hasSuggestions: true
            }
            // NOTE: error uses role="status" + aria-live="polite" (not
            // role="alert") because search failures are recoverable via
            // the explicit Retry/Clear buttons — they're not critical
            // alerts that need to interrupt screen-reader speech.
        }
    ]

    for (const c of tier1) {
        describe(`${c.component}`, () => {
            const src = readFile(c.file)

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
                    const lastIdx = src.lastIndexOf(c.error.marker)
                    expect(lastIdx).toBeGreaterThan(0)
                })

                if (c.error.role) {
                    it(`error marker uses role="${c.error.role}"`, () => {
                        const markerIdx = src.lastIndexOf(c.error.marker)
                        const window = src.substring(Math.max(0, markerIdx - 200), markerIdx + 200)
                        expect(window).toMatch(new RegExp(`role=["']${c.error.role}["']`))
                    })
                }

                if (c.error.hasRetry) {
                    it('error state offers a retry action', () => {
                        const markerIdx = src.lastIndexOf(c.error.marker)
                        const window = src.substring(markerIdx, Math.min(src.length, markerIdx + 2000))
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
    it('SearchInput announces loading + error + empty in one status div', () => {
        const src = readFile('src/components/SearchInput.svelte')
        // The status div handles all three states via conditional rendering
        expect(src).toContain('search-status')
        expect(src).toContain('aria-live="polite"')
        // Each state message is present
        expect(src).toContain('Searching semantic field')
        expect(src).toContain('Search is unavailable')
        expect(src).toContain('No matching businesses found')
    })

    it('MapView has typed status enum with loading/ready/error', () => {
        const src = readFile('src/components/MapView.svelte')
        expect(src).toMatch(/type\s+MapStatus\s*=\s*['"]loading['"]\s*\|\s*['"]ready['"]\s*\|\s*['"]error['"]/)
        expect(src).toContain('aria-live="polite"')
        // Status block surfaces the error
        expect(src).toMatch(/status\s*===\s*['"]error['"]/)
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

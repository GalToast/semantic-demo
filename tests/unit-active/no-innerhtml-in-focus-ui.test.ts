/**
 * focus-ui — innerHTML lock-in test (W47 innerHTML XSS audit)
 *
 * Locks in the W47 innerHTML XSS audit on src/lib/journey/focus-ui.ts.
 * The audit removed 8 innerHTML sites and replaced them with DOM API:
 *   - 5× `list.innerHTML = ''` / `breadcrumb.innerHTML = ''` →
 *     `textContent = ''` (idiomatic empty reset)
 *   - 1× static empty-state HTML → DOM API (replaceChildren + createElement)
 *   - 1× button template → DOM API (createElement + textContent for each child)
 *   - 1× breadcrumb template → DOM API (also eliminated the post-render
 *     querySelectorAll by wiring onclick directly during chip creation)
 *
 * Pattern mirrors tests/unit-active/no-ungated-console-calls.test.ts (Bite A).
 * This test enforces the new contract: focus-ui.ts must not use innerHTML.
 *
 * Rationale: `innerHTML` is a slop-pattern flagged by the harness. Even
 * when all dynamic content is `escapeHtml`-wrapped, the audit rule cannot
 * reason about content safety — only structural patterns. The codebase
 * pattern (legend-panel.svelte.ts, app-init.ts, loading.ts) is to use
 * DOM API everywhere. This lock-in makes that pattern self-enforcing.
 *
 * Scope: ONLY src/lib/journey/focus-ui.ts. Other files (selected-card,
 * view-controller) still have innerHTML and are tracked separately.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const SRC_PATH = resolve(__dirname, '../../src/lib/journey/focus-ui.ts')

function readSource(): string {
    return readFileSync(SRC_PATH, 'utf-8')
}

function stripComments(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
}

describe('focus-ui — no innerHTML (W47 XSS-audit lock-in)', () => {
    const src = readSource()
    const stripped = stripComments(src)

    it('zero innerHTML occurrences in focus-ui.ts', () => {
        // The audit removed 8 innerHTML sites. This test guards against
        // regressions — any new innerHTML call must fail and force the
        // contributor to use DOM API instead.
        const matches = stripped.match(/\.innerHTML\b/g) ?? []
        expect(matches.length, 'innerHTML present in focus-ui.ts').toBe(0)
    })

    it('zero outerHTML occurrences in focus-ui.ts (defensive)', () => {
        // outerHTML is the same XSS risk as innerHTML. Guard against
        // either being reintroduced.
        const matches = stripped.match(/\.outerHTML\b/g) ?? []
        expect(matches.length, 'outerHTML present in focus-ui.ts').toBe(0)
    })

    it('uses replaceChildren() for DOM clearing (DOM API pattern)', () => {
        // The post-bite pattern is: list.replaceChildren() then appendChild.
        // Verify both are used (this is the codebase pattern from
        // legend-panel.svelte.ts and loading.ts).
        expect(stripped.match(/\.replaceChildren\(\)/g), 'replaceChildren() not used').toBeTruthy()
        expect(stripped.match(/\.appendChild\(/g), 'appendChild not used').toBeTruthy()
    })

    it('button creation uses createElement + textContent (not template literal)', () => {
        // The L198 button template was refactored to createElement.
        // Verify the pattern is used (any createElement + textContent combo).
        const createElementCount = (stripped.match(/document\.createElement\(/g) || []).length
        expect(createElementCount, 'createElement not used in focus-ui.ts').toBeGreaterThanOrEqual(5)

        const textContentCount = (stripped.match(/\.textContent\s*=/g) || []).length
        expect(textContentCount, 'textContent assignments not used').toBeGreaterThanOrEqual(5)
    })

    it('breadcrumb chips use direct onclick (no post-render querySelectorAll)', () => {
        // The L354 breadcrumb refactor eliminated the post-render
        // querySelectorAll by wiring onclick directly during chip creation.
        // This is a code-quality win, not just an XSS win.
        const hasDirectOnclick = /\.onclick\s*=\s*\(\)\s*=>/.test(stripped)
        expect(hasDirectOnclick, 'chip.onclick direct wiring not found').toBeTruthy()

        const hasPostRenderQuery = /breadcrumb\.querySelectorAll\(/.test(stripped)
        expect(!hasPostRenderQuery, 'post-render querySelectorAll still present').toBe(true)
    })

    it('does not import DOMPurify (no third-party dependency added)', () => {
        // The lock-in test should not depend on any new dependency.
        // If DOMPurify is added later, this test needs to be updated.
        expect(/from\s+['"]dompurify['"]/i.test(stripped), 'DOMPurify import found').toBe(false)
    })
})
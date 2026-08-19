/**
 * Codebase-wide — no innerHTML / outerHTML lock-in test
 *
 * Locks in the W47 innerHTML XSS audit completion:
 *   - Bite XSS (focus-ui.ts): 8 innerHTML sites removed
 *   - Follow-up bites: selected-card.ts (1), view-controller.ts (1)
 *
 * After these bites, the entire src/ tree has ZERO innerHTML/outerHTML
 * usage. This test enforces that contract.
 *
 * Why codebase-wide (not per-file like no-innerhtml-in-focus-ui.test.ts):
 *   - The [slop] rule is structural; any .innerHTML usage anywhere in src/
 *     fires the rule and reopens the XSS surface.
 *   - The codebase pattern is established (legend-panel, app-init, loading,
 *     focus-ui, selected-card, view-controller all use DOM API).
 *   - A single test catches future regressions across the codebase.
 *
 * What this test does:
 *   1. Walks all .ts and .svelte files in src/
 *   2. Strips comments (allows "no innerHTML" discussion comments)
 *   3. Asserts no `.innerHTML`, no `.outerHTML`, no `insertAdjacentHTML`
 *      in non-comment code
 *
 * What this test allows:
 *   - String literals that contain `<svg>` markup (semanticGuideIcon
 *     returns a string but doesn't ASSIGN to innerHTML)
 *   - Comments discussing innerHTML strategy (stripped before check)
 *   - Test files in tests/ directory (out of scope — they're test fixtures)
 *
 * Pattern mirrors tests/unit-active/no-ungated-console-calls.test.ts
 * (Bite A) and tests/unit-active/no-innerhtml-in-focus-ui.test.ts
 * (Bite XSS-Audit). Self-enforcing structural contract test.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC_ROOT = join(__dirname, '../../src')

function walk(dir: string, out: string[] = []): string[] {
    let entries: string[]
    try {
        entries = readdirSync(dir)
    } catch {
        return out
    }
    for (const entry of entries) {
        const full = join(dir, entry)
        let st
        try {
            st = statSync(full)
        } catch {
            continue
        }
        if (st.isDirectory()) {
            walk(full, out)
        } else if (entry.endsWith('.ts') || entry.endsWith('.svelte')) {
            out.push(full)
        }
    }
    return out
}

function stripComments(src: string): string {
    return src
        // Block comments /* ... */
        .replace(/\/\*[\s\S]*?\*\//g, '')
        // Line comments // ...
        .replace(/\/\/.*$/gm, '')
        // HTML comments <!-- ... -->
        .replace(/<!--[\s\S]*?-->/g, '')
}

describe('codebase-wide — no innerHTML / outerHTML / insertAdjacentHTML', () => {
    const files = walk(SRC_ROOT)
    const offenders: { file: string; pattern: string; line: number }[] = []

    // Forbidden patterns: any LHS assignment to innerHTML/outerHTML or
    // insertAdjacentHTML call. The pattern matches the property access
    // (e.g., `el.innerHTML`) and the method call (e.g., `el.insertAdjacentHTML(...)`).
    const forbiddenPatterns: Array<{ name: string; regex: RegExp }> = [
        { name: 'innerHTML', regex: /\.innerHTML\b/g },
        { name: 'outerHTML', regex: /\.outerHTML\b/g },
        { name: 'insertAdjacentHTML', regex: /\.insertAdjacentHTML\b/g }
    ]

    for (const file of files) {
        const src = readFileSync(file, 'utf-8')
        const stripped = stripComments(src)
        for (const { name, regex } of forbiddenPatterns) {
            const matches = stripped.match(regex)
            if (matches) {
                // Find line numbers for diagnostics
                const lines = stripped.split('\n')
                lines.forEach((line, i) => {
                    if (regex.test(line)) {
                        regex.lastIndex = 0
                        offenders.push({ file, pattern: name, line: i + 1 })
                    }
                })
            }
        }
    }

    it('zero innerHTML / outerHTML / insertAdjacentHTML in src/', () => {
        if (offenders.length > 0) {
            const summary = offenders
                .map((o) => `  ${o.file.replace(SRC_ROOT + '\\', '')}:${o.line} (${o.pattern})`)
                .join('\n')
            throw new Error(
                `Found ${offenders.length} innerHTML/outerHTML/insertAdjacentHTML sites in src/:\n${summary}\n\n` +
                    `Use DOM API (createElement, textContent, replaceChildren, appendChild) instead. ` +
                    `See focus-ui.ts for the refactored pattern (commit 88621277).`
            )
        }
        expect(offenders.length).toBe(0)
    })

    it('audit covers .ts and .svelte files only (tests/ excluded)', () => {
        // Sanity check: walked at least the expected file types
        const tsFiles = files.filter((f) => f.endsWith('.ts'))
        const svelteFiles = files.filter((f) => f.endsWith('.svelte'))
        expect(tsFiles.length).toBeGreaterThan(10)
        expect(svelteFiles.length).toBeGreaterThan(0)
    })
})
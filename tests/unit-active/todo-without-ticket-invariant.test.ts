/**
 * todo-without-ticket-invariant.test.ts
 *
 * Invariant test: every TODO comment in source code must reference
 * a ticket. TODOs without tickets accumulate as technical debt
 * with no clear owner.
 *
 * Per the working agreement that all work should be tracked in a
 * ticket, and per AGENTS.md "delegated team pattern" which makes
 * ticket-tracking the default expectation for any feature work.
 *
 * The repo currently has a small number of approved TODO-without-ticket
 * uses (recorded in `APPROVED_BASELINE` below). This test asserts the
 * count doesn't GROW — every new TODO must reference a ticket or be
 * added to the baseline explicitly, surfacing it for review.
 *
 * What counts as a "ticket reference" (any of these within 2 lines
 * of the TODO):
 *   - T-XXX        (e.g., T-1, T-9D, T-12, T-1+2)
 *   - #XXX         where XXX is 1+ digits (e.g., #123)
 *   - Ticket XXX   (e.g., Ticket 9D, Ticket 1+2)
 *   - Issue #XXX   (e.g., Issue #123)
 *   - BOTH-XXX     (e.g., BOTH-1, BOTH-9D)
 *   - Wave X       where X is a digit (e.g., Wave 9)
 *   - W##-X##      wave-day form (e.g., W6-T1, W46-D4) — the team's
 *                  canonical convention for feature work, distinct from
 *                  Wave X which is the simpler single-digit form
 *
 * What counts as a "TODO":
 *   - The literal word TODO (word-boundary) in a code comment line.
 *   - The same-line + next 2 lines are scanned for a ticket ref.
 *
 * Run: npx vitest run tests/unit-active/todo-without-ticket-invariant.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const repoRoot = process.cwd()

// Source files to scan.
const SCAN_DIRS = [
    'js/modules',
    'src/lib',
    'src/components',
    'src/app.ts',
    'src/main.ts',
    'src/App.svelte',
    'vite.config.ts',
    'vitest.config.js'
]

// Skip these — tests can have TODO references in test bodies;
// docs/ can have TODOs for future plans; build outputs are not source.
const SKIP_PATTERNS = [/node_modules/, /dist\//, /tests\//, /docs\//, /tmp\//, /\\.d\\.ts$/]

// Ticket reference patterns. A TODO with any of these within 2 lines
// (same line or next 2 lines) is considered "tracked".
const TICKET_REGEX = /\b(?:T-\w+|#\d+|Ticket\s+[\w+]+|Issue\s+#\d+|BOTH-\d+|Wave\s+\d+|W\d+-[A-Z]\d+)\b/i

// TODO detection — match TODO as a word.
const TODO_REGEX = /\bTODO\b/

// Baseline count of approved TODO-without-ticket uses. Verified on
// 2026-06-13 via a script walk of the source dirs (this test
// re-derives the same scan). Update this when approving a new use
// (see comment in the test body).
//
// All 10 S6-arc TODOs resolved as of 2026-06-13. Baseline is now 0;
// any new TODO without a ticket will fail this test.
const APPROVED_BASELINE = 0 // W11-T6 Wave 2: TODOs in triggers.ts now carry (Wave 2) ticket refs. Reset to 0 on 2026-06-15.

interface TodoUse {
    file: string
    line: number
    column: number
    matchedLine: string
    hasTicket: boolean
}

function statExists(p: string): boolean {
    try {
        statSync(p)
        return true
    } catch {
        return false
    }
}

function collectSourceFiles(root: string): string[] {
    const out: string[] = []
    if (!statExists(root)) return out
    const stack: string[] = [root]
    while (stack.length > 0) {
        const dir = stack.pop()!
        let entries: string[]
        try {
            entries = readdirSync(dir)
        } catch {
            continue
        }
        for (const name of entries) {
            const full = join(dir, name)
            let st
            try {
                st = statSync(full)
            } catch {
                continue
            }
            if (st.isDirectory()) {
                stack.push(full)
            } else if (st.isFile() && /\.(ts|js|svelte)$/.test(name)) {
                out.push(full)
            }
        }
    }
    return out
}

function findTodos(): TodoUse[] {
    const todos: TodoUse[] = []
    for (const dir of SCAN_DIRS) {
        const fullPath = join(repoRoot, dir)
        if (!statExists(fullPath)) continue
        const stat = statSync(fullPath)
        const files = stat.isDirectory() ? collectSourceFiles(fullPath) : [fullPath]
        for (const f of files) {
            const rel = relative(repoRoot, f)
            if (SKIP_PATTERNS.some((re) => re.test(rel))) continue
            let text: string
            try {
                text = readFileSync(f, 'utf-8')
            } catch {
                continue
            }
            const lines = text.split(/\r?\n/)
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i]
                if (!TODO_REGEX.test(line)) continue
                // Check same line + next 2 lines for a ticket ref
                const window = [line, lines[i + 1] || '', lines[i + 2] || ''].join('\n')
                const hasTicket = TICKET_REGEX.test(window)
                const idx = line.search(TODO_REGEX)
                todos.push({
                    file: rel,
                    line: i + 1,
                    column: idx + 1,
                    matchedLine: line.trim(),
                    hasTicket
                })
            }
        }
    }
    return todos
}

describe('TODO-without-ticket regression detector', () => {
    if (process.env.REFACTOR_BASELINE_OVERRIDE) {
        it('skips during active refactor wave (unset REFACTOR_BASELINE_OVERRIDE to re-enable)', () => {
            expect(true).toBe(true)
        })
        return
    }
    it('count of TODOs without ticket references is at or below the approved baseline', () => {
        const todos = findTodos()
        const violations = todos.filter((t) => !t.hasTicket)
        if (violations.length > APPROVED_BASELINE) {
            const newViolations = violations.slice(APPROVED_BASELINE)
            const lines = newViolations.map((v) => `  ${v.file}:${v.line}:${v.column}\n    > ${v.matchedLine}`)
            throw new Error(
                `Found ${newViolations.length} new TODO-without-ticket violation(s) beyond the approved baseline of ${APPROVED_BASELINE}:\n${lines.join('\n')}\n\n` +
                    `Per the working agreement, every TODO must reference a ticket (T-XXX, #XXX, "Ticket XXX", "Issue #XXX", "BOTH-XXX", "Wave X", or "W##-X##"). Either:\n` +
                    `  1. Add a ticket reference to the TODO comment (within 2 lines of the TODO)\n` +
                    `  2. If the TODO is justified and tracked elsewhere, update APPROVED_BASELINE in tests/unit-active/todo-without-ticket-invariant.test.ts to ${violations.length} and commit the test update + the TODO together`
            )
        }
        expect(violations.length).toBeLessThanOrEqual(APPROVED_BASELINE)
    })

    it('approved baseline is a non-negative integer', () => {
        expect(APPROVED_BASELINE).toBeGreaterThanOrEqual(0)
        expect(Number.isInteger(APPROVED_BASELINE)).toBe(true)
    })
})

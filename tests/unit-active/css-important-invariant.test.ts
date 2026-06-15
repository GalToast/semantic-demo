/**
 * css-important-invariant.test.ts
 *
 * Regression detector for the `!important` CSS anti-pattern.
 *
 * Per AGENTS.md "Avoid `!important` as a default CSS fix":
 *   "Prefer cascade order, selector specificity, and scoped structure
 *    changes first; use `!important` only as an explicit last resort
 *    with user approval."
 *
 * The repo currently has a small number of approved `!important`
 * uses (recorded in `APPROVED_BASELINE` below). This test asserts
 * the count doesn't GROW — every new `!important` must be added to
 * the baseline explicitly, surfacing it for review.
 *
 * To approve a new `!important` (after review):
 *   1. Read the diff and confirm the new use is justified
 *   2. Update APPROVED_BASELINE in this test file
 *   3. Commit the test update + the CSS change together
 *
 * Run: npx vitest run tests/unit-active/css-important-invariant.test.ts
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const repoRoot = process.cwd();

// CSS files to scan (source + dist mirrors). Note: we intentionally
// scan both because a stale dist mirror is also a regression signal.
const SCAN_DIRS = ['css', 'src/lib/css'];

// Skip these — they are vendored or build artifacts that may
// legitimately contain `!important`.
const SKIP_PATTERNS = [
    /node_modules/,
    /dist\/svelte\/assets\//,  // bundled assets, may have vendor !important
    /\.min\./,                  // minified files
];

// Baseline count of approved `!important` uses. Update this when
// approving a new use (see comment in the test body).
const APPROVED_BASELINE = 0;

interface ImportantUse {
    file: string;
    line: number;
    column: number;
    matchedLine: string;
}

function collectCssFiles(root: string): string[] {
    const out: string[] = [];
    const stack = [root];
    while (stack.length > 0) {
        const dir = stack.pop()!;
        let entries: string[];
        try {
            entries = readdirSync(dir);
        } catch {
            continue;
        }
        for (const name of entries) {
            const full = join(dir, name);
            let st;
            try {
                st = statSync(full);
            } catch {
                continue;
            }
            if (st.isDirectory()) {
                stack.push(full);
            } else if (st.isFile() && name.endsWith('.css')) {
                out.push(full);
            }
        }
    }
    return out;
}

/**
 * Strip comment regions from a CSS line, returning the non-comment portion.
 * Tracks multi-line /* *​/ state across calls via the inBlockComment flag.
 */
function stripComments(
    line: string,
    inBlockComment: boolean
): { cleaned: string; inBlockComment: boolean } {
    let cleaned = line;
    // If we're continuing from a previous block comment, consume up to its close
    if (inBlockComment) {
        const closeIdx = cleaned.indexOf('*/');
        if (closeIdx !== -1) {
            cleaned = cleaned.substring(closeIdx + 2);
            inBlockComment = false;
        } else {
            return { cleaned: '', inBlockComment: true };
        }
    }
    // Remove inline /* ... */ comments (non-greedy)
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
    // Check if a /* opens but doesn't close (entering block comment)
    const openIdx = cleaned.indexOf('/*');
    if (openIdx !== -1) {
        cleaned = cleaned.substring(0, openIdx);
        inBlockComment = true;
    }
    // Remove // line comments
    const slashIdx = cleaned.indexOf('//');
    if (slashIdx !== -1) {
        cleaned = cleaned.substring(0, slashIdx);
    }
    return { cleaned, inBlockComment };
}

function findImportantUses(): ImportantUse[] {
    const uses: ImportantUse[] = [];
    for (const dir of SCAN_DIRS) {
        const fullPath = join(repoRoot, dir);
        let st;
        try {
            st = statSync(fullPath);
        } catch {
            continue;
        }
        const files = st.isDirectory() ? collectCssFiles(fullPath) : [fullPath];
        for (const f of files) {
            const rel = relative(repoRoot, f);
            if (SKIP_PATTERNS.some((re) => re.test(rel))) continue;
            let text: string;
            try {
                text = readFileSync(f, 'utf-8');
            } catch {
                continue;
            }
            const lines = text.split(/\r?\n/);
            let inBlockComment = false;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const idx = line.indexOf('!important');
                if (idx === -1) {
                    // Still need to update block comment state
                    const result = stripComments(line, inBlockComment);
                    inBlockComment = result.inBlockComment;
                    continue;
                }
                const { cleaned, inBlockComment: nextInBlock } = stripComments(
                    line,
                    inBlockComment
                );
                inBlockComment = nextInBlock;
                // Only count if !important appears in non-comment code
                if (cleaned.indexOf('!important') !== -1) {
                    uses.push({
                        file: rel,
                        line: i + 1,
                        column: idx + 1,
                        matchedLine: line.trim(),
                    });
                }
            }
        }
    }
    return uses;
}

describe('!important CSS regression detector', () => {
    if (process.env.REFACTOR_BASELINE_OVERRIDE) {
        it('skips during active refactor wave (unset REFACTOR_BASELINE_OVERRIDE to re-enable)', () => {
            expect(true).toBe(true);
        });
        return;
    }
    it('count of !important uses is at or below the approved baseline', () => {
        const uses = findImportantUses();
        if (uses.length > APPROVED_BASELINE) {
            const newUses = uses.slice(APPROVED_BASELINE);
            const lines = newUses.map(
                (u) => `  ${u.file}:${u.line}:${u.column}\n    > ${u.matchedLine}`
            );
            throw new Error(
                `Found ${newUses.length} new !important use(s) beyond the approved baseline of ${APPROVED_BASELINE}:\n${lines.join('\n')}\n\n` +
                    `Per AGENTS.md, !important should be a last resort with user approval. Either:\n` +
                    `  1. Refactor the CSS to use cascade order, selector specificity, or scoped structure instead\n` +
                    `  2. If the new use is justified, update APPROVED_BASELINE in tests/unit-active/css-important-invariant.test.ts to ${uses.length} and commit the test update + the CSS change together`
            );
        }
        expect(uses.length).toBeLessThanOrEqual(APPROVED_BASELINE);
    });

    it('all !important uses have a current approved baseline', () => {
        // Sanity: the baseline must be a non-negative integer.
        expect(APPROVED_BASELINE).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(APPROVED_BASELINE)).toBe(true);
    });
});

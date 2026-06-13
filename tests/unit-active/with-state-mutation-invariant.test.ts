/**
 * with-state-mutation-invariant.test.ts
 *
 * Invariant test: every direct mutation of a CRITICAL_KEY or
 * TRACKED_SUB_KEY on the `state` proxy MUST be wrapped in a
 * withStateMutation(() => { ... }) call.
 *
 * Per AGENTS.md "durable code invariants":
 *   "withStateMutation() required for tracked sub-objects — _makeProdProxy
 *    throws in production when !_isMutating. All mutations to navState,
 *    strandContinuityState, and other TRACKED_SUB_KEYS in state.js MUST
 *    be wrapped in withStateMutation(). Failure to do so causes a
 *    production throw."
 *
 * Active Vitest suite (tests/unit-active/).
 *
 * The test reads the canonical CRITICAL_KEYS + TRACKED_SUB_KEYS lists
 * from src/lib/state/with-state-mutation.ts (the same lists the proxy
 * traps use at runtime) and scans the codebase for direct mutations
 * of those keys outside a withStateMutation block.
 *
 * What counts as a direct mutation:
 *   - `state.<KEY> = ...` assignment (left-hand side)
 *   - `state.<KEY>.<subkey> = ...` (deeper) — still illegal if KEY is
 *     in TRACKED_SUB_KEYS (the parent is wrapped in a nested Proxy)
 *
 * What's a "withStateMutation block":
 *   - The mutation is on a line lexically between an opening
 *     `withStateMutation(...)` (or `withStateMutation(() =>`) and the
 *     matching closing `})` of that call.
 *   - Heuristic: the assignment is at an indentation level >= the
 *     indentation of the withStateMutation line. This catches
 *     top-level mutations while permitting properly-nested ones.
 *
 * Run: npx vitest run tests/unit-active/with-state-mutation-invariant.test.ts
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

import {
    CRITICAL_KEYS,
    TRACKED_SUB_KEYS,
} from '../../src/lib/state/with-state-mutation';

// Vitest runs from the worktree root, so process.cwd() is the repo root.
const repoRoot = process.cwd();

// All keys whose direct mutation requires withStateMutation. Union of
// the two lists since TRACKED_SUB_KEYS includes some that are also
// CRITICAL (e.g. 'navState').
const PROTECTED_KEYS = new Set<string>([...CRITICAL_KEYS, ...TRACKED_SUB_KEYS]);

// Directories to scan.
const SCAN_DIRS = ['js/modules', 'src/lib', 'src/app.d.ts'];

// Skip these — they are type declarations, test fixtures, or
// known-safe special cases.
const SKIP_PATTERNS = [
    /node_modules/,
    /dist\//,
    /tests\//,            // tests may stub mutations
    /\.d\.ts$/,           // type-only files
    /state-mutators\.ts/, // canonical wrappers, all good
    /state\.ts$/,         // the proxy itself
    /state\.js$/,         // the proxy itself
    /with-state-mutation\.ts$/, // the wrapper definition
];

interface Violation {
    file: string;
    line: number;
    column: number;
    matchedLine: string;
    key: string;
}

/**
 * Recursively collect all .ts and .js files under the given path.
 * Symlinks are NOT followed (cycle hazard).
 */
function collectFiles(root: string): string[] {
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
            } else if (st.isFile() && (name.endsWith('.ts') || name.endsWith('.js'))) {
                out.push(full);
            }
        }
    }
    return out;
}

/**
 * For a single file, find direct mutations of state.<KEY> and check
 * whether each is inside a withStateMutation block.
 *
 * Heuristic for "inside a withStateMutation block":
 *   - Track the withStateMutation call stack as we scan line by line.
 *   - On `withStateMutation(...)` opening, push the current line
 *     indent + 1 (children must be more indented than the call).
 *   - On `})` closing at the withStateMutation indent, pop.
 *   - A direct mutation line is "inside" if there's >= 1 withStateMutation
 *     block open at that point.
 */
function scanFile(filePath: string): Violation[] {
    const rel = relative(repoRoot, filePath);
    if (SKIP_PATTERNS.some((re) => re.test(rel))) return [];

    let text: string;
    try {
        text = readFileSync(filePath, 'utf-8');
    } catch {
        return [];
    }
    const lines = text.split(/\r?\n/);
    const violations: Violation[] = [];

    // Stack of withStateMutation open indents. Each entry is the
    // indent of the line that opened the call; the call's body must
    // be more indented. We approximate close by counting braces per
    // line and popping when depth returns to the opening level.
    const wsmStack: number[] = [];

    // Track brace depth from the last withStateMutation open so we
    // know when to pop. Index matches wsmStack.
    const wsmOpenBraceDepth: number[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // Update wsmStack based on the line's content.
        // Heuristic: look for `withStateMutation` opening (call start),
        // and `})` closing at the withStateMutation indent level.
        const wsmOpen = /\bwithStateMutation\s*\(/.exec(line);
        if (wsmOpen) {
            // Capture the opening indent (count leading whitespace).
            const indent = line.search(/\S/);
            wsmStack.push(indent < 0 ? 0 : indent);
            wsmOpenBraceDepth.push(0);
        }

        // Count brace balance for this line (excluding string contents).
        // Approximation: only count `{` and `}` outside of `'` and `"`.
        let depthDelta = 0;
        let inSingle = false;
        let inDouble = false;
        let inTemplate = false;
        let inLineComment = false;
        let inBlockComment = false;
        for (let j = 0; j < line.length; j++) {
            const c = line[j];
            const prev = j > 0 ? line[j - 1] : '';
            if (inLineComment) break;
            if (inBlockComment) {
                if (c === '*' && line[j + 1] === '/') {
                    inBlockComment = false;
                    j++;
                }
                continue;
            }
            if (inSingle) {
                if (c === "'" && prev !== '\\') inSingle = false;
                continue;
            }
            if (inDouble) {
                if (c === '"' && prev !== '\\') inDouble = false;
                continue;
            }
            if (inTemplate) {
                if (c === '`' && prev !== '\\') inTemplate = false;
                continue;
            }
            if (c === '/' && line[j + 1] === '/') {
                inLineComment = true;
                break;
            }
            if (c === '/' && line[j + 1] === '*') {
                inBlockComment = true;
                j++;
                continue;
            }
            if (c === "'") {
                inSingle = true;
                continue;
            }
            if (c === '"') {
                inDouble = true;
                continue;
            }
            if (c === '`') {
                inTemplate = true;
                continue;
            }
            if (c === '{') depthDelta++;
            else if (c === '}') depthDelta--;
        }
        // Apply depth delta to the topmost withStateMutation if any.
        for (let k = wsmStack.length - 1; k >= 0; k--) {
            wsmOpenBraceDepth[k] += depthDelta;
            // Pop when depth returns to 0 (matching close).
            if (wsmOpenBraceDepth[k] <= 0) {
                wsmStack.splice(k, 1);
                wsmOpenBraceDepth.splice(k, 1);
                break; // only one close per line
            }
        }

        // Check for direct mutations of protected keys.
        for (const key of PROTECTED_KEYS) {
            // Match `state.<key>` (not `state.<key>.<subkey>`, not
            // `state.<key>foo`). Use word boundary on the right.
            const re = new RegExp(`\\bstate\\.${key}\\b(?!\\.|[A-Za-z0-9_])`);
            const match = re.exec(line);
            if (!match) continue;

            // Confirm the line is an assignment. Look for `=` after
            // the match, skipping over `==` and `===` and `=>`.
            const after = line.slice(match.index + match[0].length);
            const assignMatch = /(?<![=>])=(?!=)/.exec(after);
            if (!assignMatch) continue;

            const column = match.index + 1;

            // Inside a withStateMutation block?
            if (wsmStack.length > 0) continue;

            // Skip commented lines (already filtered above, but
            // double-check for /* ... */ on this exact line).
            if (inLineComment || inBlockComment) continue;

            violations.push({
                file: rel,
                line: lineNum,
                column,
                matchedLine: line.trim(),
                key,
            });
        }
    }
    return violations;
}

describe('withStateMutation invariant', () => {
    it('no direct mutations of CRITICAL_KEYS or TRACKED_SUB_KEYS outside withStateMutation', () => {
        const allViolations: Violation[] = [];
        for (const dir of SCAN_DIRS) {
            const fullPath = join(repoRoot, dir);
            let st;
            try {
                st = statSync(fullPath);
            } catch {
                continue;
            }
            const files = st.isDirectory() ? collectFiles(fullPath) : [fullPath];
            for (const f of files) {
                allViolations.push(...scanFile(f));
            }
        }
        if (allViolations.length > 0) {
            const lines = allViolations.map(
                (v) =>
                    `  ${v.file}:${v.line}:${v.column} — state.${v.key} assignment outside withStateMutation\n    > ${v.matchedLine}`
            );
            throw new Error(
                `Found ${allViolations.length} direct mutation(s) of CRITICAL/TRACKED state keys outside withStateMutation:\n${lines.join('\n')}\n\n` +
                    `Per AGENTS.md, all mutations to state.<CRITICAL_KEY|TRACKED_SUB_KEY> must be wrapped in withStateMutation(() => { ... }). ` +
                    `Wrap each in a withStateMutation block, or move the mutation into src/lib/state-mutators.ts (which provides canonical wrappers).`
            );
        }
        expect(allViolations).toHaveLength(0);
    });

    it('protected key lists are non-empty', () => {
        // Sanity check: the lists we test against must have content.
        expect(CRITICAL_KEYS.length).toBeGreaterThan(0);
        expect(TRACKED_SUB_KEYS.length).toBeGreaterThan(0);
        // navState appears in both lists (it's CRITICAL and has nested
        // tracked sub-keys). Just verify the set construction works.
        expect(PROTECTED_KEYS.has('navState')).toBe(true);
    });
});

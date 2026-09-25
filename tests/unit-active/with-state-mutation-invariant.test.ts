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
 *   - `state.<KEY> = ...` assignment
 *   - `state.<KEY>.<subkey> = ...` (deeper) — illegal if KEY is in
 *     TRACKED_SUB_KEYS (parent wrapped in nested Proxy)
 *   - `state.<KEY> ??= ...` (nullish)
 *   - `state.<KEY>.<subkey> ??= ...` (subkey nullish)
 *
 * What's a "withStateMutation block":
 *   - The mutation is between an opening `withStateMutation(...)`
 *     and the matching `})` of that call. The block can span
 *     multiple lines OR be single-line `withStateMutation(() => { ... })`.
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
 *   - On `withStateMutation(...)` opening, push to the stack.
 *   - On `{` opens at indent >= wsm-indent, increment depth for the wsm.
 *   - On `}` closes, decrement depth; pop when depth returns to 0.
 *   - A direct mutation line is "inside" if there's >= 1 wsm
 *     call open at that point.
 *
 * KEY INSIGHT: the mutation check must happen BEFORE applying this
 * line's brace delta. Otherwise, a single-line wsm call
 * (`withStateMutation(() => { state.X = ... })`) would have its
 * wsm popped before we check the mutation, producing a false
 * positive for the very pattern the test is meant to verify.
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

    // Stack of withStateMutation open indent + brace depth. Each
    // entry is {indent, depth}. The wsm call's body must be more
    // indented than `indent` (children).
    const wsmStack: Array<{ indent: number; depth: number }> = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // 1. Check for withStateMutation opening; push to stack.
        //    The codebase has 2 names for the same function:
        //    `withStateMutation` (canonical) and `withMutation` (a
        //    local alias used in src/lib/engine/demo-choreography.ts
        //    where the file destructures getWithStateMutation() as
        //    `withMutation` for terseness). Both open a wsm block.
        const wsmOpen = /\b(?:withStateMutation|withMutation)\s*\(/.exec(line);
        if (wsmOpen) {
            const indent = line.search(/\S/);
            wsmStack.push({ indent: indent < 0 ? 0 : indent, depth: 0 });
        }

        // 2. CHECK MUTATIONS — BEFORE applying this line's brace
        //    delta. This handles single-line wsm patterns correctly.
        for (const key of PROTECTED_KEYS) {
            // Match an assignment to `state.<KEY>` (with optional
            // `.subkey` chain). Allowed assignment operators:
            //   - simple: `state.X = ...`
            //   - subkey: `state.X.subkey = ...`
            //   - nullish: `state.X ??= ...`
            //   - nullish subkey: `state.X.subkey ??= ...`
            // The `=` MUST be preceded by either whitespace (simple)
            // or `?` (nullish), and MUST NOT be followed by another
            // `=` (filters out `==` and `===`).
            // This filters out:
            //   - reads: `(state.X as any).threadCandidates`
            //   - comparisons: `state.X === 'foo'`
            //   - ternary: `state.X ? a : b`
            //   - method calls: `state.X.toString()`
            const re = new RegExp(
                `\\bstate\\.${key}\\b(?:\\.[A-Za-z_][A-Za-z0-9_]*)*(?:\\s*=(?!=)|\\?=(?!=))`
            );
            const match = re.exec(line);
            if (!match) continue;

            const column = match.index + 1;

            // Inside a withStateMutation block?
            if (wsmStack.length > 0) continue;

            violations.push({
                file: rel,
                line: lineNum,
                column,
                matchedLine: line.trim(),
                key,
            });
        }

        // 3. Count brace balance for this line. The wsm call's
        //    body is between the opening `{` (or `=> {` of the
        //    arrow function) and the matching `}`. We track the
        //    depth of the wsm call's body braces; the call is
        //    "open" while depth > 0.
        let depthDelta = 0;
        let inSingle = false;
        let inDouble = false;
        let inTemplate = false;
        for (let j = 0; j < line.length; j++) {
            const c = line[j];
            const prev = j > 0 ? line[j - 1] : '';
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
                // Line comment — skip the rest of the line.
                break;
            }
            if (c === '/' && line[j + 1] === '*') {
                // Block comment — skip the comment span.
                j += 2;
                while (j < line.length) {
                    if (line[j] === '*' && line[j + 1] === '/') {
                        j++;
                        break;
                    }
                    j++;
                }
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
            wsmStack[k].depth += depthDelta;
            // Pop when depth returns to 0 (matching close).
            if (wsmStack[k].depth <= 0) {
                wsmStack.splice(k, 1);
                break; // only one close per line
            }
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
    }, 30000);

    it('protected key lists are non-empty', () => {
        // Sanity check: the lists we test against must have content.
        expect(CRITICAL_KEYS.length).toBeGreaterThan(0);
        expect(TRACKED_SUB_KEYS.length).toBeGreaterThan(0);
        // navState appears in both lists (it's CRITICAL and has nested
        // tracked sub-keys). Just verify the set construction works.
        expect(PROTECTED_KEYS.has('navState')).toBe(true);
    }, 30000);
});

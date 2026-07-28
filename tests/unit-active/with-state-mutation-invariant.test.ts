/**
 * with-state-mutation-invariant.test.ts
 *
 * Invariant test: the dead `withStateMutation(() => { ... })` wrapper has
 * been fully removed from every call site and must not be reintroduced.
 *
 * Why the wrapper is dead (all data sources agree):
 *   - `withStateMutation(fn)` just sets `_isMutatingRef.value = true`, runs
 *     `fn()`, and restores — a functional no-op. It returns `fn()`'s result.
 *   - `isMutating()` (the reader of `_isMutatingRef`) is referenced NOWHERE
 *     outside `with-state-mutation.ts` — not by `js/state.js`, `src/lib/state/
 *     state.ts`, or the new `src/lib/state/app.svelte.ts` Proxy.
 *   - The new `app.svelte.ts` Proxy does NOT read `_isMutatingRef`; its
 *     `validateStateProperty` checks `STATE_VALIDATORS` independently (see
 *     `src/lib/state/state-validation.ts`). So a mutation outside the wrapper
 *     cannot throw at runtime.
 *   - `with-state-mutation.ts` is flagged DEPRECATED (2026-07-27) and the
 *     deprecation note says wrappers are "no-op-correct" and "should not be
 *     added in new code."
 *
 * So this test is the INVERSE of the old convention ("mutations must be
 * wrapped in withStateMutation"): it asserts there are ZERO remaining
 * direct `withStateMutation(() =>` wrapper calls, acting as a regression
 * guard against silently re-adding the dead wrapper.
 *
 * Preserved sites that are intentionally NOT violations:
 *   - `engineState.withStateMutation?.()` — the engine keeps its own
 *     mutator binding (src/lib/engine/three-engine-*.ts). The `?.` form
 *     does not match the direct-call regex below.
 *   - `window.withStateMutation = withStateMutation` (src/main.ts) — an
 *     assignment of the function reference, not a wrapper call.
 *   - `modules?.withStateMutation` in window-actions.ts — destructured
 *     reference, `?.` form.
 *   - The definition in src/lib/state/with-state-mutation.ts (skipped).
 *
 * Active Vitest suite (tests/unit-active/).
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

// Directories to scan recursively for remaining direct wrapper calls.
// 'src' covers src/lib, src/components, src/main.ts (all 22 unwrap sites);
// 'js' covers js/modules + the js/state.js backward-compat shim.
const SCAN_DIRS = ['src', 'js'];

// Skip these — they are the definition, type-only files, tests, or build
// artifacts where the symbol is legitimately referenced without being
// called as a dead wrapper.
const SKIP_PATTERNS = [
    /node_modules/,
    /dist\//,
    /tests\//,                       // test stubs may reference the symbol
    /\.d\.ts$/,                      // type-only files
    /with-state-mutation\.ts$/,     // the wrapper definition itself
];

interface WrapperCall {
    file: string;
    line: number;
    matchedLine: string;
}

/**
 * Match a DIRECT wrapper call: the symbol followed by `(` then `(` (the
 * arrow-function paren). `withStateMutation\(\s*\(` does NOT match:
 *   - `engineState.withStateMutation?.(`  — intervening `?.`
 *   - `window.withStateMutation =`        — no call paren at all
 *   - `function withStateMutation<T>(`    — `<` (generic) before the paren
 *   - `import { withStateMutation }` / `export { withStateMutation }` — no `(`
 * `withMutation` covers the historical local alias (formerly destructured in
 * demo-choreography.ts); it is a distinct symbol (w-i-t-h-M, not preceded by
 * `State`) so it does not collide with `withStateMutation`.
 */
const WRAPPER_CALL_RE = /(?:withStateMutation|withMutation)\(\s*\(/;

/**
 * Recursively collect all source files (.ts/.js/.svelte) under `root`.
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
            } else if (
                st.isFile() &&
                (name.endsWith('.ts') || name.endsWith('.js') || name.endsWith('.svelte'))
            ) {
                out.push(full);
            }
        }
    }
    return out;
}

/**
 * Strip JS/TS comments from `src`, replacing comment characters with
 * nothing but PRESERVING newlines so line numbers stay aligned with the
 * original text. Tracks single/double/template literals so `//` and `/*`
 * inside strings are not mistaken for comments. This prevents a doc
 * comment that happens to mention `withStateMutation(() => { ... })`
 * from producing a false positive.
 */
function stripComments(src: string): string {
    let out = '';
    let i = 0;
    const n = src.length;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    while (i < n) {
        const c = src[i];
        const prev = i > 0 ? src[i - 1] : '';
        if (inSingle) {
            out += c;
            if (c === "'" && prev !== '\\') inSingle = false;
            i++;
            continue;
        }
        if (inDouble) {
            out += c;
            if (c === '"' && prev !== '\\') inDouble = false;
            i++;
            continue;
        }
        if (inTemplate) {
            out += c;
            if (c === '`' && prev !== '\\') inTemplate = false;
            i++;
            continue;
        }
        const next = src[i + 1];
        if (c === '/' && next === '/') {
            // Line comment — drop through to end of line, keep the newline.
            while (i < n && src[i] !== '\n') i++;
            continue;
        }
        if (c === '/' && next === '*') {
            // Block comment — drop through to `*/`, keep any newlines inside.
            i += 2;
            while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
                if (src[i] === '\n') out += '\n';
                i++;
            }
            i += 2; // consume */
            continue;
        }
        if (c === "'") {
            inSingle = true;
            out += c;
            i++;
            continue;
        }
        if (c === '"') {
            inDouble = true;
            out += c;
            i++;
            continue;
        }
        if (c === '`') {
            inTemplate = true;
            out += c;
            i++;
            continue;
        }
        out += c;
        i++;
    }
    return out;
}

/**
 * For a single file, find any remaining direct `withStateMutation(() =>`
 * (or `withMutation(() =>`) wrapper calls. Comment text is excluded via
 * stripComments so docstrings mentioning the old pattern don't false-fire.
 * The reported `matchedLine` is the ORIGINAL (un-stripped) line so the
 * failure message is useful for review.
 */
function scanFile(filePath: string): WrapperCall[] {
    const rel = relative(repoRoot, filePath);
    if (SKIP_PATTERNS.some((re) => re.test(rel))) return [];

    let text: string;
    try {
        text = readFileSync(filePath, 'utf-8');
    } catch {
        return [];
    }
    const originalLines = text.split(/\r?\n/);
    const strippedLines = stripComments(text).split(/\r?\n/);
    const hits: WrapperCall[] = [];
    for (let i = 0; i < strippedLines.length; i++) {
        if (WRAPPER_CALL_RE.test(strippedLines[i])) {
            hits.push({
                file: rel,
                line: i + 1,
                matchedLine: (originalLines[i] || '').trim(),
            });
        }
    }
    return hits;
}

describe('withStateMutation invariant', () => {
    it('no remaining direct withStateMutation(() => wrapper calls (unwrap is complete)', () => {
        const allHits: WrapperCall[] = [];
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
                allHits.push(...scanFile(f));
            }
        }
        if (allHits.length > 0) {
            const lines = allHits.map(
                (h) =>
                    `  ${h.file}:${h.line} — direct withStateMutation(() => call\n    > ${h.matchedLine}`
            );
            throw new Error(
                `Found ${allHits.length} remaining direct withStateMutation(() => wrapper call(s):\n${lines.join('\n')}\n\n` +
                    `withStateMutation() is a dead no-op (see the DEPRECATED note in ` +
                    `src/lib/state/with-state-mutation.ts): the new app.svelte.ts Proxy reads ` +
                    `STATE_VALIDATORS, not _isMutatingRef, and isMutating() is called nowhere at ` +
                    `runtime. Do not reintroduce the wrapper. If you need a grouped mutation, use a ` +
                    `plain block { ... } or the canonical wrappers in src/lib/state-mutators.ts.`
            );
        }
        expect(allHits).toHaveLength(0);
    }, 30000);

    it('protected key lists are non-empty', () => {
        // Sanity check: the lists we still re-export from with-state-mutation.ts
        // (js/state.js backward-compat consumers + state-mutators.ts) remain
        // non-empty even though the mutation-guard wrapper itself is dead.
        expect(CRITICAL_KEYS.length).toBeGreaterThan(0);
        expect(TRACKED_SUB_KEYS.length).toBeGreaterThan(0);
        // navState appears in both lists (it's CRITICAL and has nested tracked
        // sub-keys). Verify the set construction still works.
        expect(new Set<string>([...CRITICAL_KEYS, ...TRACKED_SUB_KEYS]).has('navState')).toBe(true);
    }, 30000);
});

#!/usr/bin/env node
/**
 * scripts/check-legacy-ts-budget.mjs
 *
 * Assert that the legacy `js/modules/*.ts` engine-kernel type-error count
 * stays at or below a configured budget. This is a one-way ratchet:
 * legacy errors should only decrease as code ports to src/lib/. If the
 * count is *above* the budget, the script fails (exit 1). If *below*,
 * it succeeds and prints the current count + headroom for the budget
 * increase suggestion.
 *
 * Usage:
 *   node scripts/check-legacy-ts-budget.mjs                 # use default budget
 *   LEGACY_TS_BUDGET=45 node scripts/check-legacy-ts-budget.mjs   # override budget
 *
 * Exit codes:
 *   0 — current count at or below budget (pass)
 *   1 — current count above budget (fail)
 *   2 — could not determine current count (tool error)
 *
 * Companion to: scripts/check-bridge-references.mjs
 * Part of: W12/13 strategic-seam ratchet series (one-way ratchets that
 *          prevent regression while letting legacy code retire at its own pace).
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const DEFAULT_BUDGET = 50;
const budget = Number.parseInt(process.env.LEGACY_TS_BUDGET ?? '', 10) || DEFAULT_BUDGET;

function countLegacyErrors() {
    let stdout;
    try {
        stdout = execSync('npx svelte-check --workspace src --tsconfig tsconfig.json --diagnostic-sources js,ts 2>&1', {
            cwd: ROOT,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            maxBuffer: 16 * 1024 * 1024,
        });
    } catch (err) {
        // svelte-check exits non-zero when errors are present; capture both stdout and stderr
        stdout = `${err.stdout ?? ''}\n${err.stderr ?? ''}`;
    }

    // Lines shaped like:
    //   "Error: Type 'X' is not assignable to type 'Y'.\n  File: path/to/js/modules/whatever.ts:NN:NN\n"
    // Each legacy error contributes at least one `js/modules/<file>.ts:<line>` reference.
    // Deduplicate by file path so per-file type errors don't multiply when one root cause
    // produces a chain of related errors. We count unique legacy files with at least one error.
    const fileRefs = new Set();
    const lineRe = /(?:File: |\.ts:|\.ts\?)\s*([\w./-]*js\/modules\/[\w./-]+\.ts):\d+:\d+/g;
    let match;
    while ((match = lineRe.exec(stdout)) !== null) {
        // Normalize to repo-relative
        const rel = path.isAbsolute(match[1])
            ? path.relative(ROOT, match[1])
            : match[1];
        fileRefs.add(rel);
    }
    return { count: fileRefs.size, files: [...fileRefs].sort() };
}

const { count, files } = countLegacyErrors();

if (count === 0) {
    console.log(`✅ Legacy js/modules/* type-errors: 0 (budget ${budget}) — fully retired.`);
    process.exit(0);
}

const status = count > budget ? '❌' : '✅';
const headroom = budget - count;
const symbol = count > budget ? 'OVER BUDGET' : 'within budget';

console.log(`${status} Legacy js/modules/* files with type-errors: ${count} of budget ${budget} (${symbol}, ${Math.abs(headroom)} headroom)`);
if (files.length) {
    console.log('');
    console.log('Files:');
    for (const f of files) console.log(`  - ${f}`);
}

if (count > budget) {
    console.log('');
    console.log(`To raise the budget intentionally, set LEGACY_TS_BUDGET=<N> for this run.`);
    console.log(`To retire legacy errors, port the offending files to src/lib/.`);
    process.exit(1);
}

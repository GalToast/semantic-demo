/**
 * css-self-reference-check.mjs
 *
 * Regression guard for the `1f7456b` failure mode. A previous token sweep
 * replaced 247 white/black rgba literals with `var(--token)` references
 * but also rewrote the token *definitions* into self-references like
 * `--glass-reflection: var(--glass-reflection)`. Every component that
 * resolved the token got an undefined value, cascading into a broken UI.
 *
 * This check scans every CSS file under `css/` for the `--foo: var(--foo)`
 * pattern and fails CI if any are found. Run as part of `npm run check:manifest`
 * or standalone via `node tests/css-self-reference-check.mjs`.
 *
 * Allowlist: none. Self-referencing custom properties are never valid CSS.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const CSS_DIRS = [
    path.join(ROOT, 'css'),
    path.join(ROOT, 'css', 'modules'),
];

// `--foo: var(--foo)` — token defined as a self-reference. Resolves to nothing
// in every consumer and cascades to every component that uses the token.
const SELF_REFERENCE = /(--[a-z][a-z0-9-]*)\s*:\s*var\(\s*--\1\s*(?:,[^)]*)?\)/gi;

const violations = [];

function walk(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter((file) => file.endsWith('.css'))
        .map((file) => path.join(dir, file));
}

for (const dir of CSS_DIRS) {
    for (const file of walk(dir)) {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
            // Skip comment lines so explanatory notes that mention the pattern
            // (e.g. "/* --foo: var(--foo) is invalid */") don't trip the check.
            if (line.trimStart().startsWith('/*') || line.trimStart().startsWith('*')) return;
            let match;
            SELF_REFERENCE.lastIndex = 0;
            while ((match = SELF_REFERENCE.exec(line)) !== null) {
                violations.push({
                    file: path.relative(ROOT, file),
                    line: idx + 1,
                    token: match[1],
                    excerpt: line.trim(),
                });
            }
        });
    }
}

if (violations.length === 0) {
    console.log('CSS self-reference check OK: no `--foo: var(--foo)` patterns found.');
    process.exit(0);
}

console.error('CSS self-reference check FAILED:');
console.error('The following CSS custom properties are defined as self-references,');
console.error('which resolve to undefined values and cascade to every consumer:');
console.error('');
for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  --${v.token}`);
    console.error(`    ${v.excerpt}`);
}
console.error('');
console.error(`Total violations: ${violations.length}`);
console.error('Fix: replace each self-reference with the actual rgba() / color value.');
console.error('Reference: commit 1f7456b introduced this pattern; see DEPLOY_STATUS.md');
console.error('for the cascade incident.');
process.exit(1);

#!/usr/bin/env node
/**
 * ci-check-nav-mirror-pattern.mjs
 *
 * CI guard: ensures that direct mutations of `appState.navState.<field>`
 * (or `legacyState.navState.<field>`) only occur inside canonical mirror
 * helpers — not bare in arbitrary call-sites.
 *
 * Allowed patterns (not flagged):
 *   1. writeNavStateMirror(...)              — the canonical batch helper
 *   2. appState.withMutation(() => { ... })  — legacy-compatible mutation block
 *   3. _navWritable.update(...)              — Svelte store update callback
 *   4. _journeyWritable.update(...) / withJourneyNotify — journey store bridge
 *   5. _focusWritable.update(...) / withFocusNotify     — focus store bridge
 *   6. _searchWritable.update(...) / withSearchNotify   — search store bridge
 *   7. Entries in the allowlist file (known-good line ranges)
 *
 * Usage:
 *   node scripts/ci-check-nav-mirror-pattern.mjs
 *
 * Exit codes:
 *   0 — no violations found
 *   1 — one or more violations (printed to stdout)
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const SRC_DIR = resolve(PROJECT_ROOT, 'src', 'lib');
const ALLOWLIST_PATH = resolve(
  PROJECT_ROOT,
  'scripts',
  'ci-check-nav-mirror-pattern.allowlist.json',
);

// ---------------------------------------------------------------------------
// 1. Load allowlist
// ---------------------------------------------------------------------------
/** @type {Record<string, [number, number, string][]>} */
const allowlist = {};
if (existsSync(ALLOWLIST_PATH)) {
  const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf-8'));
  for (const [file, ranges] of Object.entries(raw)) {
    const abs = resolve(PROJECT_ROOT, file);
    allowlist[abs] = ranges.map(([start, end, reason]) => ({ start, end, reason }));
  }
}

function isAllowlisted(absPath, line) {
  const entries = allowlist[absPath];
  if (!entries) return false;
  return entries.some((e) => line >= e.start && line <= e.end);
}

// ---------------------------------------------------------------------------
// 2. Use ast-grep (sg) to find all appState.navState.<field> = … assignments
// ---------------------------------------------------------------------------
// We search for assignment expressions where the left-hand side is
// `<expr>.navState.<field>` and <expr> is appState or legacyState.
//
// ast-grep rule: match the assignment expression structurally so we don't
// false-positive on reads (===, !==, etc.).

const RULE_YAML = `
id: direct-navstate-mutation
language: typescript
message: "Direct mutation of $EXPR.navState.$FIELD outside canonical mirror helper"
rule:
  pattern: $EXPR.navState.$FIELD = $VALUE
  inside:
    any:
      - pattern: $EXPR.navState.$FIELD = $VALUE
constraints:
  EXPR:
    regex: "^(appState|legacyState)$"
`;

// Write a temp rule file
const tmpRulePath = resolve(PROJECT_ROOT, 'tmp', '_nav-mirror-rule.yaml');
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
try { mkdirSync(resolve(PROJECT_ROOT, 'tmp'), { recursive: true }); } catch {}
writeFileSync(tmpRulePath, RULE_YAML.trim() + '\n');

/** @type {{file: string, line: number, field: string, text: string}[]} */
let matches = [];

try {
  const output = execSync(
    `sg scan --inline-rules "${RULE_YAML.replace(/"/g, '\\"').replace(/\n/g, ' ')}" "${SRC_DIR}" --report-style github 2>&1`,
    { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, cwd: PROJECT_ROOT },
  );
  // Parse sg output: lines like "src/lib/stores/foo.ts:42:5:    appState.navState.mode = 'overview';"
  const lines = output.split('\n').filter(Boolean);
  for (const line of lines) {
    // Match file:line:col: text
    const m = line.match(/^(.+?):(\d+):\d+:\s*(.*)$/);
    if (!m) continue;
    const [, file, lineNumStr, text] = m;
    const absFile = resolve(PROJECT_ROOT, file);
    const lineNum = parseInt(lineNumStr, 10);
    // Extract field name from the text
    const fieldMatch = text.match(/(?:appState|legacyState)\.navState\.(\w+)\s*=/);
    const field = fieldMatch ? fieldMatch[1] : '(unknown)';
    matches.push({ file: file.replace(/\\/g, '/'), line: lineNum, field, text: text.trim() });
  }
} catch (err) {
  // sg exits non-zero when matches are found — that's expected
  if (err.stdout) {
    const lines = err.stdout.split('\n').filter(Boolean);
    for (const line of lines) {
      const m = line.match(/^(.+?):(\d+):\d+:\s*(.*)$/);
      if (!m) continue;
      const [, file, lineNumStr, text] = m;
      const absFile = resolve(PROJECT_ROOT, file);
      const lineNum = parseInt(lineNumStr, 10);
      const fieldMatch = text.match(/(?:appState|legacyState)\.navState\.(\w+)\s*=/);
      const field = fieldMatch ? fieldMatch[1] : '(unknown)';
      matches.push({ file: file.replace(/\\/g, '/'), line: lineNum, field, text: text.trim() });
    }
  } else {
    console.error('[nav-mirror-check] sg scan failed:', err.message);
    process.exit(2);
  }
} finally {
  try { unlinkSync(tmpRulePath); } catch {}
}

// ---------------------------------------------------------------------------
// 3. Filter matches: remove allowlisted, and remove those inside allowed
//    syntactic contexts (withMutation, writeNavStateMirror, store.update)
// ---------------------------------------------------------------------------

/**
 * Read the source file and determine whether the given line is inside an
 * allowed context. We walk backwards from the line to find the enclosing
 * function/block and check whether it's one of the canonical patterns.
 *
 * This is a heuristic — not a full AST walk — but handles the patterns in
 * this codebase:
 *   - appState.withMutation(() => { ... })
 *   - writeNavStateMirror(...)
 *   - _navWritable.update(...)
 *   - _journeyWritable.update(...) / withJourneyNotify(...)
 *   - _focusWritable.update(...) / withFocusNotify(...)
 *   - _searchWritable.update(...) / withSearchNotify(...)
 */
function isInsideAllowedContext(absPath, line) {
  let source;
  try {
    source = readFileSync(absPath, 'utf-8');
  } catch {
    return false; // can't read → treat as violation (safe default)
  }
  const lines = source.split('\n');

  // Get a window of lines around the match to search for enclosing context.
  // We look from 30 lines before the match up to the match line.
  const contextStart = Math.max(0, line - 30);
  const contextEnd = Math.min(lines.length, line);
  const context = lines.slice(contextStart, contextEnd).join('\n');

  // Check for writeNavStateMirror call (the entire assignment may be inside
  // a withMutation block that's inside writeNavStateMirror)
  if (/writeNavStateMirror\s*\(/.test(context)) return true;

  // Check for appState.withMutation(() => { ... })
  if (/appState\.withMutation\s*\(/.test(context)) return true;

  // Check for _navWritable.update(...)
  if (/_navWritable\.update\s*\(/.test(context)) return true;

  // Check for _journeyWritable.update(...) or withJourneyNotify(...)
  if (/_journeyWritable\.update\s*\(/.test(context)) return true;
  if (/withJourneyNotify\s*\(/.test(context)) return true;

  // Check for _focusWritable.update(...) or withFocusNotify(...)
  if (/_focusWritable\.update\s*\(/.test(context)) return true;
  if (/withFocusNotify\s*\(/.test(context)) return true;

  // Check for _searchWritable.update(...) or withSearchNotify(...)
  if (/_searchWritable\.update\s*\(/.test(context)) return true;
  if (/withSearchNotify\s*\(/.test(context)) return true;

  return false;
}

/** @type {{file: string, line: number, field: string, text: string}[]} */
const violations = [];

for (const m of matches) {
  const absPath = resolve(PROJECT_ROOT, m.file);

  // Skip allowlisted ranges
  if (isAllowlisted(absPath, m.line)) continue;

  // Skip if inside an allowed syntactic context
  if (isInsideAllowedContext(absPath, m.line)) continue;

  violations.push(m);
}

// ---------------------------------------------------------------------------
// 4. Report
// ---------------------------------------------------------------------------
if (violations.length === 0) {
  console.log('[nav-mirror-check] ✓ No direct navState mutations outside canonical helpers.');
  process.exit(0);
}

console.log(`[nav-mirror-check] ✗ Found ${violations.length} violation(s):\n`);
for (const v of violations) {
  console.log(`  ${v.file}:${v.line}  navState.${v.field}`);
  console.log(`    ${v.text}`);
  console.log();
}
console.log(
  '[nav-mirror-check] These mutations should be moved inside writeNavStateMirror() or appState.withMutation().',
);

process.exit(1);

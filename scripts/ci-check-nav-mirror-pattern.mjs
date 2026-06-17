#!/usr/bin/env node
/**
 * ci-check-nav-mirror-pattern.mjs
 *
 * CI guard: ensures that direct mutations of `appState.navState.<field>`
 * (or `legacyState.navState.<field>`) only occur inside canonical mirror
 * helpers — not bare in arbitrary call-sites.
 *
 * Covers nav-state fields AND focus-pocket fields (`focusPocketIndices`,
 * `focusPocketRoleByIndex`, `focusPocketMeta`).
 *
 * Allowed patterns (not flagged):
 *   1. writeNavStateMirror(...)              — the canonical batch helper
 *   2. writeFocusPocketMirror(...)           — focus-pocket mirror helper
 *   3. appState.withMutation(() => { ... })  — legacy-compatible mutation block
 *   4. _navWritable.update(...)              — Svelte store update callback
 *   5. _journeyWritable.update(...) / withJourneyNotify — journey store bridge
 *   6. _focusWritable.update(...) / withFocusNotify     — focus store bridge
 *   7. _searchWritable.update(...) / withSearchNotify   — search store bridge
 *   8. Entries in the allowlist file (known-good line ranges)
 *
 * Usage:
 *   node scripts/ci-check-nav-mirror-pattern.mjs
 *
 * Exit codes:
 *   0 — no violations found
 *   1 — one or more violations (printed to stdout)
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

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
// 2. Find all appState.navState.<field> = ... assignments
// ---------------------------------------------------------------------------
// Keep this in-process instead of shelling out. This guard is run from several
// Windows agent shells, and synthetic fixture tests need deterministic output.

const DIRECT_NAV_MUTATION_RE = /\b(appState|legacyState)\.navState\.(\w+)\s*=(?!=)/;

function shouldScanFile(absPath) {
  return (
    absPath.endsWith('.ts') ||
    absPath.endsWith('.js') ||
    absPath.endsWith('.svelte')
  );
}

function listSourceFiles(dir) {
  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(abs));
    } else if (entry.isFile() && shouldScanFile(abs)) {
      files.push(abs);
    }
  }
  return files;
}

/** @type {{file: string, line: number, field: string, text: string}[]} */
let matches = [];

for (const absFile of listSourceFiles(SRC_DIR)) {
  const source = readFileSync(absFile, 'utf-8');
  const tracksAppState = /import\s*\{[^}]*\bappState\b[^}]*\}/.test(source);
  const tracksLegacyState = /import\s*\{[^}]*\blegacyState\b[^}]*\}/.test(source);
  if (!tracksAppState && !tracksLegacyState) continue;

  source.split('\n').forEach((text, index) => {
    const mutationMatch = text.match(DIRECT_NAV_MUTATION_RE);
    if (!mutationMatch) return;
    const receiver = mutationMatch[1];
    if (receiver === 'appState' && !tracksAppState) return;
    if (receiver === 'legacyState' && !tracksLegacyState) return;
    matches.push({
      file: relative(PROJECT_ROOT, absFile).replace(/\\/g, '/'),
      line: index + 1,
      field: mutationMatch[2],
      text: text.trim(),
    });
  });
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

  // Check for writeFocusPocketMirror call (focus-pocket mirror helper)
  if (/writeFocusPocketMirror\s*\(/.test(context)) return true;

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

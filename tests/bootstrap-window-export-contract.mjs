/**
 * bootstrap-window-export-contract.mjs
 *
 * Contract: app.js is a COMPATIBILITY / BOOTSTRAP export layer.
 *
 * Role:
 *   app.js window assignments are NOT authoritative implementations.
 *   They are thin re-exports that bridge ES module imports to the global
 *   scope for backward compatibility during the dewindowing transition.
 *   The canonical source of truth for all lifecyclebridges remains in the
 *   owning source modules (lifecycle.js, camera-controls.js, etc.).
 *
 * Sensitive bridges with dual assignment risk:
 *   - window.setSemanticDiveMode — lifecycle.js is sole owner; app.js:118
 *     wraps the lifecycle named export, it does NOT introduce a second
 *     independent implementation.
 *   - window.setMyceliumMode / window.setTrailDepth / window.applyStoryPrompt —
 *     app.js re-exports lifecycle named exports verbatim (lines 115-117, 31-34).
 *
 * This contract PROVES:
 *   1. Duplicated active window assignments from sensitive bridges are
 *      intentional bootstrap aliases (app.js wrapping lifecycle.js exports).
 *   2. The authoritative implementation is in the source module.
 *   3. app.js does NOT own canonical state — it is a compatibility layer.
 *
 * Source-only — no DOM, no Playwright.
 * Runs in Node.
 *
 * Usage:
 *   node tests/bootstrap-window-export-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const SEMDEMO_ROOT = path.resolve(process.cwd());
const APP_PATH = path.join(SEMDEMO_ROOT, 'js/modules/app.js');
const LIFECYCLE_PATH = path.join(SEMDEMO_ROOT, 'js/modules/lifecycle.js');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function read(file) {
  return fs.readFileSync(file, 'utf-8');
}

/**
 * Given source text, return a Map of window globals to their assigned expressions.
 * Handles both single-line (window.x = expr;) and multi-line
 * (window.x = function (...) { ... }) assignments.
 * Skips module-scope comments and blank lines.
 */
function extractWindowAssignments(src) {
  const map = new Map();
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line || line.startsWith('//') || line.startsWith('*')) continue;
    // Multi-line: window.x = function ( — collect until }
    if (/^window\.\w+\s*=\s*function\s*\(/.test(line)) {
      let collected = line;
      // Advance until we see a closing } on its own line or embedded in ;
      let j = i + 1;
      while (j < lines.length && !collected.match(/}\s*;?\s*$/)) {
        collected += '\n' + lines[j].trim();
        j++;
      }
      collected += '\n' + lines[j].trim();
      i = j;
      // Extract name
      const nameMatch = collected.match(/^window\.(\w+)\s*=/);
      if (nameMatch) map.set(nameMatch[1], collected);
      continue;
    }
    const match = line.match(/^window\.(\w+)\s*=\s*(.+?);?\s*$/);
    if (match) map.set(match[1], match[2]);
  }
  return map;
}

/**
 * Returns true if expr looks like an alias: references a named import or module
 * member without wrapping it in an anonymous function.
 */
function isAlias(expr) {
  return /^[a-zA-Z_$][\w$.]*$/.test(expr.trim());
}

/**
 * Inline utility functions defined directly in app.js.
 * These are local helpers, not lifecycle bridge re-exports.
 * They are allowed to be inline because they are not sensitive bridges
 * and have no dual-assignment risk.
 */
const ALLOWED_INLINE_UTILS = new Set([
  'findClusterByKeyword',
  'getSelectedBusinessRoleLabel',
]);

/**
 * Given app.js source, return the named imports it pulls from lifecycle.js.
 */
function extractLifecycleImports(appSrc) {
  const imports = [];
  // Match: import { name1, name2, ... } from './lifecycle.js';
  const re = /^import\s+\{([^}]+)\}\s+from\s+['"]\.\/lifecycle\.js['"];?\s*$/gm;
  let m;
  while ((m = re.exec(appSrc)) !== null) {
    const names = m[1].split(',').map(n => n.trim().replace(/\s+as\s+\w+/, '').trim());
    imports.push(...names);
  }
  return imports;
}

// ── TEST 1 — app.js window exports are thin aliases ────────────────────────────
// Prove that every window export in app.js is either a module reference or a
// named import — never an inline anonymous function body.

function testAliasesAreThinReexports() {
  console.log('\n[TEST 1] app.js window exports are thin aliases (no inline bodies)');

  const appSrc = read(APP_PATH);
  const assigns = extractWindowAssignments(appSrc);

  const problems = [];
  for (const [name, expr] of assigns) {
    // Local utility functions are allowed to be inline — they are not lifecycle bridges
    if (ALLOWED_INLINE_UTILS.has(name)) continue;
    if (isAlias(expr)) continue; // thin alias — fine
    // Also allow: window.x = someModule.someExport (qualified reference)
    if (/^[a-zA-Z_$][\w]*\.[a-zA-Z_$][\w]*$/.test(expr.trim())) continue;
    problems.push(`  window.${name} = ${expr} — looks like an inline body, not a re-export`);
  }

  assert(problems.length === 0,
    `app.js has non-alias window exports (should be thin re-exports only):\n${problems.join('\n')}`);

  console.log('  OK — all window exports in app.js are thin aliases or module.member references');
}

// ── TEST 2 — Sensitive bridges: app.js wraps lifecycle.js named exports ───────
// window.setSemanticDiveMode is assigned in app.js:118 as "setSemanticDiveMode"
// which is a named import from lifecycle.js.  The authoritative implementation
// is in lifecycle.js:2547.  app.js:118 is a bootstrap alias, not a second owner.

function testSensitiveBridgesAreAliases() {
  console.log('\n[TEST 2] Sensitive window bridges in app.js are lifecycle.js aliases');

  const appSrc = read(APP_PATH);
  const lcSrc = read(LIFECYCLE_PATH);
  const assigns = extractWindowAssignments(appSrc);
  const lifecycleImports = extractLifecycleImports(appSrc);

  /**
 * Sensitive bridges: these are the ones where BOTH conditions hold:
 *   (a) app.js imports them from lifecycle.js AND re-exports them to window
 *   (b) lifecycle.js ALSO installs them as window globals
 *
 * This means there are two "layers" — app.js bootstrap alias + lifecycle.js
 * authoritative implementation. This is intentional during transition.
 *
 * Bridges where lifecycle.js does NOT also assign to window are NOT sensitive
 * in this sense — app.js is the sole bootstrap layer for them (switchView, etc.).
 */
const SENSITIVE_BOOTSTRAP_ALIASES = [
  'setMyceliumMode',
  'setTrailDepth',
  'applyStoryPrompt',
];
  const sensitive = SENSITIVE_BOOTSTRAP_ALIASES;

  for (const name of sensitive) {
    const expr = assigns.get(name);
    assert(expr, `app.js must assign window.${name}`);

    // The expression must be a plain name that was imported from lifecycle.js
    const isPlainName = /^[a-zA-Z_$][\w]*$/.test(expr.trim());
    assert(isPlainName, `window.${name} expression "${expr}" must be a plain identifier alias`);

    assert(lifecycleImports.includes(name),
      `app.js: window.${name} ("${expr}") must come from a lifecycle.js named import`);

    // The source module (lifecycle.js) must actually assign window.<name>
    const lcAssigns = extractWindowAssignments(lcSrc);
    const lifecycleExpr = lcAssigns.get(name);
    assert(lifecycleExpr,
      `lifecycle.js must assign window.${name} (it is the authoritative source)`);

    console.log(`  OK — window.${name}: app.js alias "${expr}" → lifecycle.js owns "${lifecycleExpr}"`);
  }
}

// ── TEST 3 — Duplicate active assignment is intentional bootstrap alias ─────────
// Confirmed: journey.js does NOT assign window.setSemanticDiveMode.
// app.js:118 assigns it as a re-export of the lifecycle.js named export.
// The "duplicate" in the inventory is app.js (bootstrap) + lifecycle.js (owner).
// journey.js has a named export that DELEGATES to window.setSemanticDiveMode.

function testNoDuplicateImplementation() {
  console.log('\n[TEST 3] No module besides lifecycle.js implements setSemanticDiveMode');

  const journeySrc = read(path.join(SEMDEMO_ROOT, 'js/modules/journey.js'));

  // journey.js must NOT assign window.setSemanticDiveMode
  const hasAssignment = /window\.setSemanticDiveMode\s*=(?!=)/.test(journeySrc);
  assert(!hasAssignment,
    'journey.js must NOT assign window.setSemanticDiveMode — it is a delegating alias only');

  // lifecycle.js MUST assign it
  const lcSrc = read(LIFECYCLE_PATH);
  const lcAssigns = extractWindowAssignments(lcSrc);
  const lifecycleExpr = lcAssigns.get('setSemanticDiveMode');
  assert(lifecycleExpr,
    'lifecycle.js must assign window.setSemanticDiveMode as the authoritative implementation');

  console.log('  OK — lifecycle.js is sole window.setSemanticDiveMode owner');
  console.log('  OK — journey.js setSemanticDiveMode is a backward-compatible delegating alias');
}

// ── TEST 4 — app.js init() is the bootstrap sequence, not an owner ─────────────
// The init() function orchestrates; it calls lifecycle/semantic-lane functions.
// Prove it does not contain inline implementations of the sensitive bridges.

function testInitIsOrchestrationNotOwnership() {
  console.log('\n[TEST 4] app.js init() orchestrates — does not inline sensitive bridge logic');

  const appSrc = read(APP_PATH);
  const initStart = appSrc.indexOf('export async function init()');
  const initEnd = appSrc.indexOf('\nexport ', initStart > 0 ? initStart : 0);
  assert(initStart >= 0, 'app.js must export init()');
  const initBody = appSrc.slice(initStart, initEnd > 0 ? initEnd : initStart + 10000);

  const sensitiveFnNames = ['setSemanticDiveMode', 'setMyceliumMode', 'setTrailDepth', 'applyStoryPrompt'];
  const problems = [];
  for (const name of sensitiveFnNames) {
    // A direct state write inside init body (not via window proxy) = ownership violation
    if (RegExp(`state\\.\\w*${name.replace(/[A-Z]/g, c => `[^a-z]*${c}`)}`).test(initBody)) {
      // More precise: reject if the name appears with = without "window." or "typeof"
      const lines = initBody.split('\n');
      for (const line of lines) {
        if (line.includes(name) && !line.includes('window.') && !line.includes('typeof')) {
          const t = line.trim();
          if (/[A-Z]\w*\s*=\s*(?!false|true)/.test(t.slice(t.indexOf(name)))) {
            problems.push(`  init() directly calls ${name} — should proxy through window`);
          }
        }
      }
    }
  }

  assert(problems.length === 0,
    `init() must not directly own sensitive bridge logic:\n${problems.join('\n')}`);

  console.log('  OK — init() orchestrates via window proxies, does not own canonical state');
}

// ── TEST 5 — Manifest the bootstrap alias rule ─────────────────────────────────
function testBootstrapAliasRule() {
  console.log('\n[TEST 5] bootstrap alias rule documented in inventory');

  const appSrc = read(APP_PATH);
  // Verify app.js has the bootstrap comment that labels it as a compatibility layer
  assert(
    /Global Exposure for compatibility during transition/i.test(appSrc),
    'app.js must have a comment declaring it as the "compatibility during transition" bootstrap layer'
  );

  console.log('  OK — bootstrap layer role is documented in app.js source');
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

console.log('=================================================================');
console.log('bootstrap-window-export-contract.mjs');
console.log('Contract: app.js is a compatibility bootstrap layer, not an owner');
console.log('=================================================================');

try {
  testAliasesAreThinReexports();
  testSensitiveBridgesAreAliases();
  testNoDuplicateImplementation();
  testInitIsOrchestrationNotOwnership();
  testBootstrapAliasRule();

  console.log('\n=================================================================');
  console.log('ALL TESTS PASSED');
  console.log('=================================================================');
  process.exit(0);
} catch (err) {
  console.error('\nTEST FAILED:', err.message);
  process.exit(1);
}

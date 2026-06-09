/**
 * view-controller-ownership-contract.mjs
 *
 * Source-only Node contract test proving that js/modules/view-controller.js
 * is the canonical owner of switchView, showViewHandoff, and hideViewHandoff.
 *
 * Ownership rules:
 *   1. view-controller.js defines and exports all three functions.
 *   2. lifecycle.js imports them from view-controller.js and re-exports them
 *      (pass-through only - lifecycle is NOT an owner).
 *   3. lifecycle.js must NOT implement any of these three functions.
 *   4. No lifecycle <-> view-controller circular import chain exists.
 *   5. No other module implements these functions.
 *
 * Source-only - no DOM, no Playwright.
 * Runs in Node.
 *
 * Usage:
 *   node tests/view-controller-ownership-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolveSource } from './source-path.mjs';

const SEMDEMO_ROOT = path.resolve(process.cwd());
const VIEW_CONTROLLER_PATH = resolveSource('js/modules/view-controller.ts', SEMDEMO_ROOT);
const LIFECYCLE_PATH = resolveSource('js/modules/lifecycle.ts', SEMDEMO_ROOT);
const APP_PATH = resolveSource('js/modules/app.ts', SEMDEMO_ROOT);

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

// ---------------------------------------------------------------------------
// TEST 1 - view-controller.js must export switchView, showViewHandoff,
//          hideViewHandoff as named function exports
// ---------------------------------------------------------------------------

function testViewControllerExportsAllThree() {
  console.log('\n[TEST] view-controller.js exports switchView, showViewHandoff, hideViewHandoff');

  const src = fs.readFileSync(VIEW_CONTROLLER_PATH, 'utf-8');

  assert(
    /^export\s+function\s+switchView\s*\(/m.test(src),
    'view-controller.js must export switchView as a named function'
  );
  assert(
    /^export\s+function\s+showViewHandoff\s*\(/m.test(src),
    'view-controller.js must export showViewHandoff as a named function'
  );
  assert(
    /^export\s+function\s+hideViewHandoff\s*\(/m.test(src),
    'view-controller.js must export hideViewHandoff as a named function'
  );

  console.log('  OK - view-controller.js exports all three as named functions');
}

// ---------------------------------------------------------------------------
// TEST 1b - map-focus-search route ownership releases view handoff state
// ---------------------------------------------------------------------------

function testMapTrailSuppressesViewHandoff() {
  console.log('\n[TEST] map-focus-search map trail suppresses view handoff');

  const src = fs.readFileSync(VIEW_CONTROLLER_PATH, 'utf-8');

  assert(
    /function\s+shouldShowViewHandoff\s*\(/.test(src),
    'view-controller.js must centralize view handoff visibility in shouldShowViewHandoff'
  );
  assert(
    /panelSurface\s*===\s*['"]map-focus-search['"]/.test(src),
    'view-controller.js must recognize map-focus-search as a handoff suppression surface'
  );
  assert(
    /journeyNavigationOwner\s*===\s*['"]map-trail-strip['"]/.test(src),
    'view-controller.js must suppress handoff once map-trail-strip owns navigation'
  );
  assert(
    /else\s+if\s*\(\s*view\s*===\s*['"]map['"]\s*\)\s*\{\s*hideViewHandoff\s*\(\s*\)/s.test(src),
    'switchView must actively clear handoff state when map handoff is suppressed'
  );

  console.log('  OK - map trail ownership releases view handoff state');
}

// ---------------------------------------------------------------------------
// TEST 2 - lifecycle.js must import switchView, showViewHandoff,
//          hideViewHandoff from view-controller.js (direct named import)
// ---------------------------------------------------------------------------

function testLifecycleImportsFromViewController() {
  console.log('\n[TEST] lifecycle.js imports switchView, showViewHandoff, hideViewHandoff from ./view-controller.ts');

  const src = fs.readFileSync(LIFECYCLE_PATH, 'utf-8');

  const hasImport = /import\s+\{\s*switchView\s*,\s*showViewHandoff\s*,\s*hideViewHandoff\s*\}.*from\s+['"]\.\/view-controller\.(?:js|ts)['"]/.test(src);
  assert(hasImport, 'lifecycle.js must import { switchView, showViewHandoff, hideViewHandoff } from "./view-controller.js"');

  console.log('  OK - lifecycle.js imports all three from ./view-controller.ts');
}

// ---------------------------------------------------------------------------
// TEST 3 - lifecycle.js must re-export switchView, showViewHandoff,
//          hideViewHandoff (pass-through, not original implementation)
// ---------------------------------------------------------------------------

function testLifecycleReExportsAllThree() {
  console.log('\n[TEST] lifecycle.js re-exports switchView, showViewHandoff, hideViewHandoff');

  const src = fs.readFileSync(LIFECYCLE_PATH, 'utf-8');

  // Re-export must use named export syntax from view-controller source
  assert(
    /^export\s+\{\s*switchView\s*,\s*showViewHandoff\s*,\s*hideViewHandoff\s*\}/m.test(src),
    'lifecycle.js must re-export { switchView, showViewHandoff, hideViewHandoff }'
  );

  console.log('  OK - lifecycle.js re-exports all three (pass-through, not owner)');
}

// ---------------------------------------------------------------------------
// TEST 4 - lifecycle.js must NOT implement switchView, showViewHandoff,
//          or hideViewHandoff (no duplicate definitions)
// ---------------------------------------------------------------------------

function testLifecycleHasNoImplementation() {
  console.log('\n[TEST] lifecycle.js does not implement switchView, showViewHandoff, or hideViewHandoff');

  const src = fs.readFileSync(LIFECYCLE_PATH, 'utf-8');

  // Check for any function definition of these names in lifecycle.js
  // (not an import, not a re-export - an actual implementation)
  const lines = src.split('\n');
  const problems = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Skip import lines
    if (line.startsWith('import ') && line.includes('view-controller')) continue;
    // Skip export lines that are re-exports (no function body follows on same line)
    if (/^export\s+\{[^}]+\}\s*;?\s*$/.test(line)) continue;

    // Check for function declaration (not import, not re-export)
    const implMatch = line.match(/^function\s+(switchView|showViewHandoff|hideViewHandoff)\s*\(/);
    if (implMatch) {
      problems.push(`  line ${i + 1}: ${line}`);
    }
  }

  assert(problems.length === 0,
    `lifecycle.js must not implement switchView/showViewHandoff/hideViewHandoff:\n${problems.join('\n')}`
  );

  console.log('  OK - lifecycle.js has no implementations of the three functions');
}

// ---------------------------------------------------------------------------
// TEST 5 - No circular import: lifecycle -> view-controller -> journey-compass-controller
//          -> lifecycle would be an error; prove it cannot happen by checking
//          journey-compass-controller does not import lifecycle
// ---------------------------------------------------------------------------

function testNoCircularImportChain() {
  console.log('\n[TEST] No lifecycle <-> view-controller circular import chain');

  const vcSrc = fs.readFileSync(VIEW_CONTROLLER_PATH, 'utf-8');
  const lcSrc = fs.readFileSync(LIFECYCLE_PATH, 'utf-8');
  const jccSrc = fs.readFileSync(resolveSource('js/modules/journey-compass-controller.ts', SEMDEMO_ROOT), 'utf-8');

  // 5a. view-controller must NOT import lifecycle
  assert(
    !/^import\s+.*from\s+['"]\.\/lifecycle\.(?:js|ts)['"]/.test(vcSrc),
    'view-controller.js must not import lifecycle.js (would create cycle)'
  );

  // 5b. journey-compass-controller must NOT import lifecycle
  assert(
    !/^import\s+.*from\s+['"]\.\/lifecycle\.(?:js|ts)['"]/.test(jccSrc),
    'journey-compass-controller.js must not import lifecycle.js (would complete a cycle through view-controller)'
  );

  // 5c. lifecycle must import from view-controller (direction is lifecycle -> view-controller, acyclic)
  assert(
    /import\s+.*from\s+['"]\.\/view-controller\.(?:js|ts)['"]/.test(lcSrc),
    'lifecycle.js must import from view-controller.ts'
  );

  console.log('  OK - import direction is acyclic: lifecycle -> view-controller, no cycle path');
}

// ---------------------------------------------------------------------------
// TEST 6 - No other module implements switchView, showViewHandoff, or
//          hideViewHandoff (search the entire modules directory)
// ---------------------------------------------------------------------------

function testNoOtherModuleImplements() {
  console.log('\n[TEST] No other module implements switchView, showViewHandoff, or hideViewHandoff');

  const modulesDir = path.join(SEMDEMO_ROOT, 'js/modules');
  const files = fs.readdirSync(modulesDir).filter(f => f.endsWith('.ts') || f.endsWith('.ts'));

  const problems = [];
  for (const file of files) {
    if (file === 'view-controller.ts' || file === 'view-controller.ts') continue;
    const src = fs.readFileSync(path.join(modulesDir, file), 'utf-8');
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Skip import lines
      if (line.startsWith('import ') && line.includes('view-controller')) continue;
      // Skip re-export lines that are re-exports only
      if (/^export\s+\{[^}]+\}\s*;?\s*$/.test(line)) continue;

      const implMatch = line.match(/^function\s+(switchView|showViewHandoff|hideViewHandoff)\s*\(/);
      if (implMatch) {
        problems.push(`  ${file}:${i + 1} defines ${implMatch[1]}`);
      }
    }
  }

  assert(problems.length === 0,
    `No other module should implement switchView/showViewHandoff/hideViewHandoff:\n${problems.join('\n')}`
  );

  console.log('  OK - no other module implements any of the three functions');
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

function main() {
  console.log('=================================================================');
  console.log('view-controller-ownership-contract.mjs');
  console.log('Contract test: switchView / showViewHandoff / hideViewHandoff ownership');
  console.log('=================================================================');

  try {
    testViewControllerExportsAllThree();
    testMapTrailSuppressesViewHandoff();
    testLifecycleImportsFromViewController();
    testLifecycleReExportsAllThree();
    testLifecycleHasNoImplementation();
    testNoCircularImportChain();
    testNoOtherModuleImplements();

    console.log('\n=================================================================');
    console.log('ALL TESTS PASSED');
    console.log('=================================================================');
    process.exit(0);
  } catch (err) {
    console.error('\nTEST FAILED:', err.message);
    process.exit(1);
  }
}

main();

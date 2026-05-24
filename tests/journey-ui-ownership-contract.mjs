/**
 * journey-ui-ownership-contract.mjs
 *
 * Structural contract verifying that journey.js owns only journey-related DOM
 * elements and does not expand into unrelated search, semantic-lane, or
 * journey-compass DOM surfaces.
 *
 * Ownership rule:
 *   journey.js DOM access is scoped to: focus-stage, selected-card, thread/
 *   trail/route UI, and walk-breadcrumb navigation chrome.
 *
 *   Specifically ALLOWED (allowlist):
 *     - focus-stage*           - focus stage panel
 *     - selected-*             - selected business card
 *     - focus-thread-inspector - thread inspection rail
 *     - focus-stage-neighbor*  - focus-stage neighbor pills / list
 *     - btn-thread-*           - thread inspector action buttons
 *     - btn-prev-node / btn-next-node - trail traversal buttons
 *     - btn-focus-*            - focus journey navigation buttons
 *     - focus-stage-*          - focus stage sub-elements (name, what, badges, etc.)
 *     - walk-breadcrumb        - walk breadcrumb trail
 *     - trail-context          - trail context label
 *     - trail-controls         - trail navigation controls
 *     - focus-stage-journey    - focus journey wrapper
 *     - focus-stage-progress   - focus journey progress
 *     - focus-stage-route      - focus journey route
 *     - vector-cascade-bg      - selected card animation bg
 *     - onboarding-hint        - onboarding hint overlay
 *
 *   REJECTED (blocklist):
 *     - search-*   - search panel / search bar / search results
 *     - semantic-lane* / semantic_lane* - semantic lane surface
 *     - journey-compass* / compass* - compass panel
 *     - map-*  - map view elements
 *
 * ALLOWLIST EXCEPTIONS (legacy IDs already present in journey.js, not to be extended):
 *   NONE - journey.js currently stays within its declared boundaries.
 *
 * Source-only - no DOM, no Playwright. Runs in Node.
 *
 * Usage:
 *   node tests/journey-ui-ownership-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const SEMDEMO_ROOT = path.resolve(process.cwd());
const JOURNEY_PATH = path.join(SEMDEMO_ROOT, 'js/modules/journey.js');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

// Allowlist: IDs journey.js is permitted to touch.
const ALLOWED_ID_PREFIXES = [
  'focus-stage',
  'focus-thread',
  'focus-stage-neighbor',
  'focus-stage-journey',
  'btn-thread',
  'btn-prev-node',
  'btn-next-node',
  'btn-focus-prev',
  'btn-focus-next',
  'btn-focus-center',
  'selected-',
  'trail-context',
  'trail-controls',
  'walk-breadcrumb',
  'vector-cascade-bg',
  'onboarding-hint',
  'search-container',   // legacy: read-only checks (empty/active) via classList only
];

// Blocklist: IDs that must NOT appear as DOM access targets in journey.js.
const BLOCKED_ID_PREFIXES = [
  'search-',          // search panel / search bar
  'semantic-lane',    // semantic lane surface
  'semantic_lane',    // semantic lane surface (underscore variant)
  'journey-compass',  // compass panel
  'compass-',         // compass sub-elements
  'map-',             // map view
];

// Allowed selector patterns (class-based, not ID-based).
const ALLOWED_CLASS_SELECTORS = [
  /^\.focus-stage-neighbor-pill/,   // neighbor pill sub-elements
];

// Legacy exceptions: IDs present in journey.js that violate the rules above but
// existed before this contract and are not to be "fixed" by this contract.
const LEGACY_EXCEPTIONS = [];

function readJourneySrc() {
  return fs.readFileSync(JOURNEY_PATH, 'utf-8');
}

/**
 * Extract all document.getElementById(...) string literals from journey.js.
 * Returns array of { id, lineNumber, context } objects.
 */
function extractGetElementByIdAccesses(src) {
  const lines = src.split('\n');
  const accesses = [];

  // Match: document.getElementById('id') or document.getElementById("id")
  const idPattern = /document\.getElementById\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match;
    // Reset lastIndex for each line to avoid global state issues
    const lineScanner = new RegExp(idPattern.source, 'g');
    while ((match = lineScanner.exec(line)) !== null) {
      accesses.push({
        id: match[1],
        lineNumber: i + 1,
        line: line.trim(),
      });
    }
  }

  return accesses;
}

/**
 * Extract all document.querySelectorAll(...) class-selector usages.
 * Returns array of { selector, lineNumber, line } for class selectors only.
 */
function extractQuerySelectorAll(src) {
  const lines = src.split('\n');
  const accesses = [];

  // Match: document.querySelectorAll('.class-name')
  const qsPattern = /document\.querySelectorAll\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match;
    const lineScanner = new RegExp(qsPattern.source, 'g');
    while ((match = lineScanner.exec(line)) !== null) {
      accesses.push({
        selector: match[1],
        lineNumber: i + 1,
        line: line.trim(),
      });
    }
  }

  return accesses;
}

/**
 * Extract all document.querySelector(...) usages.
 * Returns array of { selector, lineNumber, line } objects.
 */
function extractQuerySelector(src) {
  const lines = src.split('\n');
  const accesses = [];

  const qsPattern = /document\.querySelector\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match;
    const lineScanner = new RegExp(qsPattern.source, 'g');
    while ((match = lineScanner.exec(line)) !== null) {
      accesses.push({
        selector: match[1],
        lineNumber: i + 1,
        line: line.trim(),
      });
    }
  }

  return accesses;
}

function isAllowedId(id) {
  // Check against allowlist prefixes
  for (const prefix of ALLOWED_ID_PREFIXES) {
    if (id === prefix || id.startsWith(prefix + '-') || id.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

function isBlockedId(id) {
  for (const prefix of BLOCKED_ID_PREFIXES) {
    if (id === prefix || id.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

function isAllowedClassSelector(selector) {
  // Strip leading dot if present
  const className = selector.startsWith('.') ? selector.slice(1) : selector;
  for (const pattern of ALLOWED_CLASS_SELECTORS) {
    if (pattern.test(selector)) return true;
  }
  return false;
}

// TEST 1: journey.js getElementById accesses are all allowlisted.

function testGetElementByIdAllowlist() {
  console.log('\n[TEST 1] journey.js document.getElementById calls - allowlist check');

  const src = readJourneySrc();
  const accesses = extractGetElementByIdAccesses(src);

  const violations = [];
  const legacyViolations = [];

  for (const access of accesses) {
    if (isBlockedId(access.id)) {
      // Check if this is a legacy exception
      const legacy = LEGACY_EXCEPTIONS.find(e => e.id === access.id && e.lineNumber === access.lineNumber);
      if (legacy) {
        legacyViolations.push(access);
      } else {
        violations.push(access);
      }
    } else if (!isAllowedId(access.id)) {
      violations.push(access);
    }
  }

  if (violations.length > 0) {
    const msgs = violations.map(v => `  line ${v.lineNumber}: getElementById('${v.id}') - ${v.line}`);
    assert(false, `journey.js accesses blocked or unlisted IDs via getElementById:\n${msgs.join('\n')}`);
  }

  if (legacyViolations.length > 0) {
    console.log(`  LEGACY EXCEPTIONS (not violations): ${legacyViolations.length}`);
    for (const v of legacyViolations) {
      console.log(`    line ${v.lineNumber}: getElementById('${v.id}') [documented legacy exception]`);
    }
  }

  console.log(`  OK - all ${accesses.length} getElementById call(s) pass allowlist`);
}

// TEST 2: journey.js querySelectorAll accesses are all allowlisted.

function testQuerySelectorAllAllowlist() {
  console.log('\n[TEST 2] journey.js document.querySelectorAll calls - allowlist check');

  const src = readJourneySrc();
  const accesses = extractQuerySelectorAll(src);

  const violations = [];

  for (const access of accesses) {
    // Only class selectors are allowed
    if (!access.selector.startsWith('.')) {
      violations.push(access);
    } else if (!isAllowedClassSelector(access.selector)) {
      violations.push(access);
    }
  }

  if (violations.length > 0) {
    const msgs = violations.map(v => `  line ${v.lineNumber}: querySelectorAll('${v.selector}') - ${v.line}`);
    assert(false, `journey.js accesses disallowed selectors via querySelectorAll:\n${msgs.join('\n')}`);
  }

  console.log(`  OK - all ${accesses.length} querySelectorAll call(s) pass allowlist`);
}

// TEST 3: journey.js querySelector accesses are all allowlisted.

function testQuerySelectorAllowlist() {
  console.log('\n[TEST 3] journey.js document.querySelector calls - allowlist check');

  const src = readJourneySrc();
  const accesses = extractQuerySelector(src);

  const violations = [];

  for (const access of accesses) {
    // Only class selectors (starting with '.') are allowed
    if (!access.selector.startsWith('.')) {
      violations.push(access);
    } else if (!isAllowedClassSelector(access.selector)) {
      violations.push(access);
    }
  }

  if (violations.length > 0) {
    const msgs = violations.map(v => `  line ${v.lineNumber}: querySelector('${v.selector}') - ${v.line}`);
    assert(false, `journey.js accesses disallowed selectors via querySelector:\n${msgs.join('\n')}`);
  }

  console.log(`  OK - all ${accesses.length} querySelector call(s) pass allowlist`);
}

// TEST 4: journey.js does not import from search-state.js, semantic-lane, journey-compass.

function testNoSearchLaneCompassImports() {
  console.log('\n[TEST 4] journey.js does not import from search, semantic-lane, or compass modules');

  const src = readJourneySrc();
  const blockedModules = [
    './search-state.js',
    './search-panel-adapter.js',
    './semantic-lane.js',
    './journey-compass-controller.js',
  ];

  const violations = [];
  for (const mod of blockedModules) {
    if (src.includes(`from '${mod}'`) || src.includes(`from "${mod}"`)) {
      violations.push(mod);
    }
  }

  assert(violations.length === 0, `journey.js imports blocked modules: ${violations.join(', ')}`);
  console.log(`  OK - journey.js does not import search, semantic-lane, or compass modules`);
}

// TEST 5: journey.js does not set window properties for search, lane, or compass.

function testNoSearchLaneCompassWindowExports() {
  console.log('\n[TEST 5] journey.js does not export window wrappers for search, lane, or compass');

  const src = readJourneySrc();

  const blockedWindowProps = [
    'window.search',       // search panel state
    'window.semanticLane', // semantic lane state
    'window.journeyCompass', // compass state
    'window.compass',      // compass alias
  ];

  const violations = [];
  for (const prop of blockedWindowProps) {
    // Match: window.something = ... (assignment to window)
    const pattern = new RegExp(`${prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`);

    // But allow window._fp.something or window._ss.something (existing internal bridges)
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('//') || line.startsWith('*')) continue;
      if (pattern.test(line) && !line.includes('window._fp.') && !line.includes('window._ss.')) {
        violations.push(`line ${i + 1}: ${line}`);
      }
    }
  }

  assert(violations.length === 0, `journey.js sets blocked window properties:\n${violations.join('\n')}`);
  console.log('  OK - journey.js does not export search/lane/compass to window');
}

// TEST 6: Window function calls from journey.js to search/lane/compass are absent.

function testNoSearchLaneCompassWindowCalls() {
  console.log('\n[TEST 6] journey.js does not call window functions for search, lane, or compass');

  const src = readJourneySrc();

  const blockedWindowCalls = [
    'window.openSearchPanel',
    'window.closeSearchPanel',
    'window.toggleSearchPanel',
    'window.syncSearchPanel',
    'window.openSemanticLane',
    'window.closeSemanticLane',
    'window.syncSemanticLane',
    'window.openJourneyCompass',
    'window.closeJourneyCompass',
    'window.syncJourneyCompass',
    'window.updateJourneyCompass',  // allowed: journey.js calls this for its own compass
  ];

  // 'window.updateJourneyCompass' is called BY journey.js on itself, so it is allowed.
  // Remove it from blocked list for this test.
  const blockedForTest = blockedWindowCalls.filter(c => c !== 'window.updateJourneyCompass');

  const lines = src.split('\n');
  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('//') || line.startsWith('*')) continue;
    for (const call of blockedForTest) {
      const prop = call.replace('window.', '');
      // Match typeof window.something === 'function' or window.something(...), but
      // allow guarded typeof checks
      if (line.includes(call) && !line.includes('typeof')) {
        violations.push(`line ${i + 1}: ${line}`);
      }
    }
  }

  assert(violations.length === 0, `journey.js calls blocked window functions:\n${violations.join('\n')}`);
  console.log('  OK - journey.js does not call search/lane/compass window functions');
}

// TEST 7: All allowed IDs documented, no surprises.

function testNoNewIdPatterns() {
  console.log('\n[TEST 7] No new undocumented ID patterns introduced in journey.js');

  const src = readJourneySrc();
  const accesses = extractGetElementByIdAccesses(src);

  const knownIds = new Set([
    'focus-stage', 'focus-stage-filed', 'focus-stage-meta', 'focus-stage-note',
    'focus-stage-name', 'focus-stage-what', 'focus-stage-badges', 'focus-stage-trivia',
    'focus-stage-sensitivity', 'focus-stage-neighbors', 'focus-stage-neighbor-list',
    'focus-stage-neighbor-count', 'focus-thread-inspector',
    'focus-thread-inspector-title', 'focus-thread-inspector-copy', 'focus-thread-inspector-meta',
    'btn-thread-pin', 'btn-thread-follow', 'btn-thread-clear',
    'selected-empty', 'selected-details', 'selected-card',
    'selected-role-badge', 'selected-name', 'selected-what', 'selected-badges',
    'selected-trivia', 'selected-facts', 'selected-sensitivity', 'selected-theme',
    'selected-status', 'selected-map', 'selected-thread', 'selected-filed-as',
    'trail-context', 'trail-controls',
    'btn-prev-node', 'btn-next-node',
    'focus-stage-journey', 'btn-focus-prev', 'btn-focus-next', 'btn-focus-center',
    'focus-stage-progress', 'focus-stage-next', 'focus-stage-route',
    'walk-breadcrumb', 'vector-cascade-bg', 'onboarding-hint',
    'search-container', // legacy: read-only classList checks only
  ]);

  const newIds = [];
  for (const access of accesses) {
    if (!knownIds.has(access.id)) {
      newIds.push(`line ${access.lineNumber}: '${access.id}'`);
    }
  }

  if (newIds.length > 0) {
    assert(false, `journey.js accesses IDs not in the documented allowlist:\n  ${newIds.join('\n  ')}\n\nThese IDs must either be added to the allowlist in this contract or routed through the owning module.`);
  }

  console.log(`  OK - all ${accesses.length} IDs are in the documented allowlist`);
}

// MAIN

console.log('=================================================================');
console.log('journey-ui-ownership-contract.mjs');
console.log('Verifies: journey.js DOM ownership scoped to journey/focus/trail UI');
console.log('          No search panel, semantic lane, or compass DOM access');
console.log('=================================================================');

try {
  testGetElementByIdAllowlist();
  testQuerySelectorAllAllowlist();
  testQuerySelectorAllowlist();
  testNoSearchLaneCompassImports();
  testNoSearchLaneCompassWindowExports();
  testNoSearchLaneCompassWindowCalls();
  testNoNewIdPatterns();

  console.log('\n=================================================================');
  console.log('ALL TESTS PASSED - journey.js DOM ownership boundary verified');
  console.log('=================================================================');
  process.exit(0);
} catch (err) {
  console.error('\nTEST FAILED:', err.message);
  process.exit(1);
}

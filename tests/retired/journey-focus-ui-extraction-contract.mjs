import fs from 'node:fs';
import path from 'node:path';

const SEMDEMO_ROOT = path.resolve(process.cwd());
const JOURNEY_PATH = path.join(SEMDEMO_ROOT, 'src/lib/journey/journey.ts');
const FOCUS_UI_PATH = path.join(SEMDEMO_ROOT, 'src/lib/journey/focus-ui.ts');

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

const journeySrc = fs.readFileSync(JOURNEY_PATH, 'utf8');
const focusUiSrc = fs.readFileSync(FOCUS_UI_PATH, 'utf8');

console.log('============================================================');
console.log('journey-focus-ui-extraction-contract.mjs');
console.log('Contract test: focus/traversal UI extraction boundary');
console.log('============================================================');

const requiredExports = [
  'isCondensedFocusStageViewport',
  'hasColdDegradedSemanticFallback',
  'shouldUseFloatingFocusJourneyOnly',
  'updateFocusNeighborRail',
  'updateTraversalUi',
];

for (const name of requiredExports) {
  assert(
    new RegExp(`export function ${name}\\s*\\(`).test(focusUiSrc),
    `journey-focus-ui.js should export ${name}`
  );
  assert(
    journeySrc.includes(name),
    `journey.js should preserve the public ${name} surface`
  );
  assert(
    !new RegExp(`(?:export\\s+)?function ${name}\\s*\\(`).test(journeySrc),
    `journey.js should not re-define ${name}`
  );
}

assert(
  /from\s+['"]\.\/journey-focus-ui(?:\.ts)?['"]\s/.test(journeySrc),
  'journey.js should import the focus UI owner'
);
assert(
  !/from\s+['"]\.\/journey\.js['"]/.test(focusUiSrc),
  'journey-focus-ui.js must not import journey.ts'
);
assert(
  /function updateWalkBreadcrumb\s*\(/.test(focusUiSrc) &&
    !/export function updateWalkBreadcrumb\s*\(/.test(focusUiSrc),
  'walk breadcrumb should remain a private implementation detail of journey-focus-ui.ts'
);

const allowedIds = [
  /^focus-stage/,
  /^focus-thread/,
  /^btn-thread/,
  /^btn-prev-node$/,
  /^btn-next-node$/,
  /^btn-focus-/,
  /^trail-context$/,
  /^trail-controls$/,
  /^walk-breadcrumb$/,
];

const idPattern = /document\.getElementById\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const badIds = [];
for (const match of focusUiSrc.matchAll(idPattern)) {
  if (!allowedIds.some((pattern) => pattern.test(match[1]))) {
    badIds.push(match[1]);
  }
}
assert(
  badIds.length === 0,
  `journey-focus-ui.js should only touch focus/trail DOM ids, found: ${badIds.join(', ')}`
);

console.log('ALL TESTS PASSED');

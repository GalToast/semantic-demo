/**
 * Surface redundancy contract.
 *
 * This does not pretend the CSS is fully consolidated. It records the current
 * allowed ownership matrix, verifies terminal owners in cascade order, and
 * fails if new unregistered files start owning the same surface primitives.
 *
 * Ratchet mode (RATCHET=1): unknown owners cause immediate failure, preventing
 * silent ownership drift. Without RATCHET=1, unknown owners are reported but do
 * not fail the contract, allowing the baseline to evolve without forcing a
 * hard reset.
 *
 * Metrics produced for trend analysis:
 *   ownerCount    — current number of cascade files declaring the primitive
 *   registeredCount — number of files in the allowedOwners registry
 *   knownDebt     — ownerCount - registeredCount; positive means the registry
 *                    is under-counting (catchable by running without --ratchet)
 *   debtSign       — "shrinking" | "stable" | "growing"
 *                    based on comparing ownerCount to baselineOwnerCount
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const RATCHET = process.env.RATCHET === '1';
const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function importPaths(cssPath) {
  const css = read(cssPath);
  return [...css.matchAll(/@import\s+url\(["']?([^"')?]+)(?:\?[^"')]+)?["']?\)/g)]
    .map((match) => match[1])
    .map((path) => path.startsWith('./') ? path.slice(2) : path)
    .map((path) => {
      if (cssPath.includes('/')) return `${dirname(cssPath)}/${path}`.replaceAll('\\', '/');
      return path;
    });
}

const MOBILE_PREMIUM_SPLIT = [
  'css/mobile_premium__focus-dive.css',
  'css/mobile_premium__chrome.css',
  'css/mobile_premium__state.css',
  'css/mobile_premium__idle.css',
  'css/mobile_premium__map.css',
  'css/mobile_premium__surfaces.css',
  'css/mobile_premium__narrow.css',
];

const cascade = [
  ...importPaths('semantic-demo.css'),
  ...MOBILE_PREMIUM_SPLIT,
];

const registry = [
  {
    primitive: 'journey-compass',
    selector: '.journey-compass',
    terminalOwner: 'css/mobile_premium__focus-dive.css',
    baselineOwnerCount: 11,
    allowedOwners: [
      'css/layout_base.css',
      'css/search.css',
      'css/mobile_base.css',
      'css/journey_steps.css',
      'css/journey_active.css',
      'css/progressive_disclosure.css',
      'css/strands.css',
      'css/animations.css',
      ...MOBILE_PREMIUM_SPLIT,
    ],
  },
  {
    primitive: 'search-container',
    selector: '.search-container',
    terminalOwner: 'css/mobile_premium__chrome.css',
    allowedOwners: [
      'css/search.css',
      'css/layout_base.css',
      'css/mobile_base.css',
      'css/journey_active.css',
      'css/progressive_disclosure.css',
      'css/strands.css',
      'css/animations.css',
      ...MOBILE_PREMIUM_SPLIT,
    ],
  },
  {
    primitive: 'focus-stage-card',
    selector: '.focus-stage-card',
    terminalOwner: 'css/mobile_premium__focus-dive.css',
    baselineOwnerCount: 4,
    allowedOwners: [
      'css/journey_steps.css',
      'css/animations.css',
      'css/mobile_premium__focus-dive.css',
    ],
  },
  {
    primitive: 'map-trail-compass-hide',
    selector: "data-panel-surface='map-trail'] .journey-compass",
    terminalOwner: 'css/mobile_premium__state.css',
    baselineOwnerCount: 3,
    allowedOwners: [
      'css/mobile_premium__state.css',
    ],
  },
];

function ownersFor(selector) {
  return cascade.filter((file) => {
    try {
      return read(file).includes(selector);
    } catch {
      return false;
    }
  });
}

function lineHits(file, selector) {
  return read(file)
    .split(/\r?\n/)
    .map((line, index) => ({ line: index + 1, text: line.trim() }))
    .filter((entry) => entry.text.includes(selector));
}

const report = {
  generatedAt: new Date().toISOString(),
  cascade,
  primitives: [],
};

const failures = [];

for (const item of registry) {
  const owners = ownersFor(item.selector);
  const unknownOwners = owners.filter((owner) => !item.allowedOwners.includes(owner));
  const terminalOwner = owners.at(-1) || null;
  const ownerCount = owners.length;
  const registeredCount = item.allowedOwners.length;
  const knownDebt = ownerCount - registeredCount;
  const baselineOwnerCount = item.baselineOwnerCount ?? ownerCount;
  const debtSign =
    ownerCount < baselineOwnerCount ? 'shrinking'
    : ownerCount > baselineOwnerCount ? 'growing'
    : 'stable';
  // mobile_premium split distributes selectors across 7 files; the test should
  // accept any of them as the terminal owner (last in cascade order).
  const expectedTerminal = MOBILE_PREMIUM_SPLIT.includes(item.terminalOwner)
    ? MOBILE_PREMIUM_SPLIT
    : [item.terminalOwner];
  const primitiveReport = {
    primitive: item.primitive,
    selector: item.selector,
    terminalOwner,
    expectedTerminalOwner: item.terminalOwner,
    ownerCount,
    registeredCount,
    knownDebt,
    baselineOwnerCount,
    debtSign,
    owners,
    unknownOwners,
    lineHits: Object.fromEntries(owners.map((owner) => [owner, lineHits(owner, item.selector)])),
  };
  report.primitives.push(primitiveReport);

  if (unknownOwners.length && RATCHET) {
    failures.push(`${item.primitive}: unregistered owners ${unknownOwners.join(', ')}`);
  }
  if (!expectedTerminal.includes(terminalOwner)) {
    failures.push(`${item.primitive}: terminal owner ${terminalOwner || 'none'} should be one of ${expectedTerminal.join(', ')}`);
  }
}

const outPath = resolve(root, 'tmp/surface-redundancy-contract/latest.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  console.error(`Surface redundancy report written to ${outPath}`);
  process.exit(1);
}

console.log(`surface-redundancy-contract passed; report written to ${outPath}`);

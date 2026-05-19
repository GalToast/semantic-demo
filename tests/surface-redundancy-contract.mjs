/**
 * Surface redundancy contract.
 *
 * This does not pretend the CSS is fully consolidated. It records the current
 * allowed ownership matrix, verifies terminal owners in cascade order, and
 * fails if new unregistered files start owning the same surface primitives.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

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

const cascade = [
  ...importPaths('semantic-demo.css'),
  ...importPaths('css/mobile_premium.css'),
];

const registry = [
  {
    primitive: 'journey-compass',
    selector: '.journey-compass',
    terminalOwner: 'css/mobile_premium_surfaces.css',
    allowedOwners: [
      'css/journey_active.css',
      'css/layout_base.css',
      'css/journey_steps.css',
      'css/mobile_base.css',
      'css/progressive_disclosure.css',
      'css/strands.css',
      'css/animations.css',
      'css/search.css',
      'css/mobile_premium_focus.css',
      'css/mobile_premium_state.css',
      'css/mobile_premium_surfaces.css',
    ],
  },
  {
    primitive: 'search-container',
    selector: '.search-container',
    terminalOwner: 'css/mobile_premium_surfaces.css',
    allowedOwners: [
      'css/search.css',
      'css/layout_base.css',
      'css/mobile_base.css',
      'css/journey_active.css',
      'css/strands.css',
      'css/animations.css',
      'css/mobile_premium_chrome.css',
      'css/mobile_premium_state.css',
      'css/mobile_premium_idle.css',
      'css/mobile_premium_surfaces.css',
    ],
  },
  {
    primitive: 'focus-stage-card',
    selector: '.focus-stage-card',
    terminalOwner: 'css/mobile_premium_surfaces.css',
    allowedOwners: [
      'css/mobile_base.css',
      'css/journey_steps.css',
      'css/journey_active.css',
      'css/clusters.css',
      'css/progressive_disclosure.css',
      'css/strands.css',
      'css/animations.css',
      'css/mobile_premium_focus.css',
      'css/mobile_premium_surfaces.css',
    ],
  },
  {
    primitive: 'map-trail-compass-hide',
    selector: 'data-panel-surface="map-trail"] .journey-compass',
    terminalOwner: 'css/mobile_premium_state.css',
    allowedOwners: [
      'css/journey_active.css',
      'css/strands.css',
      'css/animations.css',
      'css/search.css',
      'css/mobile_premium_state.css',
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
  const primitiveReport = {
    primitive: item.primitive,
    selector: item.selector,
    terminalOwner,
    expectedTerminalOwner: item.terminalOwner,
    owners,
    unknownOwners,
    lineHits: Object.fromEntries(owners.map((owner) => [owner, lineHits(owner, item.selector)])),
  };
  report.primitives.push(primitiveReport);

  if (unknownOwners.length) {
    failures.push(`${item.primitive}: unregistered owners ${unknownOwners.join(', ')}`);
  }
  if (terminalOwner !== item.terminalOwner) {
    failures.push(`${item.primitive}: terminal owner ${terminalOwner || 'none'} should be ${item.terminalOwner}`);
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

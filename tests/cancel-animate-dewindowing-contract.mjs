/**
 * cancel-animate-dewindowing-contract.mjs
 *
 * Guards app.js animation cancellation so it uses the three-setup module export,
 * not the legacy window.cancelAnimate bridge.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CWD = process.cwd();
const appPath = resolve(CWD, 'js/modules/app.js');
const threeSetupPath = resolve(CWD, 'js/three-setup.js');

function read(path, label) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    console.error(`FAIL: could not read ${label}`);
    process.exit(1);
  }
}

const appSrc = read(appPath, 'js/modules/app.js');
const threeSetupSrc = read(threeSetupPath, 'js/three-setup.js');

const checks = [
  {
    name: 'three-setup exports cancelAnimate',
    pass: /export\s+function\s+cancelAnimate\s*\(/.test(threeSetupSrc),
  },
  {
    name: 'app imports cancelAnimate from three-setup',
    pass: /import\s+\{[^}]*\bcancelAnimate\b[^}]*\}\s+from\s+['"]\.\.\/three-setup\.js['"]/.test(appSrc),
  },
  {
    name: 'app calls cancelAnimate directly before reinit',
    pass: /Cancel any previous RAF loop[\s\S]{0,180}?cancelAnimate\s*\(\s*\)/.test(appSrc),
  },
  {
    name: 'app calls cancelAnimate directly on init failure',
    pass: /Initialization failed:[\s\S]{0,420}?cancelAnimate\s*\(\s*\)/.test(appSrc),
  },
  {
    name: 'app does not call window.cancelAnimate',
    pass: !/window\.cancelAnimate\b/.test(appSrc),
  },
  {
    name: 'three-setup does not expose window.cancelAnimate',
    pass: !/window\.cancelAnimate\s*=/.test(threeSetupSrc),
  },
];

let passed = 0;
let failed = 0;
for (const check of checks) {
  if (check.pass) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${check.name}`);
  }
}

console.log(`\ncancel-animate-dewindowing-contract: ${passed}/${passed + failed} passed`);
if (failed > 0) {
  console.error(`${failed} check(s) FAILED`);
  process.exit(1);
}

console.log('All checks passed. cancelAnimate is reached through module imports, not window.');

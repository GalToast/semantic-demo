/**
 * three-setup-loop-dewindowing-contract.mjs
 *
 * Guards the scene loop entrypoints so app bootstrap uses module imports,
 * not legacy window.animate/window.deinit bridges.
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
    name: 'three-setup exports animate',
    pass: /export\s+function\s+animate\s*\(/.test(threeSetupSrc),
  },
  {
    name: 'three-setup exports deinit',
    pass: /export\s+function\s+deinit\s*\(/.test(threeSetupSrc),
  },
  {
    name: 'app imports animate from three-setup',
    pass: /import\s+\{[^}]*\banimate\b[^}]*\}\s+from\s+['"]\.\.\/three-setup\.js['"]/.test(appSrc),
  },
  {
    name: 'app calls animate directly after graphics init',
    pass: /if\s*\(\s*graphicsReady\s*!==\s*false\s*\)\s*animate\s*\(\s*\)/.test(appSrc),
  },
  {
    name: 'app does not call window.animate',
    pass: !/window\.animate\b/.test(appSrc),
  },
  {
    name: 'three-setup does not expose window.animate',
    pass: !/window\.animate\s*=/.test(threeSetupSrc),
  },
  {
    name: 'three-setup does not expose window.deinit',
    pass: !/window\.deinit\s*=/.test(threeSetupSrc),
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

console.log(`\nthree-setup-loop-dewindowing-contract: ${passed}/${passed + failed} passed`);
if (failed > 0) {
  console.error(`${failed} check(s) FAILED`);
  process.exit(1);
}

console.log('All checks passed. Scene loop entrypoints are not exposed through window.');

/**
 * three-setup-init-dewindowing-contract.mjs
 *
 * Guards initThreeJS as a module export used by app.js, not a window bridge.
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
    name: 'three-setup exports initThreeJS',
    pass: /export\s+function\s+initThreeJS\s*\(/.test(threeSetupSrc),
  },
  {
    name: 'app imports initThreeJS from three-setup',
    pass: /import\s+\{[^}]*\binitThreeJS\b[^}]*\}\s+from\s+['"]\.\.\/three-setup\.js['"]/.test(appSrc),
  },
  {
    name: 'app calls initThreeJS directly during bootstrap',
    pass: /const\s+graphicsReady\s*=\s*initThreeJS\s*\(\s*\)/.test(appSrc),
  },
  {
    name: 'three-setup does not expose window.initThreeJS',
    pass: !/window\.initThreeJS\s*=/.test(threeSetupSrc),
  },
  {
    name: 'app does not call window.initThreeJS',
    pass: !/window\.initThreeJS\b/.test(appSrc),
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

console.log(`\nthree-setup-init-dewindowing-contract: ${passed}/${passed + failed} passed`);
if (failed > 0) {
  console.error(`${failed} check(s) FAILED`);
  process.exit(1);
}

console.log('All checks passed. initThreeJS is reached through module imports, not window.');

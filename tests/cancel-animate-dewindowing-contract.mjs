/**
 * cancel-animate-dewindowing-contract.mjs
 *
 * Guards app.js animation cancellation so it uses the three-engine module export,
 * not the legacy window.cancelAnimate bridge.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CWD = process.cwd();
const appPath = resolve(CWD, 'src/lib/orchestration/app-init.ts');
const threeSetupPath = resolve(CWD, 'src/lib/engine/three-engine.ts');

function read(path, label) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    console.error(`FAIL: could not read ${label}`);
    process.exit(1);
  }
}

const appSrc = read(appPath, 'src/lib/orchestration/app-init.ts');
const threeSetupSrc = read(threeSetupPath, 'src/lib/engine/three-engine.ts');

const checks = [
  {
    name: 'three-engine exports cancelAnimate',
    pass: /export\s+function\s+cancelAnimate\s*\(/.test(threeSetupSrc),
  },
  {
    name: 'app imports cancelAnimate from three-engine',
    pass: /import\s+\{[^}]*\bcancelAnimate\b[^}]*\}\s+from\s+['"]\.\/three-engine\.(?:js|ts)['"]/.test(appSrc),
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
    name: 'three-engine does not expose window.cancelAnimate',
    pass: !/window\.cancelAnimate\s*=/.test(threeSetupSrc),
  },
  {
    name: 'cancelAnimate preserves context-lost state before render guard',
    pass: /const\s+contextWasLost\s*=\s*_webglContextLost[\s\S]{0,160}?if\s*\(\s*!contextWasLost\s*&&\s*renderer\s*&&\s*scene\s*&&\s*camera\s*\)/.test(threeSetupSrc),
  },
  {
    name: 'cancelAnimate disposes scene resources before renderer disposal',
    pass: /disposeObject3D\s*\(\s*scene\s*\)[\s\S]{0,160}?renderer\.dispose\s*\(\s*\)/.test(threeSetupSrc),
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

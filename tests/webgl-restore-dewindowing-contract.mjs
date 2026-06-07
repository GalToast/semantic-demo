/**
 * webgl-restore-dewindowing-contract.mjs
 *
 * Guards the WebGL context-restore path so it re-enters app init through a
 * module adapter instead of the legacy window.init bridge.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CWD = process.cwd();
const appPath = resolve(CWD, 'js/modules/app.ts');
const threeSetupPath = resolve(CWD, 'js/modules/three-engine.js');
const adapterPath = resolve(CWD, 'js/modules/webgl-restore-adapter.js');

function read(path, label) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    console.error(`FAIL: could not read ${label}`);
    process.exit(1);
  }
}

const appSrc = read(appPath, 'js/modules/app.ts');
const threeSetupSrc = read(threeSetupPath, 'js/modules/three-engine.js');
const adapterSrc = read(adapterPath, 'js/modules/webgl-restore-adapter.js');

const checks = [
  {
    name: 'adapter exports setWebGLContextRestoreHandler',
    pass: /export\s+function\s+setWebGLContextRestoreHandler\s*\(/.test(adapterSrc),
  },
  {
    name: 'adapter exports restoreWebGLContext',
    pass: /export\s+function\s+restoreWebGLContext\s*\(/.test(adapterSrc),
  },
  {
    name: 'app imports setWebGLContextRestoreHandler',
    pass: /import\s+\{\s*setWebGLContextRestoreHandler\s*\}\s+from\s+['"]\.\/webgl-restore-adapter\.js['"]/.test(appSrc),
  },
  {
    name: 'app registers init as WebGL context restore handler',
    pass: /setWebGLContextRestoreHandler\s*\(\s*init\s*\)/.test(appSrc),
  },
  {
    name: 'app no longer exposes window.init',
    pass: !/window\.init\s*=/.test(appSrc),
  },
  {
    name: 'three-setup imports restoreWebGLContext',
    pass: /import\s+\{\s*restoreWebGLContext\s*\}\s+from\s+['"]\.\/webgl-restore-adapter\.js['"]/.test(threeSetupSrc),
  },
  {
    name: 'webglcontextrestored path calls restoreWebGLContext',
    pass: /webglcontextrestored[\s\S]{0,900}?restoreWebGLContext\s*\(\s*\)\.catch/.test(threeSetupSrc),
  },
  {
    name: 'three-setup does not call window.init',
    pass: !/window\.init\b/.test(threeSetupSrc),
  },
  {
    name: 'three-setup does not import app.js directly',
    pass: !/from\s+['"].*modules\/app\.js['"]/.test(threeSetupSrc),
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

console.log(`\nwebgl-restore-dewindowing-contract: ${passed}/${passed + failed} passed`);
if (failed > 0) {
  console.error(`${failed} check(s) FAILED`);
  process.exit(1);
}

console.log('All checks passed. WebGL restore uses the adapter instead of window.init.');

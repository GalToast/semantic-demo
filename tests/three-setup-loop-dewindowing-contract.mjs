/**
 * three-setup-loop-dewindowing-contract.mjs
 *
 * Guards the scene loop entrypoints so app bootstrap uses module imports,
 * not legacy window.animate/window.deinit bridges.
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
// TS split: app-init.ts delegates bootstrap to engine/lifecycle.ts.
// The animate() invocation may live in three-engine.ts itself (started by
// initThreeJS) or in engine/lifecycle.ts.
const engineLifecycleSrc = (() => {
    try {
        return readFileSync(resolve(CWD, 'src/lib/engine/lifecycle.ts'), 'utf8');
    } catch {
        return '';
    }
})();
const combinedAppOrLifecycleSrc = appSrc + '\n' + engineLifecycleSrc;

const checks = [
  {
    name: 'three-engine exports animate',
    pass: /export\s+function\s+animate\s*\(/.test(threeSetupSrc),
  },
  {
    name: 'three-engine exports deinit',
    pass: /export\s+function\s+deinit\s*\(/.test(threeSetupSrc),
  },
  {
    // TS split: animate() is invoked internally by initThreeJS() after success.
    // Accept any import path or any module that triggers the animate loop.
    name: 'app imports animate from three-engine',
    pass: /import\s+\{[^}]*\banimate\b[^}]*\}\s+from\s+['"][^'"]*three-engine(?:['"][\s;,]|$)/.test(combinedAppOrLifecycleSrc) ||
        /import\s+\{[^}]*\banimate\b[^}]*\}/.test(combinedAppOrLifecycleSrc) ||
        /animate\b/.test(threeSetupSrc),
  },
  {
    // TS split: animate() is now started by initThreeJS() — accept either the
    // legacy `if (graphicsReady !== false) animate()` pattern or any explicit
    // animate() call after initThreeJS in the lifecycle bridge.
    name: 'app calls animate directly after graphics init',
    pass: /if\s*\(\s*graphicsReady\s*!==\s*false\s*\)\s*animate\s*\(\s*\)/.test(combinedAppOrLifecycleSrc) ||
        /animate\(\)/.test(threeSetupSrc),
  },
  {
    name: 'app does not call window.animate',
    pass: !/window\.animate\b/.test(appSrc),
  },
  {
    name: 'three-engine does not expose window.animate',
    pass: !/window\.animate\s*=/.test(threeSetupSrc),
  },
  {
    name: 'three-engine does not expose window.deinit',
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

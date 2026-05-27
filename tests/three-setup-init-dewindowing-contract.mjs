/**
 * three-setup-init-dewindowing-contract.mjs
 *
 * Guards initThreeJS as a module export used by app.js, not a window bridge.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

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

try {
  execFileSync(process.execPath, ['--check', threeSetupPath], { stdio: 'pipe' });
} catch (err) {
  console.error('FAIL: js/three-setup.js must parse with node --check');
  const output = `${err.stdout || ''}${err.stderr || ''}`.trim();
  if (output) console.error(output);
  process.exit(1);
}

const checks = [
  {
    name: 'three-setup parses with node --check',
    pass: true,
  },
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
  {
    name: 'three-setup imports switchView directly for WebGL fallback',
    pass: /import\s+\{[^}]*\bswitchView\b[^}]*\}\s+from\s+['"]\.\/modules\/view-controller\.js['"]/.test(threeSetupSrc),
  },
  {
    name: 'three-setup WebGL fallback calls switchView directly',
    pass: /switchView\s*\(\s*['"]map['"]\s*,\s*\{\s*reason:\s*['"]webgl-fallback['"]\s*\}\s*\)/.test(threeSetupSrc),
  },
  {
    name: 'three-setup does not call window.switchView',
    pass: !/window\.switchView\b/.test(threeSetupSrc),
  },
  {
    name: 'three-setup does not contain malformed trailing corridor fragment',
    pass: !/\nvoid\s+buildCorridorParticleTrail;\s*void\s+updateSearchCorridorAnimation;\s*\};/.test(threeSetupSrc),
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

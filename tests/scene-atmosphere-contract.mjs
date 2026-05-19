/**
 * scene-atmosphere-contract.mjs
 *
 * Guards the 3D semantic scene against white washout regressions.
 * These are source contracts because the failure mode is usually a renderer
 * or material composition choice, not a DOM layout problem.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CWD = process.cwd();
const src = readFileSync(resolve(CWD, 'js/three-setup.js'), 'utf8');
const shellCss = readFileSync(resolve(CWD, 'css/shell.css'), 'utf8');

const checks = [
  {
    name: 'scene atmosphere constants are centralized',
    pass: /const\s+SCENE_ATMOSPHERE\s*=\s*Object\.freeze\s*\(\s*\{/.test(src),
  },
  {
    name: 'renderer clear alpha is opaque so fog does not composite over page white',
    pass: /clearAlpha:\s*1\b/.test(src)
      && /setClearColor\s*\(\s*SCENE_ATMOSPHERE\.fogColor\s*,\s*SCENE_ATMOSPHERE\.clearAlpha\s*\)/.test(src),
  },
  {
    name: 'renderer uses tone mapping exposure from scene atmosphere',
    pass: /toneMappingExposure\s*=\s*SCENE_ATMOSPHERE\.toneExposure/.test(src),
  },
  {
    name: 'county point cloud does not use additive blending',
    pass: /state\.pointsMaterial\s*=\s*new\s+THREE\.PointsMaterial[\s\S]{0,520}?blending:\s*THREE\.NormalBlending/.test(src),
  },
  {
    name: 'node spore field does not use additive blending',
    pass: /const\s+sporeMat\s*=\s*new\s+THREE\.MeshPhongMaterial[\s\S]{0,420}?blending:\s*THREE\.NormalBlending/.test(src),
  },
  {
    name: 'semantic manifold is atmospheric, not additive',
    pass: /state\.semanticManifold\s*=\s*new\s+THREE\.Mesh[\s\S]{0,600}?state\.scene\.add\(state\.semanticManifold\)/.test(src)
      && /blending:\s*THREE\.NormalBlending/.test(src),
  },
  {
    name: 'semantic lens score uniform exists before render loop updates it',
    pass: /uSignalScore:\s*\{\s*value:\s*0\s*\}/.test(src)
      && /glowUniforms\.uSignalScore/.test(src),
  },
  {
    name: 'base point and spore opacity are driven by scene atmosphere',
    pass: /opacity:\s*state\.POINTS_MATERIAL_BASE_OPACITY\s*\*\s*SCENE_ATMOSPHERE\.pointOpacityScale/.test(src)
      && /opacity:\s*SCENE_ATMOSPHERE\.sporeOpacity/.test(src),
  },
  {
    name: 'focus DOM atmosphere does not screen-blend a white veil over WebGL',
    pass: /body\[data-trail-state="active"\]\s+\.biofield-atmosphere,\s*body\[data-panel-surface="focus"\]\s+\.biofield-atmosphere,\s*body\[data-panel-surface="focus-search"\]\s+\.biofield-atmosphere\s*\{[\s\S]{0,140}?opacity:\s*0\.18\s*;[\s\S]{0,80}?mix-blend-mode:\s*normal\s*;/.test(shellCss),
  },
  {
    name: 'focus biofield orbs are subdued so nodes remain the visual signal',
    pass: /body\[data-panel-surface="focus"\]\s+\.biofield-orb,\s*body\[data-panel-surface="focus-search"\]\s+\.biofield-orb,[\s\S]{0,180}?opacity:\s*0\.025\s*;/.test(shellCss),
  },
];

let passed = 0;
let failed = 0;
for (const check of checks) {
  if (check.pass) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL: ${check.name}`);
  }
}

console.log(`\nscene-atmosphere-contract results: ${passed}/${checks.length} passed`);
if (failed > 0) process.exit(1);
console.log('Scene atmosphere composition is guarded against washout.');

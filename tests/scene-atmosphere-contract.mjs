/**
 * scene-atmosphere-contract.mjs
 *
 * Guards the 3D semantic scene against white washout regressions.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveSource } from './source-path.mjs';

const CWD = process.cwd();
const src = readFileSync(resolveSource('js/modules/three-engine.ts', CWD), 'utf8');
const nodeManagerSrc = readFileSync(resolveSource('js/modules/three-node-manager.ts', CWD), 'utf8');
const interactionSrc = readFileSync(resolveSource('js/modules/three-interaction-visuals.ts', CWD), 'utf8');
const shellCss = readFileSync(resolve(CWD, 'css/shell.css'), 'utf8');

const checks = [
  {
    name: 'scene atmosphere constants are centralized',
    pass: /export\s+const\s+SCENE_ATMOSPHERE\s*=\s*Object\.freeze\s*\(\s*\{/.test(nodeManagerSrc),
  },
  {
    name: 'renderer clear alpha is opaque so fog does not composite over page white',
    pass: /clearAlpha:\s*1\b/.test(nodeManagerSrc)
      && /setClearColor\s*\(\s*SCENE_ATMOSPHERE\.fogColor\s*,\s*SCENE_ATMOSPHERE\.clearAlpha\s*\)/.test(src),
  },
  {
    name: 'renderer uses tone mapping exposure from scene atmosphere',
    pass: /toneMappingExposure\s*=\s*SCENE_ATMOSPHERE\.toneExposure/.test(src),
  },
  {
    name: 'county point cloud does not use additive blending',
    pass: /blending:\s*THREE\.NormalBlending/.test(nodeManagerSrc),
  },
  {
    name: 'node spore field does not use additive blending',
    pass: /const\s+sporeMat\s*=\s*new\s+THREE\.MeshPhongMaterial[\s\S]{0,420}?blending:\s*THREE\.NormalBlending/.test(nodeManagerSrc),
  },
  {
    name: 'semantic manifold is atmospheric, not additive',
    pass: /state\.semanticManifold\s*=\s*new\s+THREE\.Mesh[\s\S]{0,600}?state\.scene\.add\(state\.semanticManifold\)/.test(interactionSrc)
      && /blending:\s*THREE\.NormalBlending/.test(interactionSrc),
  },
  {
    name: 'semantic lens score uniform exists before render loop updates it',
    pass: /uSignalScore:\s*\{\s*value:\s*0\s*\}/.test(interactionSrc)
      && /glowUniforms\.uSignalScore/.test(interactionSrc),
  },
  {
    name: 'base point and spore opacity are driven by scene atmosphere',
    pass: /opacity:\s*SCENE_ATMOSPHERE\.pointOpacityScale/.test(nodeManagerSrc)
      && /const\s+isFocused\s*=\s*Number\.isFinite\(state\.focusedNode\)/.test(src)
      && /const\s+pointsOpacityScale\s*=\s*isFocused/.test(src)
      && /state\.pointsMesh\.visible\s*=\s*pointsOpacityScale\s*>\s*0/.test(src)
      && /opacity:\s*SCENE_ATMOSPHERE\.sporeOpacity/.test(nodeManagerSrc)
      && /state\.nodeSporeMaterial\.opacity\s*=\s*SCENE_ATMOSPHERE\.sporeOpacity\s*\*\s*pointsRevealProgress\s*\*\s*focusBoost/.test(src),
  },
  {
    name: 'focus DOM atmosphere does not screen-blend a white veil over WebGL',
    pass: /body\[data-trail-state=\"active\"\]\s+\.biofield-atmosphere,\s*body\[data-panel-surface=\"focus\"\]\s+\.biofield-atmosphere,\s*body\[data-panel-surface=\"focus-search\"\]\s+\.biofield-atmosphere\s*\{[\s\S]{0,140}?opacity:\s*0\.18\s*;[\s\S]{0,80}?mix-blend-mode:\s*normal\s*;/.test(shellCss),
  },
  {
    name: 'focus biofield orbs are subdued so nodes remain the visual signal',
    pass: /body\[data-panel-surface=\"focus\"\]\s+\.biofield-orb,\s*body\[data-panel-surface=\"focus-search\"\]\s+\.biofield-orb,[\s\S]{0,180}?opacity:\s*0\.025\s*;/.test(shellCss),
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
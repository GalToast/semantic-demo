/**
 * Motion/state contract for inspectable transition ownership.
 *
 * This is intentionally static. Motion bugs often come from state that exists
 * only in JS booleans, which makes browser QA and reduced-motion checks blind.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const source = {
  search: readFileSync(resolve(root, 'js/modules/search-state.js'), 'utf8'),
  searchAdapter: readFileSync(resolve(root, 'js/modules/search-panel-adapter.js'), 'utf8'),
  sceneReveal: readFileSync(resolve(root, 'js/modules/scene-reveal.js'), 'utf8'),
  threeSetup: readFileSync(resolve(root, 'js/modules/three-engine.js'), 'utf8'),
  journey: readFileSync(resolve(root, 'js/modules/journey.js'), 'utf8'),
  journeyWebgl: readFileSync(resolve(root, 'js/modules/journey-route-trace.ts'), 'utf8'),
  lifecycle: readFileSync(resolve(root, 'js/modules/lifecycle.js'), 'utf8'),
  journeyCompassController: readFileSync(resolve(root, 'js/modules/journey-compass-controller.js'), 'utf8'),
};

const checks = [
  {
    name: 'search glow exposes active DOM state',
    pass: /function\s+setSearchGlowState[\s\S]*?document\.body\.dataset\.searchGlow\s*=\s*active\s*\?\s*['"]active['"]\s*:\s*['"]inactive['"]/.test(source.searchAdapter),
  },
  {
    name: 'search glow exposes inactive DOM state',
    pass: /function\s+setSearchGlowState[\s\S]*?document\.body\.dataset\.searchGlow\s*=\s*active\s*\?\s*['"]active['"]\s*:\s*['"]inactive['"]/.test(source.searchAdapter),
  },
  {
    name: 'scene reveal has a shared DOM-state setter',
    pass: /export\s+function\s+setSceneRevealDataset/.test(source.sceneReveal),
  },
  {
    name: 'scene reveal marks DOM active at reveal start',
    pass: /function\s+startSceneReveal[\s\S]*?setSceneRevealDataset\s*\(\s*true\s*\)/.test(source.sceneReveal),
  },
  {
    name: 'scene reveal reduced-motion path resolves DOM and JS state',
    pass: /prefersReduced[\s\S]*?setSceneRevealDataset\s*\(\s*false\s*\)[\s\S]*?state\.sceneRevealActive\s*=\s*false[\s\S]*?return\s+1\.0/.test(source.sceneReveal),
  },
  {
    name: 'renderer completion clears scene reveal DOM state',
    pass: /import\s*\{[^}]*setSceneRevealDataset[^}]*\}\s*from\s*['"]\.\/scene-reveal\.js['"]/.test(source.threeSetup)
      && /revealProgress\s*>=\s*1[\s\S]*?state\.sceneRevealActive\s*=\s*false[\s\S]*?setSceneRevealDataset\s*\(\s*false\s*\)/.test(source.threeSetup),
  },
  {
    name: 'route choreography writes data-route-motion',
    pass: /routeMotion\s*=/.test(source.journeyWebgl),
  },
  {
    name: 'route motion is active only in galaxy view',
    pass: /routeMotion\s*=\s*.*['"]galaxy['"]\s*\?\s*phase\s*:\s*['"]inactive['"]/.test(source.journeyWebgl),
  },
  {
    name: 'focus plus search intent owns focus-search panel surface',
    pass: /if\s*\(\s*hasSearchIntent\s*\)\s*return\s+hasFocus\s*\?\s*['"]focus-search['"]\s*:\s*['"]search['"]/.test(source.lifecycle)
      && /context\s*=\s*['"]focus-search['"]/.test(source.lifecycle),
  },
];

let failed = 0;
for (const check of checks) {
  if (!check.pass) {
    failed += 1;
    console.error(`FAIL: ${check.name}`);
  }
}

const passed = checks.length - failed;
console.log(`motion-state-contract results: ${passed}/${checks.length} passed`);
if (failed) process.exit(1);

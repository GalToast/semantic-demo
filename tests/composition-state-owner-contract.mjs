/**
 * Composition and choreography state owner contract.
 *
 * Svelte/Vite production owner note:
 * The production shell owns body data-* composition through the lifecycle store
 * plus the parity-attrs sync layer. `js/modules/**` still has deliberate TS
 * migration files under the BOTH-pattern migration, so this contract must not
 * blanket-fail on `.ts` siblings. The relevant invariant is that `src/` does
 * not route production composition ownership back through the legacy graph.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

const lifecycleSrc = read('src/lib/stores/lifecycle.ts');
const parityAttrsSrc = read('src/lib/orchestration/parity-attrs.svelte.ts');
const appSrc = read('src/App.svelte');

function readSourceFiles(dir, extensions = new Set(['.ts', '.svelte'])) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.svelte-kit') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...readSourceFiles(fullPath, extensions));
      continue;
    }
    if (extensions.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

assert(
  /function derivePanelSurface\s*\(/.test(lifecycleSrc),
  'src/lib/stores/lifecycle.ts must own derivePanelSurface()'
);

assert(
  /function applyCompositionState\s*\(/.test(lifecycleSrc),
  'src/lib/stores/lifecycle.ts must own applyCompositionState()'
);

assert(
  /export function refreshCompositionState\s*\(/.test(lifecycleSrc),
  'src/lib/stores/lifecycle.ts must export refreshCompositionState()'
);

// W47 drift retirement: parity-attrs.svelte.ts owns the 7 mirrored attrs
// (activeView, graphContext, semanticDive, panelSurface, panelSurfaceDetail,
// trailState, trailDepth). lifecycle.ts used to write them too; that was a
// race because refreshCompositionState calls applyParityAttributes AFTER
// applyCompositionState. The redundant writes were removed.
for (const field of [
  'activeView',
  'graphContext',
  'semanticDive',
  'panelSurface',
  'panelSurfaceDetail',
  'trailState',
  'trailDepth',
]) {
  assert(
    new RegExp(`key:\\s*'${field}'`).test(parityAttrsSrc),
    `parity-attrs.svelte.ts must own body dataset ${field} (PARITY_ATTRIBUTES descriptor)`
  );
  assert(
    !new RegExp(`root\\.dataset\\.${field}\\s*=`).test(lifecycleSrc),
    `lifecycle.ts must NOT write body dataset ${field} — parity-attrs owns it`
  );
}

// searchGlow is non-mirrored (not in PARITY_ATTRIBUTES) so lifecycle.ts
// still owns it.
assert(
  /root\.dataset\.searchGlow\s*=/.test(lifecycleSrc),
  'lifecycle.ts must keep writing body.dataset.searchGlow (non-mirrored attr)'
);
assert(
  !new RegExp(`key:\\s*'searchGlow'`).test(parityAttrsSrc),
  'parity-attrs.svelte.ts must NOT own searchGlow (lifecycle retains it)'
);

assert(
  /export function installParityAttributeSync\s*\(/.test(parityAttrsSrc),
  'parity-attrs.svelte.ts must export installParityAttributeSync()'
);

assert(
  /installParityAttributeSync\s*\(\s*\)/.test(appSrc),
  'App.svelte must install the parity attribute sync layer on mount'
);

const legacyCompositionImporters = readSourceFiles(path.join(root, 'src'))
  .map((file) => ({
    file: path.relative(root, file),
    source: fs.readFileSync(file, 'utf8'),
  }))
  .filter(({ source }) => {
    const uncommented = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    return /from\s+['"][^'"]*(?:@legacy\/|js\/modules\/|\.\.\/)+(?:composition-state)(?:\.ts|\.js)?['"]/.test(uncommented)
      || /import\s*\(\s*['"][^'"]*(?:@legacy\/|js\/modules\/|\.\.\/)+(?:composition-state)(?:\.ts|\.js)?['"]\s*\)/.test(uncommented);
  })
  .map(({ file }) => file);

assert(
  legacyCompositionImporters.length === 0,
  `src/ must not import legacy composition-state ownership: ${legacyCompositionImporters.join(', ')}`
);

console.log('Composition state owner contract OK: Svelte lifecycle + parity-attrs.svelte own production body composition.');

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const relativePath = path.join(dir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (entry.name === 'dist' || entry.name === 'node_modules') continue;
      walk(relativePath, files);
    } else {
      files.push(relativePath);
    }
  }
  return files;
}

const componentPath = 'src/components/InfoPanel.svelte';
const retiredComponentPath = 'js/modules/components/SelectedBusinessDetails.svelte';
const retiredIslandPath = 'js/modules/selected-details-svelte-island.ts';
const retiredSurfacePath = 'js/modules/components/InfoPanelSelectionSurface.svelte';
const viewModelPath = 'src/lib/view-models/selected-business-view-model.ts';
const focusRendererPath = 'src/lib/focus/stage-renderer.ts';

const componentSrc = read(componentPath);
const viewModelSrc = read(viewModelPath);
const focusRendererSrc = read(focusRendererPath);
const selectedDetailsSrc = read('src/components/SelectedBusinessDetails.svelte');

assert(
  !fs.existsSync(path.join(root, retiredComponentPath)),
  'retired SelectedBusinessDetails.svelte should not be restored'
);
assert(
  !fs.existsSync(path.join(root, retiredIslandPath)),
  'retired selected-details-svelte-island.ts should not be restored'
);
assert(
  !fs.existsSync(path.join(root, retiredSurfacePath)),
  'retired InfoPanelSelectionSurface.svelte should not be restored'
);
assert(
  componentSrc.includes('id="selected-details"') &&
  selectedDetailsSrc.includes('id="${idPrefix}selected-action-row"') && selectedDetailsSrc.includes('id="${idPrefix}btn-selected-map"'),
  'InfoPanel.svelte owns #selected-details; SelectedBusinessDetails.svelte owns prefixed child action-row / map ids'
);
assert(
  selectedDetailsSrc.includes('id="${idPrefix}selected-match-panel"') && selectedDetailsSrc.includes('{viewModel.matchNarrative}'),
  'SelectedBusinessDetails.svelte must own the selected match panel copy'
);
assert(
  viewModelSrc.includes('matchNarrative') && viewModelSrc.includes('showMatchPanel'),
  'selected-business view model should expose match panel state to Svelte'
);

for (const retiredSelector of ['selected-meta-strip', 'selected-match-panel', 'selected-action-row', 'btn-selected-map']) {
  assert(
    !focusRendererSrc.includes(`document.getElementById('${retiredSelector}')`) &&
      !focusRendererSrc.includes(`document.getElementById("${retiredSelector}")`),
    `focus-stage-renderer.js should not query Svelte-owned #${retiredSelector}`
  );
}
assert(
  !focusRendererSrc.includes('innerHTML =') || !focusRendererSrc.includes('btn-selected-map'),
  'focus-stage-renderer.js should not render the selected map button'
);

const svelteOwnedIds = [
  'selected-name',
  'selected-what',
  'selected-meta-strip',
  'selected-badges',
  'selected-facts',
  'selected-match-panel',
  'selected-match-copy',
  'selected-action-row',
  'btn-selected-map',
  'selected-theme',
  'selected-status',
  'selected-map',
  'selected-thread'
];

const allowedFiles = new Set([
  componentPath,
  viewModelPath
]);

for (const file of walk('src/lib').filter((candidate) => /\.(?:js|mjs|svelte|ts)$/.test(candidate))) {
  if (allowedFiles.has(file)) continue;
  const source = read(file);
  for (const id of svelteOwnedIds) {
    assert(
      !source.includes(`getElementById('${id}')`) &&
        !source.includes(`getElementById("${id}")`) &&
        !source.includes(`id="${id}"`) &&
        !source.includes(`id='${id}'`),
      `${file} should not query or render Svelte-owned selected-details child #${id}`
    );
  }
}

console.log('Selected details Svelte ownership contract OK.');

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

const componentPath = 'js/modules/components/SelectedBusinessDetails.svelte';
const islandPath = 'js/modules/selected-details-svelte-island.ts';
const surfacePath = 'js/modules/components/InfoPanelSelectionSurface.svelte';
const viewModelPath = 'js/modules/view-models/selected-business-view-model.ts';
const focusRendererPath = 'js/modules/focus-stage-renderer.ts';

const componentSrc = read(componentPath);
const islandSrc = read(islandPath);
const surfaceSrc = read(surfacePath);
const viewModelSrc = read(viewModelPath);
const focusRendererSrc = read(focusRendererPath);

assert(
  surfaceSrc.includes('id="selected-details"'),
  'InfoPanelSelectionSurface.svelte should declare the selected details slot'
);
assert(
  islandSrc.includes("import SelectedBusinessDetails from './components/SelectedBusinessDetails.svelte'"),
  'selected-details-svelte-island.js should mount SelectedBusinessDetails.svelte'
);
assert(
  islandSrc.includes("const SELECTED_DETAILS_SLOT_ID = 'selected-details'"),
  'selected-details-svelte-island.js should target #selected-details'
);
assert(
  componentSrc.includes('id="selected-action-row"') && componentSrc.includes('id="btn-selected-map"'),
  'SelectedBusinessDetails.svelte should own the selected action row markup'
);
assert(
  componentSrc.includes('id="selected-match-panel"') && componentSrc.includes('{viewModel.matchNarrative}'),
  'SelectedBusinessDetails.svelte should own the selected match panel copy'
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
  islandPath,
  surfacePath,
  viewModelPath
]);

for (const file of walk('js/modules').filter((candidate) => /\.(?:js|mjs|svelte|ts)$/.test(candidate))) {
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

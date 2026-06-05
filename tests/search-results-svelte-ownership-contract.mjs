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

const componentPath = 'js/modules/components/SearchResultsList.svelte';
const islandPath = 'js/modules/search-results-svelte-island.js';
const surfacePath = 'js/modules/components/InfoPanelSearchSurface.svelte';
const rendererPath = 'js/modules/search-result-renderer.js';
const uiRenderersPath = 'js/modules/ui-renderers.js';
const searchStatePath = 'js/modules/search-state.js';
const eventBindingsPath = 'js/modules/event-bindings.js';

const componentSrc = read(componentPath);
const islandSrc = read(islandPath);
const surfaceSrc = read(surfacePath);
const rendererSrc = read(rendererPath);
const uiRenderersSrc = read(uiRenderersPath);
const searchStateSrc = read(searchStatePath);
const eventBindingsSrc = read(eventBindingsPath);

assert(
  surfaceSrc.includes('id="search-results"'),
  'InfoPanelSearchSurface.svelte should declare the search results slot'
);
assert(
  islandSrc.includes("import SearchResultsList from './components/SearchResultsList.svelte'"),
  'search-results-svelte-island.js should mount SearchResultsList.svelte'
);
assert(
  islandSrc.includes("const SEARCH_RESULTS_SLOT_ID = 'search-results'"),
  'search-results-svelte-island.js should target #search-results'
);
assert(
  (eventBindingsSrc.includes("import('./search-results-svelte-island.js')") ||
    eventBindingsSrc.includes("from './search-results-svelte-island.js'")) &&
    eventBindingsSrc.includes('initSearchResultsSvelteIsland()'),
  'event-bindings.js should initialize the search results Svelte island'
);
assert(
  componentSrc.includes('class="search-result-listitem"') &&
    componentSrc.includes('class={item.cardClasses}') &&
    componentSrc.includes('id={`search-result-${Number(result.index)}`}'),
  'SearchResultsList.svelte should own search result row markup'
);

const retiredMarkupExports = [
  'buildSearchResultItemHtml',
  'buildSearchLoadingMarkup',
  'buildSearchErrorInlineMarkup',
  'buildSearchErrorFullMarkup',
  'buildSearchSuggestionChips',
  'buildSearchEmptyStateMarkup',
  'renderResultCountLineMarkup'
];

for (const name of retiredMarkupExports) {
  assert(!rendererSrc.includes(`export function ${name}`), `search-result-renderer.js should not export ${name}`);
  assert(!uiRenderersSrc.includes(`export function ${name}`), `ui-renderers.js should not re-export ${name}`);
  assert(!searchStateSrc.includes(`export function ${name}`), `search-state.js should not re-export ${name}`);
}

assert(
  rendererSrc.includes('export function setActiveSearchResultRow'),
  'search-result-renderer.js may keep row state metadata updater'
);
assert(
  rendererSrc.includes('querySelectorAll(\'.search-result-item\')'),
  'search-result-renderer.js metadata updater may query Svelte-rendered rows'
);

const allowedFiles = new Set([
  componentPath,
  islandPath,
  surfacePath
]);

const forbiddenRenderPatterns = [
  /#search-results[\s\S]{0,180}\.innerHTML\s*=/,
  /getElementById\(['"]search-results['"]\)[\s\S]{0,180}\.innerHTML\s*=/,
  /\.innerHTML\s*=[\s\S]{0,220}search-result-item/,
  /\.innerHTML\s*=[\s\S]{0,220}search-empty-state/,
  /\.insertAdjacentHTML\s*\(/,
  /\.appendChild\s*\([^)]*search/i
];

for (const file of walk('js/modules').filter((candidate) => /\.(?:js|mjs|svelte|ts)$/.test(candidate))) {
  if (allowedFiles.has(file)) continue;
  const source = read(file);
  for (const pattern of forbiddenRenderPatterns) {
    assert(!pattern.test(source), `${file} should not render children into #search-results`);
  }
}

console.log('Search results Svelte ownership contract OK.');

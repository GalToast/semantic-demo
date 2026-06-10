import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const legacyComponentPath = 'js/modules/components/SearchResultsList.svelte';
const retiredIslandPath = 'js/modules/search-results-svelte-island.ts';
const surfacePath = 'js/modules/components/InfoPanelSearchSurface.svelte';
const srcComponentPath = 'src/components/SearchResults.svelte';
const searchStatePath = 'js/modules/search-state.ts';
const searchResultsUiPath = 'js/modules/search-results-ui.ts';
const eventBindingsPath = 'js/modules/event-bindings.ts';

const legacyComponentSrc = read(legacyComponentPath);
const surfaceSrc = read(surfacePath);
const srcComponentSrc = read(srcComponentPath);
const searchStateSrc = read(searchStatePath);
const searchResultsUiSrc = read(searchResultsUiPath);
const eventBindingsSrc = read(eventBindingsPath);

assert(
  surfaceSrc.includes('id="search-results"'),
  'InfoPanelSearchSurface.svelte should declare the search results slot'
);
assert(
  surfaceSrc.includes("import SearchChrome from './SearchChrome.svelte'") &&
    surfaceSrc.includes('<SearchChrome />') &&
    surfaceSrc.includes('data-svelte-mounted="search-chrome"'),
  'InfoPanelSearchSurface.svelte should mount SearchChrome directly in the served shell'
);
assert(
  !fs.existsSync(path.join(root, retiredIslandPath)),
  'retired search-results-svelte-island.ts should not be restored'
);
assert(
  !eventBindingsSrc.includes('search-results-svelte-island') &&
    !eventBindingsSrc.includes('initSearchResultsSvelteIsland'),
  'event-bindings.ts should not initialize the retired search results island'
);
assert(
  searchResultsUiSrc.includes('legacy DOM is rendered directly into #search-results') &&
    searchResultsUiSrc.includes('Svelte stores are also updated'),
  'search-results-ui.ts should document the served-shell legacy renderer and Svelte store bridge'
);
assert(
  searchStateSrc.includes('document.getElementById(\'search-results\')'),
  'search-state.ts should still route served-shell results through #search-results'
);
assert(
  legacyComponentSrc.includes('class="search-result-listitem"') &&
    legacyComponentSrc.includes('class={item.cardClasses}') &&
    legacyComponentSrc.includes('id={`search-result-${Number(result.index)}`}'),
  'legacy SearchResultsList.svelte should retain DOM parity for migration reference'
);
assert(
  srcComponentSrc.includes('id="search-results"') &&
    srcComponentSrc.includes('id="search-result-list"') &&
    srcComponentSrc.includes('class="search-result-listitem"') &&
    srcComponentSrc.includes('id={`search-result-${Number(result.index)}`}'),
  'src/components/SearchResults.svelte should own canonical Svelte-shell search result markup'
);

console.log('Search results ownership contract OK.');

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const retiredIslandPath = 'js/modules/search-results-svelte-island.ts';
const retiredLegacyComponentPath = 'js/modules/components/SearchResultsList.svelte';
const retiredSurfacePath = 'js/modules/components/InfoPanelSearchSurface.svelte';
const searchBarPath = 'src/components/SearchBar.svelte';
const srcComponentPath = 'src/components/SearchResults.svelte';

const searchBarSrc = read(searchBarPath);
const srcComponentSrc = read(srcComponentPath);

assert(
  !fs.existsSync(path.join(root, retiredLegacyComponentPath)),
  'retired legacy SearchResultsList.svelte should not be restored'
);
assert(
  !fs.existsSync(path.join(root, retiredSurfacePath)),
  'retired InfoPanelSearchSurface.svelte should not be restored'
);
assert(
  !fs.existsSync(path.join(root, retiredIslandPath)),
  'retired search-results-svelte-island.ts should not be restored'
);
assert(
  searchBarSrc.includes("import SearchInput from './SearchInput.svelte'") &&
    searchBarSrc.includes("import SearchResults from './SearchResults.svelte'") &&
    searchBarSrc.includes('<SearchInput ') &&
    searchBarSrc.includes('<SearchResults />'),
  'src/components/SearchBar.svelte should compose the canonical search input and results components'
);
assert(
  srcComponentSrc.includes('id="search-results"') &&
    srcComponentSrc.includes('id="search-result-list"') &&
    srcComponentSrc.includes('class="search-result-listitem"') &&
    srcComponentSrc.includes('id={`search-result-${Number(result.index)}`}'),
  'src/components/SearchResults.svelte should own canonical Svelte-shell search result markup'
);

console.log('Search results ownership contract OK.');

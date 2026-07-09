import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function walk(dir, files = []) {
  if (!fs.existsSync(path.join(root, dir))) return files;
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const relativePath = path.join(dir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(relativePath, files);
    } else {
      files.push(relativePath);
    }
  }
  return files;
}

const appSource = read('src/App.svelte');
const appIslandSource = read('src/main.ts');
// vector-explorer-polished.html is the deployed production shell, published from
// dist/svelte/index.html (see tests/shell-contract-check.js:189). Read the built file.
const shellSource = read('dist/svelte/index.html');

assert(
  appSource.includes("import('@components/InfoPanel.svelte')") || appSource.includes("import InfoPanel from '@components/InfoPanel.svelte'"),
  'src/App.svelte should own the canonical InfoPanel component directly or via lazy import'
);
assert(
  appSource.includes("import Legend from '@components/Legend.svelte'"),
  'src/App.svelte should import the canonical Legend component directly'
);
assert(
  appSource.includes('infoPanelLazy') || appSource.includes('<InfoPanel ') || appSource.includes('<InfoPanelComponent '),
  'src/App.svelte should render InfoPanel (via lazy component)'
);
assert(appSource.includes('<Legend '), 'src/App.svelte should render Legend');

assert(
  appIslandSource.includes("import App from './App.svelte'"),
  'src/main.ts should mount the unified App.svelte root'
);
assert(
  !appIslandSource.includes('InfoPanelChrome') && !appIslandSource.includes('LegendPanelChrome'),
  'src/main.ts should not mount retired chrome panels separately'
);

assert(!exists('js/modules/info-panel-chrome-island.ts'), 'obsolete info-panel-chrome-island.ts should not exist');
assert(!exists('js/modules/legend-panel-chrome-island.ts'), 'obsolete legend-panel-chrome-island.ts should not exist');
assert(!exists('js/modules/components/App.svelte'), 'retired js/modules/components/App.svelte should not be restored');
assert(!exists('js/modules/components/InfoPanelChrome.svelte'), 'retired InfoPanelChrome.svelte should not be restored');
assert(!exists('js/modules/components/LegendPanelChrome.svelte'), 'retired LegendPanelChrome.svelte should not be restored');
assert(!shellSource.includes('info-panel-chrome-island'), 'HTML shell should not expose obsolete info-panel chrome slot');
assert(!shellSource.includes('legend-panel-chrome-island'), 'HTML shell should not expose obsolete legend-panel chrome slot');

const sourceFiles = [
  ...walk('js'),
  ...walk('src')
].filter((file) => /\.(?:js|mjs|svelte|ts)$/.test(file));

for (const file of sourceFiles) {
  const source = read(file);
  assert(!source.includes('info-panel-chrome-island'), `${file} should not reference obsolete info-panel chrome island`);
  assert(!source.includes('legend-panel-chrome-island'), `${file} should not reference obsolete legend-panel chrome island`);
  assert(!source.includes('initInfoPanelChromeIsland'), `${file} should not import or call initInfoPanelChromeIsland`);
  assert(!source.includes('initLegendPanelChromeIsland'), `${file} should not import or call initLegendPanelChromeIsland`);
}

console.log('Svelte chrome ownership contract OK: src/App.svelte is the single info/legend chrome owner.');

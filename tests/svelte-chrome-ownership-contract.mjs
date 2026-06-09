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

const appSource = read('js/modules/components/App.svelte');
const appIslandSource = read('js/modules/app-svelte-island.ts');
const shellSource = read('vector-explorer-polished.html');

assert(
  appSource.includes("import InfoPanelChrome from './InfoPanelChrome.svelte'"),
  'App.svelte should import InfoPanelChrome directly'
);
assert(
  appSource.includes("import LegendPanelChrome from './LegendPanelChrome.svelte'"),
  'App.svelte should import LegendPanelChrome directly'
);
assert(appSource.includes('<InfoPanelChrome />'), 'App.svelte should render InfoPanelChrome');
assert(appSource.includes('<LegendPanelChrome />'), 'App.svelte should render LegendPanelChrome');

assert(
  appIslandSource.includes("import App from './components/App.svelte'"),
  'app-svelte-island.js should mount the unified App.svelte root'
);
assert(
  !appIslandSource.includes('InfoPanelChrome') && !appIslandSource.includes('LegendPanelChrome'),
  'app-svelte-island.js should not mount chrome panels separately'
);

assert(!exists('js/modules/info-panel-chrome-island.ts'), 'obsolete info-panel-chrome-island.js should not exist');
assert(!exists('js/modules/legend-panel-chrome-island.ts'), 'obsolete legend-panel-chrome-island.js should not exist');
assert(!shellSource.includes('info-panel-chrome-island'), 'HTML shell should not expose obsolete info-panel chrome slot');
assert(!shellSource.includes('legend-panel-chrome-island'), 'HTML shell should not expose obsolete legend-panel chrome slot');

const sourceFiles = [
  ...walk('js'),
  ...walk('tests')
].filter((file) => /\.(?:js|mjs|svelte|ts)$/.test(file) && file !== 'tests/svelte-chrome-ownership-contract.mjs');

for (const file of sourceFiles) {
  const source = read(file);
  assert(!source.includes('info-panel-chrome-island'), `${file} should not reference obsolete info-panel chrome island`);
  assert(!source.includes('legend-panel-chrome-island'), `${file} should not reference obsolete legend-panel chrome island`);
  assert(!source.includes('initInfoPanelChromeIsland'), `${file} should not import or call initInfoPanelChromeIsland`);
  assert(!source.includes('initLegendPanelChromeIsland'), `${file} should not import or call initLegendPanelChromeIsland`);
}

console.log('Svelte chrome ownership contract OK: App.svelte is the single info/legend chrome owner.');

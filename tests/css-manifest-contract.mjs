import fs from 'node:fs';
import path from 'node:path';
import { MOBILE_PREMIUM_SPLIT } from './_fixtures/mobile-premium-split.mjs';

const root = process.cwd();

const failures = [];

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    failures.push(`${relativePath} is missing`);
    return '';
  }
  return fs.readFileSync(fullPath, 'utf8');
}

function activeLines(cssText) {
  return cssText
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function assertImportShell(relativePath, expectedImports) {
  const css = read(relativePath);
  const lines = activeLines(css);
  const imports = lines
    .map((line) => line.match(/^@import\s+url\(["']?([^"')?]+\.css)(?:\?v=[^"')]+)?["']?\);$/)?.[1])
    .filter(Boolean);

  for (const line of lines) {
    if (!line.startsWith('@import url(')) {
      failures.push(`${relativePath} must be import-only; found ${JSON.stringify(line)}`);
      break;
    }
  }

  const expected = expectedImports.map((item) => item.replace(/^\.\//, ''));
  const actual = imports.map((item) => item.replace(/^\.\//, ''));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(`${relativePath} imports ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`);
  }

  for (const imported of imports) {
    const importPath = path.join(path.dirname(relativePath), imported);
    if (!fs.existsSync(path.join(root, importPath))) {
      failures.push(`${relativePath} imports missing stylesheet ${importPath}`);
    }
  }
}

function assertCollapsedMobileOwner(relativePath) {
  const css = read(relativePath);
  const lines = activeLines(css);
  const imports = lines.filter((line) => line.startsWith('@import url('));

  if (imports.length) {
    failures.push(`${relativePath} is collapsed; remove active @import rules: ${JSON.stringify(imports)}`);
  }
}

const requiredFragments = [
  'data-panel-surface="idle"',
  'data-panel-surface="search"',
  "data-panel-surface='focus-search'",
  'data-panel-surface="semantic-dive"',
  'data-panel-surface^="map-"',
  '.map-trail-strip',
  '.focus-stage-card',
];

assertImportShell('semantic-demo.css', [
  'css/base.css',
  'css/loading.css',
  'css/tooltips.css',
  'css/shell.css',
  'css/time_weather.css',
  'css/demo_ui.css',
  'css/synthesis.css',
  'css/controls.css',
  'css/layout_base.css',
  'css/search.css',
  'css/mobile_base.css',
  'css/journey_steps.css',
  'css/journey_active.css',
  'css/clusters.css',
  'css/progressive_disclosure.css',
  'css/strands.css',
  'css/animations.css',
]);

for (const file of MOBILE_PREMIUM_SPLIT) {
  const filePath = `css/${file}`;
  const css = read(filePath);
  if (!css) {
    failures.push(`${filePath} must exist (split of mobile_premium.css on 2026-06-03)`);
    continue;
  }
  const lines = activeLines(css);
  const imports = lines.filter((line) => line.startsWith('@import url('));
  if (imports.length) {
    failures.push(`${filePath} is collapsed; remove active @import rules: ${JSON.stringify(imports)}`);
  }
}

const combinedMobilePremium = MOBILE_PREMIUM_SPLIT.map((file) => read(`css/${file}`)).join('\n');
for (const fragment of requiredFragments) {
  if (!combinedMobilePremium.includes(fragment)) {
    failures.push(`mobile_premium split must keep fragment ${JSON.stringify(fragment)} across the 7 files`);
  }
}

const shellHtml = read('vector-explorer-polished.html');
if (!shellHtml.includes('semantic-demo.css')) {
  failures.push('vector-explorer-polished.html must reference semantic-demo.css');
}
let loadedSplits = 0;
for (const file of MOBILE_PREMIUM_SPLIT) {
  if (shellHtml.includes(file)) loadedSplits++;
}
if (loadedSplits < MOBILE_PREMIUM_SPLIT.length) {
  failures.push(`vector-explorer-polished.html must reference all ${MOBILE_PREMIUM_SPLIT.length} mobile_premium split files; found ${loadedSplits}`);
}

if (failures.length) {
  console.error('CSS manifest contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('CSS manifest contract passed: semantic-demo.css is an import shell; mobile_premium split is the loaded mobile owner.');

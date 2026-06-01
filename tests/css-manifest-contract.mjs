import fs from 'node:fs';
import path from 'node:path';

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

assertImportShell('css/mobile_premium.css', [
  'mobile_premium_focus.css',
  'mobile_premium_chrome.css',
  'mobile_premium_state.css',
  'mobile_premium_idle.css',
  'mobile_premium_map_summary.css',
  'mobile_premium_surfaces.css',
]);

const shellHtml = read('vector-explorer-polished.html');
if (!shellHtml.includes('semantic-demo.css')) {
  failures.push('vector-explorer-polished.html must reference semantic-demo.css');
}
if (!shellHtml.includes('css/mobile_premium.css')) {
  failures.push('vector-explorer-polished.html must reference css/mobile_premium.css');
}

if (failures.length) {
  console.error('CSS manifest contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('CSS manifest contract passed: semantic-demo.css and mobile_premium.css are import shells.');

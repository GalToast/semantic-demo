import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceShell = 'src/index.html';
const productionShell = 'dist/svelte/index.html';
const legacyShell = 'vector-explorer-polished.html';
const frontDoor = 'index.html';
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${relativePath} is missing`);
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function requireIncludes(file, content, needle, reason) {
  if (!content.includes(needle)) {
    failures.push(`${file} must include ${JSON.stringify(needle)} (${reason})`);
  }
}

function requireExcludes(file, content, needle, reason) {
  if (content.includes(needle)) {
    failures.push(`${file} must not include ${JSON.stringify(needle)} (${reason})`);
  }
}

function localRefs(html) {
  return [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((ref) => !/^(?:[a-z]+:|\/\/|#|data:)/i.test(ref));
}

function requireNoRootAbsoluteRefs(file, html) {
  for (const ref of localRefs(html)) {
    if (ref.startsWith('/')) {
      failures.push(`${file} must not use root-absolute asset reference ${JSON.stringify(ref)}`);
    }
  }
}

function requireNoDevEntryRefs(file, html) {
  for (const ref of localRefs(html)) {
    if (ref.endsWith('.ts') || ref.includes('/main.ts') || ref === 'main.ts') {
      failures.push(`${file} must not reference the dev TypeScript entry ${JSON.stringify(ref)}`);
    }
  }
}

const sourceHtml = read(sourceShell);
const distHtml = read(productionShell);
const legacyHtml = read(legacyShell);
const indexHtml = read(frontDoor);
const appSvelteSource = read('src/App.svelte');
const packageJsonRaw = read('package.json');
const deployDoc = read('DEPLOY.md');
const architectureDoc = read('ARCHITECTURE.md');
const stylesheetShell = read('semantic-demo.css');
const baseStylesheet = read('css/base.css');

requireIncludes(sourceShell, sourceHtml, 'semantic-demo.css', 'Svelte source shell owns the app stylesheet');
requireIncludes(sourceShell, sourceHtml, 'vector-explorer-pandora.css', 'Svelte source shell owns the Pandora stylesheet');
requireIncludes(sourceShell, sourceHtml, 'src="main.ts"', 'Svelte source shell owns the Vite entry');
requireIncludes(sourceShell, sourceHtml, 'id="app"', 'Svelte source shell owns the app mount');
requireIncludes(sourceShell, sourceHtml, 'id="icon-mycelium"', 'Svelte source shell owns the icon sprite');
requireExcludes(sourceShell, sourceHtml, 'dist/bundle.js', 'Svelte production runtime must not depend on the legacy esbuild bundle');
requireExcludes(sourceShell, sourceHtml, 'src="/main.ts"', 'Svelte shell must be subpath-safe');

requireIncludes(productionShell, distHtml, './assets/', 'Vite production output must use relative hashed assets');
requireIncludes(productionShell, distHtml, 'semantic-demo.css', 'Vite production output carries CSS coexistence links');
requireIncludes(productionShell, distHtml, 'id="app"', 'Vite production output owns the app mount');
requireExcludes(productionShell, distHtml, 'dist/bundle.js', 'Vite production output must not load legacy bundle');
requireNoRootAbsoluteRefs(productionShell, distHtml);
requireNoDevEntryRefs(productionShell, distHtml);

requireIncludes('src/App.svelte', appSvelteSource, '<Canvas', 'Svelte app owns the WebGL canvas component');
requireIncludes(legacyShell, legacyHtml, 'dist/bundle.js', 'legacy shell is preserved only as rollback/reference');

requireIncludes(frontDoor, indexHtml, 'case-study.html', 'front door should send default visitors to the case study');
requireExcludes(frontDoor, indexHtml, 'dist/bundle.js', 'front door is not an app shell');
requireExcludes(frontDoor, indexHtml, 'semantic-demo.css', 'front door is not an app shell');
requireExcludes(frontDoor, indexHtml, 'id="canvas-container"', 'front door is not an app shell');

requireIncludes('DEPLOY.md', deployDoc, 'dist/svelte', 'deploy docs must name the canonical production output');
requireIncludes('DEPLOY.md', deployDoc, 'Svelte Production Entry Contract', 'deploy docs must explain the shell contract');
requireIncludes('ARCHITECTURE.md', architectureDoc, legacyShell, 'architecture docs still document the legacy shell reference');

requireIncludes('semantic-demo.css', stylesheetShell, 'CSS module shell', 'app stylesheet must remain the import-only module shell');
requireIncludes('semantic-demo.css', stylesheetShell, '@import url("./css/base.css', 'app stylesheet must import the base module first');
requireIncludes('semantic-demo.css', stylesheetShell, '@import url("./css/animations.css', 'app stylesheet must import the full module cascade');
requireExcludes('semantic-demo.css', stylesheetShell, 'Semantic Explorer Stylesheet', 'app stylesheet must not be replaced by the flattened monolith');

const stylesheetBody = stylesheetShell
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

for (const line of stylesheetBody) {
  if (!line.startsWith('@import url(')) {
    failures.push(`semantic-demo.css must be import-only; found non-import declaration ${JSON.stringify(line)}`);
    break;
  }
}

if (stylesheetShell === baseStylesheet) {
  failures.push('semantic-demo.css must not be byte-identical to css/base.css');
}

try {
  const packageJson = JSON.parse(packageJsonRaw);
  requireIncludes('package.json', packageJson.scripts?.build || '', 'build:svelte', 'production build must use the Svelte/Vite entry');
  requireIncludes('package.json', packageJson.scripts?.['check:shell'] || '', 'shell-contract-check.js', 'package script must expose the guard');
} catch (error) {
  failures.push(`package.json must parse as JSON: ${error.message}`);
}

if (failures.length) {
  console.error('Semantic demo shell contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Semantic demo shell contract OK: src/index.html -> dist/svelte/index.html is the production app shell.');
console.log('');
console.log('QA NOTE: The repo\'s vector-explorer-polished.html is a LEGACY REFERENCE shell (loads dist/bundle.js).');
console.log('The DEPLOYED vector-explorer-polished.html is the SAME as dist/svelte/index.html (Svelte production shell).');
console.log('Production QA should target dist/svelte/index.html (local build) or live URLs, NOT the repo legacy shell.');

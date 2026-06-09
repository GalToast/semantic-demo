import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const canonicalShell = 'vector-explorer-polished.html';
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

const shellHtml = read(canonicalShell);
const indexHtml = read(frontDoor);
const connectionAnalysisSource = read('js/modules/connection-analysis.ts');
const connectionAnalysisAdapterSource = read('js/modules/connection-analysis-adapter.ts');
const appSvelteSource = read('js/modules/components/App.svelte');
const bundleSource = read('dist/bundle.js');
const deployDoc = read('DEPLOY.md');
const architectureDoc = read('ARCHITECTURE.md');
const packageJsonRaw = read('package.json');
const stylesheetShell = read('semantic-demo.css');
const baseStylesheet = read('css/base.css');

requireIncludes(canonicalShell, shellHtml, 'semantic-demo.css', 'canonical shell owns the app stylesheet');
requireIncludes(canonicalShell, shellHtml, 'vector-explorer-pandora.css', 'canonical shell owns the Pandora stylesheet');
requireIncludes(canonicalShell, shellHtml, 'dist/bundle.js', 'canonical shell owns the bundled app runtime');
// Per the chrome migration (Lane 2): the canvas container is rendered by
// App.svelte at runtime rather than baked into the static HTML. The shell
// contract is satisfied by the Svelte source owning the ID, not the static HTML.
requireIncludes('js/modules/components/App.svelte', appSvelteSource, 'id="canvas-container"', 'App.svelte owns the WebGL app DOM');
requireIncludes('js/modules/connection-analysis.ts', connectionAnalysisSource, './connection-analysis-adapter.js', 'connection report must route DOM bindings through the adapter');
requireIncludes('js/modules/connection-analysis-adapter.ts', connectionAnalysisAdapterSource, 'summary-gemma-story', 'connection analysis adapter owns Gemma story DOM bindings');
requireIncludes('js/modules/connection-analysis.ts', connectionAnalysisSource, 'cached_trail_story', 'served runtime source accepts cached trail story artifacts');
requireIncludes('js/modules/connection-analysis.ts', connectionAnalysisSource, 'return inner();', 'showSemanticThreadsDetail must execute its async report loader when called');
requireIncludes('js/modules/connection-analysis.ts', connectionAnalysisSource, 'let semanticThreadsDetailController', 'connection report abort controller must persist across calls');
requireIncludes('js/modules/connection-analysis.ts', connectionAnalysisSource, 'semanticThreadsDetailController = controller', 'connection report must track the active request controller');
requireIncludes('dist/bundle.js', bundleSource, 'summary-gemma-story', 'built bundle owns Gemma story DOM bindings');
requireIncludes('dist/bundle.js', bundleSource, 'cached_trail_story', 'built bundle accepts cached trail story artifacts');

requireIncludes(frontDoor, indexHtml, 'case-study.html', 'front door should send default visitors to the case study');
requireIncludes(frontDoor, indexHtml, canonicalShell, 'front door may link to the app shell');
requireExcludes(frontDoor, indexHtml, 'dist/bundle.js', 'front door is not an app shell');
requireExcludes(frontDoor, indexHtml, 'semantic-demo.css', 'front door is not an app shell');
requireExcludes(frontDoor, indexHtml, 'id="canvas-container"', 'front door is not an app shell');
requireExcludes(frontDoor, indexHtml, 'summary-gemma-story', 'front door is not an app shell');
requireExcludes(frontDoor, indexHtml, 'api.php?action=semantic_trail_story', 'front door must not carry app behavior');

requireIncludes('DEPLOY.md', deployDoc, canonicalShell, 'deploy docs must name the canonical shell');
requireIncludes('DEPLOY.md', deployDoc, 'One App Shell Contract', 'deploy docs must explain the shell contract');
requireIncludes('ARCHITECTURE.md', architectureDoc, canonicalShell, 'architecture docs must name the canonical shell');

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
  requireIncludes('package.json', packageJson.scripts?.['check:shell'] || '', 'shell-contract-check.js', 'package script must expose the guard');
} catch (error) {
  failures.push(`package.json must parse as JSON: ${error.message}`);
}

if (failures.length) {
  console.error('Semantic demo shell contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Semantic demo shell contract OK: ${canonicalShell} is the only app shell; ${frontDoor} is a front door.`);

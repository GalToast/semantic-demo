import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distRoot = path.join(root, 'dist', 'svelte');
const indexPath = path.join(distRoot, 'index.html');
const fix = process.argv.includes('--fix');
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`${relativePath} is missing`);
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function assertIncludes(file, text, needle, reason) {
  if (!text.includes(needle)) {
    fail(`${file} must include ${JSON.stringify(needle)} (${reason})`);
  }
}

function assertExcludes(file, text, needle, reason) {
  if (text.includes(needle)) {
    fail(`${file} must not include ${JSON.stringify(needle)} (${reason})`);
  }
}

function localRefs(html) {
  return [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((ref) => !/^(?:[a-z]+:|\/\/|#|data:)/i.test(ref));
}

if (fix) {
  console.log('Svelte/Vite production build uses content-hashed assets; no cache-buster rewrite is needed.');
}

if (!fs.existsSync(indexPath)) {
  fail('dist/svelte/index.html is missing; run npm run build');
} else {
  const html = fs.readFileSync(indexPath, 'utf8');
  assertIncludes('dist/svelte/index.html', html, './assets/', 'Vite output must use relative hashed assets for /semantic-demo/ hosting');
  assertIncludes('dist/svelte/index.html', html, 'semantic-demo.css', 'production output must include the legacy CSS coexistence shell');
  assertIncludes('dist/svelte/index.html', html, 'css/mobile_premium__focus-dive.css', 'production output must include the mobile premium cascade');

  const assetRefs = localRefs(html);

  for (const ref of assetRefs) {
    if (ref.startsWith('/')) {
      fail(`dist/svelte/index.html must not use root-absolute asset reference: ${ref}`);
      continue;
    }
    if (ref.endsWith('.ts') || ref.includes('/main.ts') || ref === 'main.ts') {
      fail(`dist/svelte/index.html must not reference the dev TypeScript entry: ${ref}`);
      continue;
    }
    const cleanRef = ref.split('?')[0].replace(/^\.\//, '');
    const absolutePath = path.join(distRoot, cleanRef);
    if (!fs.existsSync(absolutePath)) {
      fail(`dist/svelte/index.html references missing built asset: ${ref}`);
    }
  }
}

const srcHtml = read('src/index.html');
assertIncludes('src/index.html', srcHtml, 'src="main.ts"', 'Svelte source shell must own the Vite entry');
assertExcludes('src/index.html', srcHtml, 'src="/main.ts"', 'source shell should stay subpath-safe');
assertExcludes('src/index.html', srcHtml, 'href="/semantic-demo.css"', 'source shell should stay subpath-safe');

for (const requiredPath of [
  'dist/svelte/semantic-demo.css',
  'dist/svelte/vector-explorer-pandora.css',
  'dist/svelte/css/mobile_premium__focus-dive.css',
  'dist/svelte/css/modules/focus_stage.css',
  'dist/svelte/data.dat',
  'dist/svelte/data.dat.gz',
  'dist/svelte/semantic_threads.dat',
  'dist/svelte/semantic_threads_ui.dat',
  'dist/svelte/semantic_space_layout_manifest.json',
  'dist/svelte/scripts/leadEnrichment.public.json',
]) {
  if (!fs.existsSync(path.join(root, requiredPath))) {
    fail(`${requiredPath} is missing from the production Svelte build output`);
  }
}

if (fs.existsSync(path.join(distRoot, '.git'))) {
  fail('dist/svelte/.git must not exist; production deploy output cannot contain repository metadata');
}

if (failures.length) {
  console.error('Semantic demo production build check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Semantic demo production build check OK: dist/svelte is the canonical Vite output.');

import crypto from 'node:crypto';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { compile } from 'svelte/compiler';

const root = process.cwd();
const fix = process.argv.includes('--fix');
const scopeArg = process.argv.find((arg) => arg.startsWith('--assets='))?.slice('--assets='.length) || '';
const scopedPaths = new Set(
  scopeArg
    .split(',')
    .map((item) => item.trim().replace(/^\.\//, '').replace(/\\/g, '/'))
    .filter(Boolean),
);
const scopedBundleRelevant = scopedPaths.size === 0 ||
  [...scopedPaths].some((item) => item === 'dist/bundle.js' || item.startsWith('js/'));
const shellPath = path.join(root, 'vector-explorer-polished.html');
const requiredAssets = [
  {
    label: 'semantic-demo.css',
    path: 'semantic-demo.css',
  },
  {
    label: 'vector-explorer-pandora.css',
    path: 'vector-explorer-pandora.css',
  },
  {
    label: 'dist/bundle.js',
    path: 'dist/bundle.js',
  },
];

const failures = [];

/** @type {import('esbuild').Plugin} */
const sveltePlugin = {
  name: 'semantic-demo-svelte-cache-check',
  setup(build) {
    build.onLoad({ filter: /\.svelte$/ }, async (args) => {
      const source = await readFile(args.path, 'utf8');
      const compiled = compile(source, {
        filename: args.path,
        generate: 'client',
        css: 'injected',
        dev: false,
      });

      return {
        contents: compiled.js.code,
        loader: 'js',
        resolveDir: path.dirname(args.path),
        warnings: compiled.warnings.map((warning) => ({
          text: warning.message,
          location: warning.start
            ? {
                file: args.path,
                line: warning.start.line,
                column: warning.start.column,
              }
            : undefined,
        })),
      };
    });
  },
};

function reportFailuresAndExit() {
  console.error('Semantic demo cache-buster check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

function shaPrefix(relativePath) {
  const buffer = fs.readFileSync(path.join(root, relativePath));
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 12);
}

function isLocalAsset(reference) {
  return !/^(?:[a-z]+:|\/\/|#|data:)/i.test(reference);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toPosixPath(value) {
  return value.replace(/\\/g, '/');
}

function normalizeLocalPath(value) {
  return toPosixPath(value).replace(/^\.\//, '');
}

function resolveCssImport(ownerPath, reference) {
  const ownerDir = path.posix.dirname(toPosixPath(ownerPath));
  return path.posix.normalize(path.posix.join(ownerDir === '.' ? '' : ownerDir, reference));
}

async function verifyBundleFresh() {
  const currentBundlePath = path.join(root, 'dist/bundle.js');
  if (!fs.existsSync(currentBundlePath)) {
    failures.push('dist/bundle.js is missing; run npm run build');
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-bundle-check-'));
  const tmpBundlePath = path.join(tmpDir, 'bundle.js');

  try {
    await esbuild.build({
      entryPoints: [path.join(root, 'js/modules/app.js')],
      bundle: true,
      minify: true,
      keepNames: true,
      outfile: tmpBundlePath,
      target: 'es2020',
      format: 'esm',
      external: ['three', 'three/*'],
      plugins: [sveltePlugin],
      logLevel: 'silent',
    });

    const current = fs.readFileSync(currentBundlePath);
    const generated = fs.readFileSync(tmpBundlePath);
    if (!current.equals(generated)) {
      const currentHash = crypto.createHash('sha256').update(current).digest('hex').slice(0, 12);
      const generatedHash = crypto.createHash('sha256').update(generated).digest('hex').slice(0, 12);
      failures.push(
        `dist/bundle.js is stale relative to js/modules/app.js and its imports; ` +
        `expected build hash ${generatedHash}, found ${currentHash}. Run npm run build, then npm run refresh:cache.`,
      );
    }
  } catch (error) {
    failures.push(`dist/bundle.js freshness build failed: ${error?.message || String(error)}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

const cssImpactCache = new Map();

function refreshCssImports(relativePath, seen = new Set()) {
  relativePath = normalizeLocalPath(relativePath);
  if (cssImpactCache.has(relativePath)) return cssImpactCache.get(relativePath);
  if (seen.has(relativePath)) return scopedPaths.has(relativePath);
  seen.add(relativePath);

  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${relativePath} is missing`);
    cssImpactCache.set(relativePath, false);
    return false;
  }

  const css = fs.readFileSync(absolutePath, 'utf8');
  const importPattern = /(@import\s+url\(\s*['"]?)([^'")]+\.css)(?:\?v=([^'")]*))?(['"]?\s*\)\s*;)/g;
  let changed = false;
  const selfImpacted = scopedPaths.size === 0 || scopedPaths.has(relativePath);
  let impacted = selfImpacted;

  const nextCss = css.replace(importPattern, (full, prefix, reference, current = '', suffix) => {
    if (!isLocalAsset(reference)) return full;

    const importedPath = resolveCssImport(relativePath, reference.replace(/^\.\//, ''));
    const importedAbsolutePath = path.join(root, importedPath);
    if (!fs.existsSync(importedAbsolutePath)) {
      failures.push(`${relativePath} imports missing local stylesheet ${importedPath}`);
      return full;
    }

    const childImpacted = refreshCssImports(importedPath, seen);
    impacted = impacted || childImpacted;
    const expected = shaPrefix(importedPath);
    if (current === expected) return full;
    const shouldTouchReference = scopedPaths.size === 0 ||
      selfImpacted ||
      childImpacted ||
      scopedPaths.has(importedPath);
    if (!shouldTouchReference) return full;

    if (fix) {
      changed = true;
      return `${prefix}${reference}?v=${expected}${suffix}`;
    }

    failures.push(`${relativePath} import ${importedPath} cache buster must be ${expected}, found ${current || 'none'}`);
    return full;
  });

  if (fix && changed) {
    fs.writeFileSync(absolutePath, nextCss);
    console.log(`Updated ${relativePath} import cache busters.`);
    impacted = true;
  }
  cssImpactCache.set(relativePath, impacted);
  return impacted;
}

if (scopedBundleRelevant) {
  await verifyBundleFresh();
  if (failures.length) reportFailuresAndExit();
}

let shellHtml = fs.readFileSync(shellPath, 'utf8');
let nextHtml = shellHtml;

const assets = new Map();
for (const asset of requiredAssets) {
  assets.set(asset.path, { ...asset });
}

const assetPattern = /\b(href|src)="([^"]+\.(?:css|js))(?:\?v=([^"]*))?"/g;
for (const match of shellHtml.matchAll(assetPattern)) {
  const [, attribute, reference] = match;
  if (!isLocalAsset(reference)) continue;
  const localPath = reference.replace(/^\.\//, '');
  const absolutePath = path.join(root, localPath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`vector-explorer-polished.html references missing local asset ${localPath}`);
    continue;
  }
  assets.set(localPath, {
    label: localPath,
    path: localPath,
    attribute,
  });
}

for (const requiredAsset of requiredAssets) {
  if (!assets.has(requiredAsset.path)) {
    failures.push(`vector-explorer-polished.html must reference ${requiredAsset.label}`);
  }
}

const impactedShellAssets = new Set();
for (const asset of assets.values()) {
  if (asset.path.endsWith('.css')) {
    const impacted = refreshCssImports(asset.path);
    if (impacted) impactedShellAssets.add(asset.path);
  }
}

for (const asset of assets.values()) {
  const expected = shaPrefix(asset.path);
  const attribute = asset.attribute || (asset.path.endsWith('.css') ? 'href' : 'src');
  const pattern = new RegExp(`(${attribute}="${escapeRegExp(asset.path)})(?:\\?v=([^"]*))?(")`);
  const match = nextHtml.match(pattern);

  if (!match) {
    failures.push(`vector-explorer-polished.html must reference ${asset.label}`);
    continue;
  }

  const current = match[2] || '';
  if (current !== expected) {
    const shouldTouchReference = scopedPaths.size === 0 ||
      scopedPaths.has(asset.path) ||
      impactedShellAssets.has(asset.path);
    if (!shouldTouchReference) continue;

    if (fix) {
      nextHtml = nextHtml.replace(pattern, `$1?v=${expected}$3`);
    } else {
      failures.push(`${asset.label} cache buster must be ${expected}, found ${current || 'none'}`);
    }
  }
}

if (fix && nextHtml !== shellHtml) {
  fs.writeFileSync(shellPath, nextHtml);
  console.log('Updated vector-explorer-polished.html cache busters.');
}

if (failures.length) {
  reportFailuresAndExit();
}

console.log('Semantic demo cache-buster check OK.');

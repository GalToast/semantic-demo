import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const fix = process.argv.includes('--fix');
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

function resolveCssImport(ownerPath, reference) {
  const ownerDir = path.posix.dirname(toPosixPath(ownerPath));
  return path.posix.normalize(path.posix.join(ownerDir === '.' ? '' : ownerDir, reference));
}

function refreshCssImports(relativePath, seen = new Set()) {
  if (seen.has(relativePath)) return;
  seen.add(relativePath);

  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${relativePath} is missing`);
    return;
  }

  const css = fs.readFileSync(absolutePath, 'utf8');
  const importPattern = /(@import\s+url\(\s*['"]?)([^'")]+\.css)(?:\?v=([^'")]*))?(['"]?\s*\)\s*;)/g;
  let changed = false;

  const nextCss = css.replace(importPattern, (full, prefix, reference, current = '', suffix) => {
    if (!isLocalAsset(reference)) return full;

    const importedPath = resolveCssImport(relativePath, reference.replace(/^\.\//, ''));
    const importedAbsolutePath = path.join(root, importedPath);
    if (!fs.existsSync(importedAbsolutePath)) {
      failures.push(`${relativePath} imports missing local stylesheet ${importedPath}`);
      return full;
    }

    refreshCssImports(importedPath, seen);
    const expected = shaPrefix(importedPath);
    if (current === expected) return full;

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
  }
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

for (const asset of assets.values()) {
  if (asset.path.endsWith('.css')) {
    refreshCssImports(asset.path);
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
  console.error('Semantic demo cache-buster check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Semantic demo cache-buster check OK.');

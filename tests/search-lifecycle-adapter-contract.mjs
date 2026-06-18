/**
 * search-lifecycle-adapter-contract.mjs
 *
 * No-resurrection guard for the retired `search-lifecycle-adapter` module.
 *
 * The old injected search-lifecycle adapter is retired from runtime ownership.
 * This contract ensures it is never reintroduced into the source tree.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function scanDirForString(dir, needle, label) {
  let found = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found = found.concat(scanDirForString(fullPath, needle, label));
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes(needle)) {
        found.push(fullPath.replace(ROOT + path.sep, ''));
      }
    }
  }
  return found;
}

console.log('\n[TEST 1] No file in src/ exports `initSearchLifecycleAdapter`');
const exportHits = scanDirForString(SRC_DIR, 'initSearchLifecycleAdapter', 'export');
assert(exportHits.length === 0, `Found forbidden export in: ${exportHits.join(', ')}`);
console.log('  PASS');

console.log('\n[TEST 2] No file in src/ imports `search-lifecycle-adapter`');
const importHits = scanDirForString(SRC_DIR, 'search-lifecycle-adapter', 'import');
assert(importHits.length === 0, `Found forbidden import in: ${importHits.join(', ')}`);
console.log('  PASS');

console.log('\nsearch-lifecycle-adapter-contract.mjs passed');

#!/usr/bin/env node
/**
 * scripts/check-bridge-references.mjs
 *
 * Assert every @lib/engine/*-bridge import in src/ resolves to a real file.
 * Prevents committing code that references non-existent bridge files.
 *
 * Usage: node scripts/check-bridge-references.mjs
 * Exit 0 = all references resolve. Exit 1 = dangling references found.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');

const BRIDGE_IMPORT_RE = /@lib\/engine\/([^'"\s]+)/g;

function findTsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTsFiles(full));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.svelte.ts')) {
      results.push(full);
    }
  }
  return results;
}

const dangling = [];

for (const file of findTsFiles(SRC_DIR)) {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = BRIDGE_IMPORT_RE.exec(content)) !== null) {
    const importPath = match[1];
    // Resolve relative to src/lib/engine/
    const resolved = path.join(SRC_DIR, 'lib', 'engine', importPath);
    // Try common extensions
    const exists =
      fs.existsSync(resolved) ||
      fs.existsSync(resolved + '.ts') ||
      fs.existsSync(resolved + '.svelte.ts') ||
      fs.existsSync(resolved + '.js') ||
      fs.existsSync(resolved + '.mjs');

    if (!exists) {
      const relFile = path.relative(ROOT, file);
      dangling.push(`${relFile}: @lib/engine/${importPath}`);
    }
  }
}

if (dangling.length > 0) {
  console.error('❌ Dangling bridge references found:');
  for (const d of dangling) console.error(`  ${d}`);
  console.error('\nFix: create the missing bridge file or update the import.');
  process.exit(1);
} else {
  console.log('✅ All bridge imports resolve to real files.');
  process.exit(0);
}

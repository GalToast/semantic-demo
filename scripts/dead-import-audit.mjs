import fs from 'fs';
import path from 'path';

const ROOT = 'C:\\Users\\HP\\repos\\semantic-explorer';
const SCAN_DIRS = [
  path.join(ROOT, 'src/lib'),
  path.join(ROOT, 'src/components'),
];
const EXCLUDE_DIRS = new Set([
  path.join(ROOT, 'src/lib/journey'),
  path.join(ROOT, 'src/lib/engine'),
  path.join(ROOT, 'src/lib/state'),
  path.join(ROOT, 'src/App.svelte'),
]);

function walk(dir, files = []) {
  if (EXCLUDE_DIRS.has(dir)) return files;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return files;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(full, files);
    } else if (ent.isFile() && /\.(ts|svelte)$/.test(ent.name)) {
      files.push(full);
    }
  }
  return files;
}

const files = [];
for (const d of SCAN_DIRS) files.push(...walk(d));

const findings = [];
const skipped = [];

for (const file of files.sort()) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    skipped.push(`${rel}\tread_error\t${e.message}`);
    continue;
  }
  const lines = text.split(/\r?\n/);
  const importLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*import\s+/.test(line)) {
      importLines.push({ line, idx: i, num: i + 1 });
    }
  }
  if (importLines.length === 0) continue;

  for (const imp of importLines) {
    // Match `import { A, B, type C } from '...'`
    const match = imp.line.match(/import\s+(?:type\s+)?\{([^}]*)\}/);
    if (!match) continue;
    const raw = match[1];
    const bindings = [];
    const parts = raw.split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      // Handle `type Foo` -> local binding is `Foo`
      const withoutType = trimmed.replace(/^type\s+/, '');
      const m = withoutType.match(/^([A-Za-z_$][A-Za-z0-9_$]*)(?:\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*))?/);
      if (m) {
        const source = m[1];
        const local = m[2] || source;
        bindings.push({ source, local });
      }
    }
    if (bindings.length === 0) continue;

    const bodyLines = lines.filter((_, idx) => idx !== imp.idx);
    const body = bodyLines.join('\n');

    for (const { source, local } of bindings) {
      const escaped = local.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}\\b`, 'g');
      const matches = body.match(re);
      const count = matches ? matches.length : 0;
      if (count === 0) {
        findings.push(`${rel}\t${source}\t${local}\t${imp.num}\t${imp.line.trim()}\t${count}`);
      }
    }
  }
}

console.log('DEAD_IMPORTS\tcount=' + findings.length);
console.log('SKIPPED\tcount=' + skipped.length);
if (skipped.length) {
  for (const s of skipped) console.log('SKIPPED\t' + s);
}
if (findings.length) {
  console.log('BEGIN_FINDINGS');
  for (const f of findings) console.log(f);
  console.log('END_FINDINGS');
}

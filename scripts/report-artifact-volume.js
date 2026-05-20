#!/usr/bin/env node
/**
 * scripts/report-artifact-volume.js
 * Read-only artifact volume reporter.
 * Reports sizes for: tmp/, dist/, reports/, test-results/, playwright-report/
 * No destructive operations.
 */

import { statSync, readdirSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

const ARTIFACT_DIRS = ['tmp', 'dist', 'reports', 'test-results', 'playwright-report'];
const IGNORED_PREFIXES = ['.git', 'node_modules'];
const SIZE_UNITS = ['B', 'KB', 'MB', 'GB'];
const SIZE_GATE_BYTES = 1024 * 1024 * 1024;
const args = process.argv.slice(2);
const sizeGate = args.includes('--size-gate');

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${SIZE_UNITS[i]}`;
}

function scanDir(dirPath, maxDepth = 1, currentDepth = 0) {
  const entries = [];
  try {
    const items = readdirSync(dirPath, { withFileTypes: true });
    for (const item of items) {
      if (IGNORED_PREFIXES.some(p => item.name.startsWith(p))) continue;
      const fullPath = join(dirPath, item.name);
      try {
        if (item.isDirectory()) {
          if (currentDepth < maxDepth) {
            entries.push(...scanDir(fullPath, maxDepth, currentDepth + 1));
          }
        } else {
          const s = statSync(fullPath);
          entries.push({ path: fullPath, size: s.size });
        }
      } catch {}
    }
  } catch {}
  return entries;
}

function summarizeTopLevelSubdirs(dirPath, entries) {
  const totals = new Map();
  for (const entry of entries) {
    const rel = relative(dirPath, entry.path);
    const top = rel.split(/[\\/]/)[0];
    if (!top || top === rel) continue;
    totals.set(top, (totals.get(top) || 0) + entry.size);
  }
  return [...totals.entries()]
    .map(([name, size]) => ({ name, size }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 10);
}

function reportDir(name, dir) {
  const fullPath = join(ROOT, dir);
  if (!existsSync(fullPath)) {
    console.log(`\n${name}/ — does not exist`);
    return { dir, total: 0, count: 0 };
  }

  const entries = scanDir(fullPath, Number.POSITIVE_INFINITY);
  const total = entries.reduce((s, e) => s + e.size, 0);

  console.log(`\n${name}/ — ${entries.length} files, ${formatBytes(total)} total`);
  if (entries.length > 0) {
    const top5 = [...entries].sort((a, b) => b.size - a.size).slice(0, 5);
    top5.forEach(e => {
      const rel = relative(ROOT, e.path);
      console.log(`  ${formatBytes(e.size).padStart(8)} ${rel}`);
    });
  }
  const subdirs = summarizeTopLevelSubdirs(fullPath, entries);
  if (subdirs.length > 0) {
    console.log('  Top subdirectories:');
    subdirs.forEach(e => {
      console.log(`  ${formatBytes(e.size).padStart(8)} ${dir}/${e.name}/`);
    });
  }

  return { dir, total, count: entries.length };
}

console.log('=== Artifact Volume Report ===');
console.log(`Run at: ${new Date().toISOString()}`);

const results = ARTIFACT_DIRS.map(d => reportDir(d, d));

const grand = results.reduce((acc, r) => ({ total: acc.total + r.total, count: acc.count + r.count }), { total: 0, count: 0 });
console.log(`\n--- Total: ${grand.count} files, ${formatBytes(grand.total)} ---`);

if (sizeGate) {
  const oversized = results.filter(r => r.total > SIZE_GATE_BYTES);
  if (oversized.length > 0) {
    console.error(`\nSize gate failed: ${oversized.map(r => `${r.dir}/=${formatBytes(r.total)}`).join(', ')}`);
    process.exit(1);
  }
  console.log(`Size gate passed: no artifact directory exceeds ${formatBytes(SIZE_GATE_BYTES)}.`);
}

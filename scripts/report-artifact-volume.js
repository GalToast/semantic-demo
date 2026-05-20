#!/usr/bin/env node
/**
 * scripts/report-artifact-volume.js
 * Read-only artifact volume reporter.
 * Reports sizes for: tmp/, dist/, reports/, test-results/, playwright-report/
 * No destructive operations.
 */

import { statSync, readdirSync, existsSync } from 'fs';
import { join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

const ARTIFACT_DIRS = ['tmp', 'dist', 'reports', 'test-results', 'playwright-report'];
const IGNORED_PREFIXES = ['.git', 'node_modules'];
const SIZE_UNITS = ['B', 'KB', 'MB', 'GB'];
const SIZE_GATE_BYTES = 1024 * 1024 * 1024;
const args = process.argv.slice(2);
const sizeGate = args.includes('--size-gate');
const pruneDryRun = args.includes('--prune-dry-run');
const execute = args.includes('--execute');

const RETENTION_DAYS = [
  { patterns: ['visual-qa-reels', 'playwright-report', 'three-scene-playtest'], days: 7 },
  { patterns: ['surface-contract-check', 'ui-quality-contract', 'test-results'], days: 14 },
  { patterns: ['semantic-ui-visual-audit', 'focus-pocket-visual-state', 'visual-coverage'], days: 30 },
  { patterns: ['semantic-guide-fallback-audit', 'bd2e3d3', 'artifact-hygiene'], days: 90 },
];

function readFlag(name) {
  const prefix = `${name}=`;
  const inline = args.find(arg => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  return null;
}

function readNumberFlag(name) {
  const value = readFlag(name);
  if (value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return number;
}

const pruneDir = readFlag('--dir');
const ageOverrideDays = readNumberFlag('--age');
const sizeMinMb = readNumberFlag('--size-min') ?? 0;

if (execute) {
  console.error('--execute is not implemented. This reporter is read-only; use --prune-dry-run to review candidates.');
  process.exit(2);
}

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

function getDirStats(dirPath) {
  const entries = scanDir(dirPath, Number.POSITIVE_INFINITY);
  let newestMtimeMs = 0;
  let oldestMtimeMs = Number.POSITIVE_INFINITY;
  for (const entry of entries) {
    try {
      const stats = statSync(entry.path);
      newestMtimeMs = Math.max(newestMtimeMs, stats.mtimeMs);
      oldestMtimeMs = Math.min(oldestMtimeMs, stats.mtimeMs);
    } catch {}
  }
  if (!entries.length) {
    try {
      const stats = statSync(dirPath);
      newestMtimeMs = stats.mtimeMs;
      oldestMtimeMs = stats.mtimeMs;
    } catch {
      newestMtimeMs = 0;
      oldestMtimeMs = 0;
    }
  }
  return {
    entries,
    fileCount: entries.length,
    total: entries.reduce((sum, entry) => sum + entry.size, 0),
    newestMtimeMs,
    oldestMtimeMs,
  };
}

function getRetentionDays(name) {
  if (ageOverrideDays !== null) return ageOverrideDays;
  const normalized = String(name || '').toLowerCase();
  const match = RETENTION_DAYS.find(rule =>
    rule.patterns.some(pattern => normalized.includes(pattern.toLowerCase()))
  );
  return match?.days ?? 30;
}

function assertWithinRoot(targetPath, rootPath) {
  const resolvedTarget = resolve(targetPath);
  const resolvedRoot = resolve(rootPath);
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}\\`) || resolvedTarget.startsWith(`${resolvedRoot}/`);
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

function listTopLevelDirectories(rootDir) {
  if (!existsSync(rootDir)) return [];
  try {
    return readdirSync(rootDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && !IGNORED_PREFIXES.some(prefix => entry.name.startsWith(prefix)))
      .map(entry => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function runPruneDryRun() {
  const tmpRoot = join(ROOT, 'tmp');
  if (!existsSync(tmpRoot)) {
    console.log('tmp/ does not exist. No prune candidates.');
    return;
  }

  const targetNames = pruneDir ? [pruneDir.replace(/^tmp[\\/]/, '').replace(/[\\/]+$/, '')] : listTopLevelDirectories(tmpRoot);
  const now = Date.now();
  const minBytes = sizeMinMb * 1024 * 1024;
  const candidates = [];

  for (const name of targetNames) {
    const dirPath = join(tmpRoot, name);
    if (!assertWithinRoot(dirPath, tmpRoot) || !existsSync(dirPath)) continue;
    const stats = getDirStats(dirPath);
    const retentionDays = getRetentionDays(name);
    const ageDays = stats.newestMtimeMs ? (now - stats.newestMtimeMs) / (24 * 60 * 60 * 1000) : 0;
    const isOldEnough = ageDays > retentionDays;
    const isLargeEnough = stats.total >= minBytes;
    if (isOldEnough && isLargeEnough) {
      candidates.push({
        name,
        path: relative(ROOT, dirPath),
        total: stats.total,
        fileCount: stats.fileCount,
        retentionDays,
        ageDays,
        newestMtimeMs: stats.newestMtimeMs,
      });
    }
  }

  candidates.sort((a, b) => b.total - a.total || b.ageDays - a.ageDays);

  console.log('=== Artifact Prune Dry Run ===');
  console.log(`Run at: ${new Date().toISOString()}`);
  console.log(`Scope: ${pruneDir ? `tmp/${pruneDir.replace(/^tmp[\\/]/, '').replace(/[\\/]+$/, '')}/` : 'tmp/*/'}`);
  console.log(`Age threshold: ${ageOverrideDays === null ? 'policy defaults' : `${ageOverrideDays} day(s)`}`);
  console.log(`Size minimum: ${formatBytes(minBytes)}`);
  console.log('');

  if (!candidates.length) {
    console.log('No prune candidates matched the current filters.');
    console.log('Dry-run complete — no files deleted.');
    return;
  }

  console.log('| Candidate | Files | Size | Age | Threshold | Last modified |');
  console.log('|-----------|------:|-----:|----:|----------:|---------------|');
  for (const candidate of candidates) {
    const lastModified = candidate.newestMtimeMs ? new Date(candidate.newestMtimeMs).toISOString() : 'unknown';
    console.log(
      `| \`${candidate.path.replace(/\\/g, '/')}/\` | ${candidate.fileCount} | ${formatBytes(candidate.total)} | ${candidate.ageDays.toFixed(1)}d | ${candidate.retentionDays}d | ${lastModified} |`
    );
  }

  const total = candidates.reduce((sum, candidate) => sum + candidate.total, 0);
  const fileCount = candidates.reduce((sum, candidate) => sum + candidate.fileCount, 0);
  console.log('');
  console.log(`Total candidates: ${candidates.length} dirs / ${fileCount} files / ${formatBytes(total)} would be removed.`);
  console.log('Dry-run complete — no files deleted.');
}

if (pruneDryRun) {
  runPruneDryRun();
  process.exit(0);
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

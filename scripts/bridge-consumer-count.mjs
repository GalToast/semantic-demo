#!/usr/bin/env node
/**
 * scripts/bridge-consumer-count.mjs
 *
 * Report per-bridge consumer counts in src/. Useful for bridge retirement
 * candidates: bridges with 0 consumers are dead, bridges with 1-2 consumers
 * are candidates for inlining once those consumers migrate.
 *
 * Usage:
 *   node scripts/bridge-consumer-count.mjs                 # full report
 *   node scripts/bridge-consumer-count.mjs --threshold 2   # only show ≤2
 *
 * Exit codes:
 *   0 — report generated
 *   1 — directory missing
 *
 * Companion to: scripts/check-bridge-references.mjs (dangling ref checker)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');
const BRIDGE_DIR = path.join(SRC_DIR, 'lib', 'engine');

const args = process.argv.slice(2);
const thresholdFlag = args.indexOf('--threshold');
const threshold = thresholdFlag > -1 ? Number.parseInt(args[thresholdFlag + 1] ?? '', 10) : null;

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

if (!fs.existsSync(BRIDGE_DIR)) {
    console.error(`Bridge directory not found: ${BRIDGE_DIR}`);
    process.exit(1);
}

const bridgeFiles = fs.readdirSync(BRIDGE_DIR).filter((f) => f.endsWith('-bridge.ts'));
const srcFiles = findTsFiles(SRC_DIR);
const allContent = srcFiles.map((p) => ({ path: p, content: fs.readFileSync(p, 'utf8') }));

const rows = bridgeFiles.map((bridgeFile) => {
    const name = bridgeFile.replace(/-bridge\.ts$/, '');
    const importRe = new RegExp(`@lib/engine/${name}\\b`, 'g');
    const consumers = new Set();
    for (const { path: p, content } of allContent) {
        if (p.endsWith(bridgeFile)) continue; // skip self
        if (importRe.test(content)) consumers.add(path.relative(ROOT, p));
    }
    return { name, bridgeFile, consumerCount: consumers.size, consumers: [...consumers].sort() };
});

rows.sort((a, b) => b.consumerCount - a.consumerCount);

const filtered = threshold !== null ? rows.filter((r) => r.consumerCount <= threshold) : rows;

console.log(`Bridge consumer counts (${rows.length} bridges, ${filtered.length} shown):\n`);
console.log('  COUNT  BRIDGE');
console.log('  -----  ' + '-'.repeat(40));
for (const r of filtered) {
    const flag = r.consumerCount === 0 ? '🚫' : r.consumerCount <= 2 ? '⚠️ ' : '   ';
    console.log(`  ${flag} ${String(r.consumerCount).padStart(3)}   ${r.name}`);
}

const dead = rows.filter((r) => r.consumerCount === 0);
const lone = rows.filter((r) => r.consumerCount <= 2);
if (dead.length || lone.length) {
    console.log('');
    if (dead.length) console.log(`  Dead bridges (0 consumers): ${dead.length}`);
    if (lone.length) console.log(`  Retire candidates (≤2 consumers): ${lone.length}`);
}

if (threshold === null) {
    console.log('');
    console.log('Filter tips:');
    console.log('  --threshold 2    show only bridges with ≤2 consumers (retire candidates)');
    console.log('  --threshold 0    show only dead bridges (zero consumers)');
}

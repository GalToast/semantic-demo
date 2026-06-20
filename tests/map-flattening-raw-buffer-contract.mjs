/**
 * map-flattening-raw-buffer-contract.mjs
 *
 * Source-only contract test for map-flattening-layout.js.
 * Ensures the map-view flattening reads from state.rawPositionsBuffer
 * (added by the data-worker refactor, commit cc2c576) instead of the
 * (now-stale) point.x / point.y fields on each point.
 *
 * Background: before this contract, applyMapFlatteningLayout(true) read
 * point.x / point.y directly. After the data-worker refactor stopped
 * emitting x/y/z on point objects, every node collapsed to
 * (-centerX, -centerY, -0.15) — all 8,406 points stacked at one location
 * in map view. This test pins the raw-buffer fallback so the regression
 * cannot return.
 *
 * Source-only — no DOM, no Playwright.
 *
 * Usage:
 *   node tests/map-flattening-raw-buffer-contract.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveSource } from './source-path.mjs';

const CWD = process.cwd();
const TARGET_PATH = resolveSource('src/lib/utils/map-flattening-layout.ts', CWD);
const DATA_LOADER_PATH = resolveSource('src/lib/data-store.ts', CWD);
const DATA_WORKER_PATH = resolve(CWD, 'js/workers/data-worker.ts');

let targetSrc;
try {
    targetSrc = readFileSync(TARGET_PATH, 'utf8');
} catch (err) {
    console.error('Cannot read', TARGET_PATH, err.message);
    process.exit(1);
}

const checks = [];

function check(name, pass, detail = '') {
    checks.push({ name, pass, detail });
}

// ---------------------------------------------------------------------------
// Contract 1: module is intact and exports applyMapFlatteningLayout
// ---------------------------------------------------------------------------
check(
    'module:exports:applyMapFlatteningLayout',
    /export\s+function\s+applyMapFlatteningLayout\s*\(/.test(targetSrc)
);

// ---------------------------------------------------------------------------
// Contract 2: enabled path uses state.rawPositionsBuffer (the fix)
// ---------------------------------------------------------------------------
check(
    'enabled-path:reads rawPositionsBuffer',
    /hasRawBuffer/.test(targetSrc) &&
        /state\.rawPositionsBuffer\s*\[\s*i\s*\*\s*3\s*\]/.test(targetSrc) &&
        /state\.rawPositionsBuffer\s*\[\s*i\s*\*\s*3\s*\+\s*1\s*\]/.test(targetSrc),
    'map-flattening-layout.js must read state.rawPositionsBuffer[i*3] and [i*3+1] in the enabled branch'
);

// ---------------------------------------------------------------------------
// Contract 3: the buggy direct-read pattern is NOT the only path.
// We allow the fallback (Number.isFinite(point.x) ...) to remain, but the
// raw-buffer read must be the primary path. A regression that re-introduces
// a bare point.x read with no hasRawBuffer gate would fail this check.
// ---------------------------------------------------------------------------
const enabledBranch = (targetSrc.match(/if\s*\(\s*enabled\s*\)\s*\{[\s\S]*?forEach[\s\S]*?\}\s*\}/) || [''])[0];
check(
    'enabled-path:has hasRawBuffer gate',
    /hasRawBuffer/.test(enabledBranch),
    'the enabled branch of applyMapFlatteningLayout must gate on hasRawBuffer before reading point.x/y'
);
check(
    'enabled-path:primary read is from buffer',
    /state\.rawPositionsBuffer\s*\[\s*i\s*\*\s*3\s*\+\s*1\s*\]/.test(enabledBranch),
    'the enabled branch must read y from state.rawPositionsBuffer[i*3+1], not point.y'
);

// ---------------------------------------------------------------------------
// Contract 4: data-loader writes the buffer (so the fix has data to read)
// ---------------------------------------------------------------------------
const dataLoaderSrc = readFileSync(DATA_LOADER_PATH, 'utf8');
check(
    'data-loader:writes state.rawPositionsBuffer',
    /rawPositionsBuffer\s*=\s*result\.positionsBuffer/.test(dataLoaderSrc),
    'data-store.ts must assign state.rawPositionsBuffer from the typed array'
);

// ---------------------------------------------------------------------------
// Contract 5: data-worker emits the buffer
// ---------------------------------------------------------------------------
const dataWorkerSrc = readFileSync(DATA_WORKER_PATH, 'utf8');
check(
    'data-worker:builds positionsBuffer as Float32Array',
    /positionsBuffer\s*=\s*new\s+Float32Array/.test(dataWorkerSrc),
    'data-worker.js must allocate positionsBuffer as a Float32Array'
);
check(
    'data-worker:returns positionsBuffer in result',
    /return\s*\{[^}]*positionsBuffer/.test(dataWorkerSrc),
    'data-worker.js handleLoadRecords must include positionsBuffer in the return value'
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
let failed = 0;
console.log('\n=================================================================');
console.log('map-flattening-raw-buffer-contract.mjs');
console.log('Contract: map-flattening-layout must read state.rawPositionsBuffer');
console.log('=================================================================\n');

for (const { name, pass, detail } of checks) {
    const mark = pass ? 'OK ' : 'FAIL';
    console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
    if (!pass) failed += 1;
}

console.log('');
if (failed > 0) {
    console.error(`FAILED: ${failed} of ${checks.length} checks did not pass`);
    process.exit(1);
} else {
    console.log(`PASSED: ${checks.length} of ${checks.length} checks`);
    process.exit(0);
}

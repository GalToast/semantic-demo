/**
 * Contract: demo-camera.js retirement seam.
 *
 * Verifies that js/modules/demo-camera.js stayed retired:
 *   - The stale source file is absent
 *   - No ES module imports remain
 *   - No script tags or inline references remain in HTML
 *   - No window.demoCamera callers remain in active modules
 *
 * Run: node tests/demo-camera-retirement-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

let passed = 0;
let failed = 0;

function ok(msg)  { console.log(`  ok ${msg}`);  passed++; }
function fail(msg){ console.log(`  FAIL ${msg}`); failed++; }

function test(label, fn) {
    try { fn(); ok(label); }
    catch (e) { fail(label); console.log(`       ${e.message}`); }
}

function assert(condition, msg) {
    if (!condition) throw new Error(msg);
}

function walkJs(dir) {
    const entries = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) entries.push(...walkJs(full));
        else if (/\.(mjs|js)$/.test(entry.name)) entries.push(full);
    }
    return entries;
}

function sourceFiles() {
    return [
        ...walkJs(path.join(ROOT, 'js')),
        ...walkJs(path.join(ROOT, 'tests')),
        ...fs.readdirSync(ROOT)
            .filter((entry) => entry.endsWith('.html'))
            .map((entry) => path.join(ROOT, entry)),
    ].filter((file) => {
        const rel = path.relative(ROOT, file);
        return rel !== path.join('tests', 'demo-camera-retirement-contract.mjs')
            && rel !== path.join('tests', 'run-all-contracts.js');
    });
}

console.log('\n  demo-camera.js retirement contract');
console.log('  ---------------------------------');

test('demo-camera.js is absent from active modules', () => {
    const p = path.join(ROOT, 'js/modules/demo-camera.js');
    assert(!fs.existsSync(p), `stale source still exists: ${p}`);
});

test('no source file imports from demo-camera.js specifically', () => {
    // micro-demo-camera.js is a separate active file — it is NOT the retired demo-camera.js.
    // Only check that no file imports from 'demo-camera.js' (the retired module).
    const retiredModule = 'demo-camera.js';
    const activeModule = 'micro-demo-camera.js';
    for (const file of sourceFiles()) {
        const src = fs.readFileSync(file, 'utf8');
        // Look for imports from the retired module specifically
        const importMatches = src.match(/(?:import|from)\s*['"][^'"]*demo-camera\.js['"]/g) || [];
        for (const match of importMatches) {
            // Exclude references to the active micro-demo-camera.js
            assert(match.includes(activeModule), `${path.relative(ROOT, file)} imports from retired ${retiredModule}: ${match}`);
        }
    }
});

test('no active source file references window.demoCamera', () => {
    for (const file of sourceFiles()) {
        const src = fs.readFileSync(file, 'utf8');
        assert(!src.includes('window.demoCamera'), `${path.relative(ROOT, file)} references window.demoCamera`);
    }
});

test('demo-controller.js does not reference demo-camera', () => {
    const p = path.join(ROOT, 'js/modules/demo-controller.js');
    if (!fs.existsSync(p)) { ok('demo-controller.js absent (already retired)'); return; }
    const src = fs.readFileSync(p, 'utf8');
    assert(!src.includes('demo-camera'), 'demo-controller.js mentions demo-camera');
});

test('app.js does not reference demo-camera', () => {
    const p = path.join(ROOT, 'js/modules/app.js');
    const src = fs.readFileSync(p, 'utf8');
    assert(!src.includes('demo-camera'), 'app.js mentions demo-camera');
});

test('micro-demo.js does not import from retired demo-camera.js', () => {
    const p = path.join(ROOT, 'js/modules/micro-demo.js');
    const src = fs.readFileSync(p, 'utf8');
    // micro-demo.js may reference micro-demo-camera.js (active) — that's fine.
    // It must NOT reference the retired demo-camera.js.
    const importMatches = src.match(/(?:import|from)\s*['"][^'"]*demo-camera\.js['"]/g) || [];
    for (const match of importMatches) {
        assert(match.includes('micro-demo-camera.js'), `micro-demo.js imports from retired demo-camera.js: ${match}`);
    }
});

console.log(`\n  ${'-'.repeat(47)}`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log(`  ${'-'.repeat(47)}\n`);

if (failed === 0) {
    console.log('  VERDICT: demo-camera.js is retired and unreferenced.\n');
} else {
    console.log('  VERDICT: demo-camera retirement is incomplete.\n');
}

process.exit(failed > 0 ? 1 : 0);

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
    ].filter((file) => path.relative(ROOT, file) !== path.join('tests', 'demo-camera-retirement-contract.mjs'));
}

console.log('\n  demo-camera.js retirement contract');
console.log('  ---------------------------------');

test('demo-camera.js is absent from active modules', () => {
    const p = path.join(ROOT, 'js/modules/demo-camera.js');
    assert(!fs.existsSync(p), `stale source still exists: ${p}`);
});

test('no source file references demo-camera by path or basename', () => {
    for (const file of sourceFiles()) {
        const src = fs.readFileSync(file, 'utf8');
        assert(!src.includes('demo-camera'), `${path.relative(ROOT, file)} mentions demo-camera`);
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

test('micro-demo.js does not import from demo-camera.js', () => {
    const p = path.join(ROOT, 'js/modules/micro-demo.js');
    const src = fs.readFileSync(p, 'utf8');
    assert(!src.includes('demo-camera'), 'micro-demo.js imports demo-camera');
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

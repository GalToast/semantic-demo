#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');

function listFiles(dir, exts) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...listFiles(full, exts));
        else if (exts.some((x) => e.name.endsWith(x))) out.push(full);
    }
    return out;
}

const bridgeFiles = listFiles(SRC, ['.ts']).filter((f) => f.endsWith('-bridge.ts'));
const relPath = (f) => path.relative(SRC, f).replace(/\\/g, '/');
const importRe = /from\s+['"]([^'"]+)['"]/g;
const allSourceFiles = listFiles(SRC, ['.ts', '.svelte.ts', '.svelte']);

const rows = bridgeFiles.map((br) => {
    // Match import path forms:
    //  - '@lib/engine/state-bridge'                              (alias used in src)
    //  - '@/lib/engine/state-bridge'                             (alt alias seen in some places)
    //  - '../../../lib/engine/state-bridge'                      (relative import)
    const bridgeRel = relPath(br).replace(/\.ts$/, '');
    const targets = new Set([
        '@lib/' + bridgeRel,
        '@/lib/' + bridgeRel
    ]);
    const refCount = allSourceFiles.reduce((acc, f) => {
        if (f === br) return acc;
        const text = fs.readFileSync(f, 'utf8');
        let n = 0;
        for (const m of text.matchAll(importRe)) {
            const p = m[1];
            if (targets.has(p)) {
                n++;
                continue;
            }
            if (p.startsWith('.')) {
                // resolve relative path against f, compare bridgeRel
                const resolved = path.relative(SRC, path.resolve(path.dirname(f), p)).replace(/\\/g, '/');
                if (resolved === bridgeRel) n++;
            }
        }
        return acc + n;
    }, 0);
    return { name: bridgeRel, refs: refCount, bytes: fs.statSync(br).size };
});

rows.sort((a, b) => a.refs - b.refs || b.bytes - a.bytes);

const orphans = rows.filter((r) => r.refs === 0);
const traffic = rows.filter((r) => r.refs === 1);

console.log('TOTAL BRIDGES:', rows.length);
console.log('ORPHAN BRIDGES (0 refs):', orphans.length);
console.log('SINGLE-CALLER BRIDGES (1 ref):', traffic.length);
console.log();
console.log('--- TOP 8 HIGHEST-TRAFFIC ---');
rows.slice().sort((a, b) => b.refs - a.refs).slice(0, 8).forEach((r) =>
    console.log('  ', String(r.refs).padStart(3), 'refs', String(r.bytes).padStart(6) + 'B', r.name)
);
console.log();
console.log('--- ORPHAN CANDIDATES (safe-to-delete if not parallel-session-owned) ---');
orphans.forEach((r) => console.log('  ', String(r.refs).padStart(3), 'refs ', String(r.bytes).padStart(6) + 'B', r.name));
console.log();
console.log('--- SINGLE-CALLER BRIDGES (candidate for inlining at the call site) ---');
traffic.forEach((r) => console.log('  ', String(r.refs).padStart(3), 'refs ', String(r.bytes).padStart(6) + 'B', r.name));

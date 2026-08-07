#!/usr/bin/env node
/**
 * verify-tasks.mjs — invariant gate for harness-ablation tasks.
 *
 * Every task must satisfy the "semantic trap" contract so the benchmark
 * discriminates harness value (loop-with-test-feedback > one-shot):
 *   1. BUGGY FAILS       — committed src/task.js must fail test/test.js
 *   2. WRONG-GUESS FAILS — a plausible one-shot patch (common first guess)
 *                          must FAIL — proves the test catches the trap
 *   3. FIXED PASSES      — a known-correct replacement must pass
 *
 * WRONG_GUESSES / FIXED_IMPLS are authored per-task below. Extend when
 * adding tasks. Runs under CJS-forced copies (mirrors run.mjs runTest).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, cpSync, writeFileSync, rmSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const TASKS_DIR = join(HERE, 'tasks')

const WRONG_GUESSES = {
    'task-13':
        'function dedupeLast(a){const s=new Set(),o=[];for(const x of a){if(s.has(x))continue;s.add(x);o.push(x)}return o}module.exports={dedupeLast};', // keep-FIRST (common default)
    'task-14': 'function wrap(i,n){return i<0?i+n:i%n}module.exports={wrap};', // add-N-when-negative only
    'task-15': 'function deepMerge(a,b){return Object.assign({},a,b)}module.exports={deepMerge};' // shallow replace
}

const FIXED_IMPLS = {
    'task-13':
        'function dedupeLast(a){const s=new Set(),o=[];for(let i=a.length-1;i>=0;i--){if(s.has(a[i]))continue;s.add(a[i]);o.unshift(a[i])}return o}module.exports={dedupeLast};',
    'task-14': 'function wrap(i,n){return ((i%n)+n)%n}module.exports={wrap};',
    'task-15':
        'function deepMerge(a,b){if(a==null)return b==null?{}:b;if(b==null)return a;if(Array.isArray(a)||Array.isArray(b)){return (Array.isArray(a)?a:[]).concat(Array.isArray(b)?b:[])}if(typeof a==="object"&&typeof b==="object"){const o={...a};for(const k of Object.keys(b))o[k]=deepMerge(a[k],b[k]);return o}return b}module.exports={deepMerge};'
}

function taskList() {
    return readdirSync(TASKS_DIR)
        .filter((d) => d.startsWith('task-') && !d.startsWith('.'))
        .sort()
}

function runWith(task, srcOverride) {
    const tmp = mkdtempSync(join(tmpdir(), 'task-verify-'))
    try {
        for (const sub of ['README.md', 'src', 'test']) {
            const s = join(TASKS_DIR, task, sub)
            if (existsSync(s)) cpSync(s, join(tmp, sub), { recursive: true })
        }
        if (srcOverride !== null && srcOverride !== undefined) writeFileSync(join(tmp, 'src', 'task.js'), srcOverride)
        writeFileSync(join(tmp, 'package.json'), JSON.stringify({ type: 'commonjs' }))
        const res = execFileSync(process.execPath, ['test/test.js'], { cwd: tmp, stdio: 'pipe', encoding: 'utf8' })
        return { pass: true, out: res.trim().slice(0, 120) }
    } catch (e) {
        const err = String(e.stderr || e.message)
        const m = (err.split('\n').find((l) => l.includes('ASSERT FAIL')) || '').slice(0, 110)
        return { pass: false, out: m || err.split('\n')[0] }
    } finally {
        try {
            rmSync(tmp, { recursive: true, force: true })
        } catch {
            /* ignore */
        }
    }
}

const targets = process.argv.slice(2).length ? process.argv.slice(2) : taskList()
let fails = 0
const rows = []
for (const t of targets) {
    const buggy = runWith(t)
    const trapTier = WRONG_GUESSES[t] !== undefined
    if (!trapTier) {
        // easy-tier: single check — committed buggy src must fail the test
        if (buggy.pass) {
            fails++
            console.log(`❌ ${t} BUGGY-PASSES (committed src must fail its test)`)
            rows.push({ task: t, buggy: 'BUGGY-PASSES' })
        } else console.log(`✅ ${t} (easy tier: buggy-fails)`)
        continue
    }
    const wrong = runWith(t, WRONG_GUESSES[t])
    const fixed = runWith(t, FIXED_IMPLS[t])
    const ok = !buggy.pass && !wrong.pass && fixed.pass
    rows.push({
        task: t,
        buggy: buggy.pass ? 'BUGGY-PASSES' : 'buggy-fails',
        wrong: wrong.pass ? 'WRONG-PASSES' : 'wrong-fails',
        fixed: fixed.pass ? 'fixed-passes' : 'FIXED-FAILS'
    })
    if (!ok) {
        fails++
        console.log(`❌ ${t}`)
    } else console.log(`✅ ${t}`)
}
if (fails > 0) {
    console.log(`\nGATE RED — ${fails} task(s) fail the semantic-trap contract:`)
    rows.filter((r) => r.buggy === 'BUGGY-PASSES' || r.wrong === 'WRONG-PASSES' || r.fixed === 'FIXED-FAILS').forEach(
        (r) => console.log('  ', JSON.stringify(r))
    )
    process.exit(1)
}
console.log('\nAll tasks pass (buggy✗ / wrong✗ / fixed✓).')
process.exit(0)

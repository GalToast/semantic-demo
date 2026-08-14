#!/usr/bin/env node
/* ============================================================================
 * scripts/qa-lighthouse-baseline.mjs
 * ----------------------------------------------------------------------------
 * Repeatable Lighthouse baseline + gate for the semantic-explorer Svelte shell.
 *
 * This script starts NOTHING. It expects the QA server to already be serving
 * the production shell. Prerequisites (run these first — see runbook):
 *
 *   npm run build
 *   node scripts/qa-server.mjs start        (binds :8795, proxies /api to PHP)
 *
 * Usage:
 *   node scripts/qa-lighthouse-baseline.mjs              # run mobile + desktop, gate vs latest
 *   node scripts/qa-lighthouse-baseline.mjs --baseline   # also refresh docs/ baselines
 *
 * Artifacts:
 *   tmp/lighthouse-mobile-<ts>.json       tmp/lighthouse-desktop-<ts>.json
 *   docs/lighthouse-baseline-mobile-<ts>.json  (with --baseline)
 *   docs/lighthouse-baseline-desktop-<ts>.json (with --baseline)
 *
 * Baseline names are preset-suffixed so mobile and desktop are compared
 * against their own histories (the gate compares one report to one baseline).
 * The pre-existing docs/lighthouse-baseline-2026-06-{18,20}.json files are
 * legacy (mobile runs) and are NOT auto-matched by this script's per-preset
 * lookup; seed fresh baselines once with --baseline.
 *
 * Exit code: 0 = every gate passed (or baselines were seeded); 1 = at least
 * one regression was detected against a prior baseline.
 * ==========================================================================*/
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TMP = path.join(ROOT, 'tmp')
const DOCS = path.join(ROOT, 'docs')
const GATE = path.join(ROOT, 'scripts', 'lighthouse-gate.mjs')

const HOST = '127.0.0.1'
const PORT = 8795
const TARGET = `http://${HOST}:${PORT}/dist/svelte/index.html`

const args = process.argv.slice(2)
const refreshBaseline = args.includes('--baseline')

const CHROME_FLAGS = '--chrome-flags=--headless=new --no-sandbox --disable-gpu'
const CATEGORIES = '--only-categories=performance,accessibility,best-practices,seo'
const OUT_JSON = '--output=json'

const PRESETS = [
    { name: 'mobile', flags: [] },
    { name: 'desktop', flags: ['--preset=desktop'] }
]

function latestBaseline(preset) {
    const prefix = `lighthouse-baseline-${preset}-`
    let files = []
    try {
        files = fs.readdirSync(DOCS).filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    } catch { /* docs dir missing — no baseline to compare */ }
    if (files.length === 0) return null
    files.sort()
    return path.join(DOCS, files.at(-1))
}

function probeServer(retries = 40, delayMs = 500) {
    return new Promise((resolve, reject) => {
        const attempt = (left) => {
            fetch(TARGET)
                .then(() => resolve(true))
                .catch(() => {
                    if (left <= 0) {
                        reject(new Error(
                            `QA server not reachable at ${TARGET}.\n` +
                            'Run: npm run build && node scripts/qa-server.mjs start'
                        ))
                        return
                    }
                    setTimeout(() => attempt(left - 1), delayMs)
                })
        }
        attempt(retries)
    })
}

function runLighthouse(preset, reportPath) {
    const flags = [TARGET, OUT_JSON, `--output-path=${reportPath}`, CATEGORIES, CHROME_FLAGS, ...preset.flags]
    console.log(`\n lighthouse (${preset.name}) -> ${path.relative(ROOT, reportPath)}`)
    const result = spawnSync('npx', ['lighthouse', ...flags], {
        shell: true,
        stdio: 'inherit',
        windowsHide: true
    })
    if (result.error) throw new Error(`Could not spawn lighthouse: ${result.error.message}`)
    if (result.status !== 0 && !fs.existsSync(reportPath))
        throw new Error(`lighthouse (${preset.name}) exited ${result.status} and wrote no report`)
    if (!fs.existsSync(reportPath))
        throw new Error(`lighthouse (${preset.name}) did not write ${reportPath}`)
}

function printSummary(preset, report) {
    const c = report.categories
    const a = report.audits
    console.log(
        `  ${`${preset.name} `.padEnd(10)}` +
        `perf=${Math.round(c.performance.score * 100)} ` +
        `a11y=${Math.round(c.accessibility.score * 100)} ` +
        `bp=${Math.round(c['best-practices'].score * 100)} ` +
        `seo=${Math.round(c.seo.score * 100)} ` +
        `fcp=${a['first-contentful-paint']?.displayValue ?? '?'} ` +
        `lcp=${a['largest-contentful-paint']?.displayValue ?? '?'} ` +
        `tbt=${a['total-blocking-time']?.displayValue ?? '?'} ` +
        `cls=${a['cumulative-layout-shift']?.displayValue ?? '?'}`
    )
}

function gateReport(preset, reportPath) {
    const prior = latestBaseline(preset.name)
    if (!prior) {
        console.log(`  ${`${preset.name} `.padEnd(10)} gate = skipped (no prior baseline; seed with --baseline)`)
        return { pass: true, skipped: true }
    }
    const reportJson = fs.readFileSync(reportPath, 'utf8')
    /* NOTE: shell is intentionally OFF here so stdin pipes to node.exe directly.
       With shell:true (cmd.exe) stdin is not forwarded to the child. */
    const result = spawnSync(process.execPath, [GATE, `--baseline=${prior}`], {
        input: reportJson,
        stdio: ['pipe', 'inherit', 'inherit'],
        windowsHide: true
    })
    const ok = result.status === 0 && !result.error
    console.log(`  ${`${preset.name} `.padEnd(10)} gate = ${ok ? 'PASS' : 'FAIL'} (vs ${path.basename(prior)})`)
    return { pass: ok, skipped: false, regressed: !ok }
}

fs.mkdirSync(TMP, { recursive: true })
const ts = String(Date.now())

probeServer()
    .then(() => {
        let anyFail = false
        let seededAny = false
        let regressedAtBaseline = false
        for (const preset of PRESETS) {
            const reportPath = path.join(TMP, `lighthouse-${preset.name}-${ts}.json`)
            runLighthouse(preset, reportPath)
            const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
            printSummary(preset, report)

            const g = gateReport(preset, reportPath)
            if (!g.pass) anyFail = true

            if (refreshBaseline) {
                const dest = path.join(DOCS, `lighthouse-baseline-${preset.name}-${ts}.json`)
                fs.copyFileSync(reportPath, dest)
                console.log(`  ${`${preset.name} `.padEnd(10)} baseline -> ${path.relative(ROOT, dest)}`)
                if (g.skipped) {
                    seededAny = true
                } else if (g.regressed) {
                    regressedAtBaseline = true
                }
            }
        }

        if (seededAny) {
            console.log(`\n Seeded new baseline(s) — re-run without --baseline to verify the gate is green.`)
        }
        if (regressedAtBaseline) {
            console.log(`\n WARNING: a regression was detected AND --baseline was set.`)
            console.log(`  Review before committing docs/lighthouse-baseline-*${ts}.json.`)
        }
        console.log(anyFail ? '\n Lighthouse gate FAILED' : '\n Lighthouse gate PASSED')
        process.exit(anyFail ? 1 : 0)
    })
    .catch((err) => {
        console.error(err.message)
        process.exit(1)
    })

#!/usr/bin/env node
/* global fetch */
/**
 * scripts/qa-lighthouse.mjs
 *
 * Run Lighthouse against the local QA server and optionally compare against
 * the stored baseline via scripts/lighthouse-gate.mjs.
 *
 * Prerequisites:
 *   npm run build
 *   node scripts/qa-server.mjs start   (port 8795)
 *
 * Usage:
 *   node scripts/qa-lighthouse.mjs                    # run mobile, print summary
 *   node scripts/qa-lighthouse.mjs --gate             # run mobile + compare baseline
 *   node scripts/qa-lighthouse.mjs --baseline         # run mobile + overwrite baseline
 *   node scripts/qa-lighthouse.mjs --desktop          # run desktop preset
 *   node scripts/qa-lighthouse.mjs --output path.json # save full report
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PORT = 8795
const HOST = '127.0.0.1'
const URL = `http://${HOST}:${PORT}/dist/svelte/index.html`
const BASELINE_DIR = path.join(ROOT, 'docs')

const args = process.argv.slice(2)
const runGate = args.includes('--gate')
const updateBaseline = args.includes('--baseline')
const desktop = args.includes('--desktop')
const outputArg = args.find((a) => a.startsWith('--output='))
const outputPath = outputArg ? outputArg.slice(9) : null

const preset = desktop ? 'desktop' : 'mobile'
const outputFile = path.join(ROOT, 'tmp', `lighthouse-${preset}-${Date.now()}.json`)

function probeServer(retries = 30, delayMs = 500) {
    return new Promise((resolve, reject) => {
        const tryOnce = () => {
            fetch(URL)
                .then(() => resolve(true))
                .catch(() => {
                    if (retries <= 0) {
                        reject(new Error(`QA server not reachable at ${URL}. Run: node scripts/qa-server.mjs start`))
                        return
                    }
                    retries--
                    setTimeout(tryOnce, delayMs)
                })
        }
        tryOnce()
    })
}

async function runLighthouse() {
    await probeServer()

    const flags = [
        URL,
        '--chrome-flags=--headless=new --no-sandbox --disable-gpu',
        '--output=json',
        `--output-path=${outputFile}`,
        '--only-categories=performance,accessibility,best-practices,seo'
    ]
    if (desktop) {
        flags.push('--preset=desktop')
    }

    console.log(`Running Lighthouse (${preset}) against ${URL}...`)

    return new Promise((resolve, reject) => {
        const child = spawn('npx', ['lighthouse', ...flags], {
            stdio: ['ignore', 'pipe', 'inherit'],
            shell: true
        })

        let stdout = ''
        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString()
        })

        child.on('close', (code) => {
            // Lighthouse sometimes exits non-zero after successfully writing the
            // report (e.g. Chrome cleanup EPERM on Windows). If the report file
            // exists, treat it as a success and let the caller decide.
            if (fs.existsSync(outputFile)) {
                resolve(outputFile)
                return
            }
            if (code !== 0) {
                reject(new Error(`Lighthouse exited with code ${code}`))
                return
            }
            resolve(outputFile)
        })
    })
}

function printSummary(report) {
    const cats = report.categories
    const audits = report.audits
    console.log('\nLighthouse Summary')
    console.log('==================')
    console.log(`Performance:     ${Math.round(cats.performance.score * 100)}`)
    console.log(`Accessibility:   ${Math.round(cats.accessibility.score * 100)}`)
    console.log(`Best Practices:  ${Math.round(cats['best-practices'].score * 100)}`)
    console.log(`SEO:             ${Math.round(cats.seo.score * 100)}`)
    console.log(`FCP:             ${audits['first-contentful-paint']?.displayValue ?? '?'}`)
    console.log(`LCP:             ${audits['largest-contentful-paint']?.displayValue ?? '?'}`)
    console.log(`TBT:             ${audits['total-blocking-time']?.displayValue ?? '?'}`)
    console.log(`CLS:             ${audits['cumulative-layout-shift']?.displayValue ?? '?'}`)
}

async function main() {
    const reportPath = await runLighthouse()
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))

    printSummary(report)

    if (outputPath) {
        fs.copyFileSync(reportPath, path.resolve(ROOT, outputPath))
        console.log(`\nReport saved to ${outputPath}`)
    }

    if (updateBaseline) {
        const baselineFiles = fs
            .readdirSync(BASELINE_DIR)
            .filter((f) => f.startsWith('lighthouse-baseline'))
            .sort()
        const nextNumber = baselineFiles.length + 1
        const baselinePath = path.join(
            BASELINE_DIR,
            `lighthouse-baseline-2026-06-${nextNumber.toString().padStart(2, '0')}.json`
        )
        fs.copyFileSync(reportPath, baselinePath)
        console.log(`\nBaseline updated: ${baselinePath}`)
    }

    if (runGate) {
        const latestBaseline = fs
            .readdirSync(BASELINE_DIR)
            .filter((f) => f.startsWith('lighthouse-baseline'))
            .sort()
            .at(-1)
        if (!latestBaseline) {
            throw new Error('No lighthouse baseline found in docs/')
        }

        const gatePath = path.join(__dirname, 'lighthouse-gate.mjs')
        const gate = spawn('node', [gatePath, `--baseline=${path.join(BASELINE_DIR, latestBaseline)}`], {
            stdio: ['pipe', 'inherit', 'inherit']
        })
        gate.stdin.write(JSON.stringify(report))
        gate.stdin.end()

        await new Promise((resolve, reject) => {
            gate.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Lighthouse gate failed with code ${code}`))
                    return
                }
                resolve(true)
            })
        })
    }

    console.log(`\nFull report: ${reportPath}`)
}

main().catch((err) => {
    console.error(err.message)
    process.exit(1)
})

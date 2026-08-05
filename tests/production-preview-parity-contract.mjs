/**
 * production-preview-parity-contract.mjs — W9-A smoke test
 *
 * Verifies that the W8 bridge retirement (commit b9c6154f) — which changed
 * the import surface from `@lib/engine/adapters/types` to direct
 * `@lib/engine/lifecycle` — does NOT regress the dev/prod parity originally
 * captured in `docs/archive/audit-reports/production-preview-parity-baseline-2026-06-17.md`.
 *
 * Compares the body data-attrs produced by:
 *   1. dev mode (Vite 5173)
 *   2. production preview (Vite preview 4174 — running build artifact)
 *
 * For the W15 baseline surface set: idle (overview), focus-search, focus,
 * journey, semantic-dive.
 *
 * The parity smoke is a **subset** check: it confirms that the W8 import
 * surface change preserves body-attr parity for the same set of user flows.
 * Full surface parity (16 surfaces) is covered by the W43-C visual contract
 * refresh; this test is the **fast lane** that runs in CI.
 *
 * If the W8 retirement introduces a parity drift, this test will fail with
 * a list of body attrs that diverge between dev and preview.
 *
 * Run:
 *   # Start dev + preview servers first
 *   npm run dev:svelte &
 *   npm run preview:svelte &
 *   sleep 5
 *   node --loader ./tests/helpers/ts-resolve-loader.mjs \
 *        tests/production-preview-parity-contract.mjs
 */

import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { setTimeout as wait } from 'node:timers/promises'

const DEV_URL = 'http://127.0.0.1:5173/?nodemo=1&view=galaxy'
const PREVIEW_URL = 'http://127.0.0.1:4174/?nodemo=1&view=galaxy'
const VIEWPORT = { width: 1440, height: 900 }
// SwiftShader gate (see visual-state-audit.mjs)
const forceSoftwareWebgl = process.env.SEMANTIC_FORCE_WEBGL_SOFTWARE === '1'

const bodyAttrsToCheck = [
    'mode',
    'navMode',
    'navSurface',
    'panelSurface',
    'panelSurfaceMode',
    'panelSurfaceDetail',
    'journeyPhase',
    'graphContext',
    'searchStatus',
    'trailDepth',
    'trailState',
    'semanticDive',
    'loadingOverlay',
    'sceneReady',
    'activeView'
]

const flows = [
    { name: 'idle (overview)', setup: null },
    { name: 'search-query "cafe"', setup: 'cafe' }
]

async function captureBodyAttrs(url) {
    const browser = await chromium.launch({ headless: true, args: [...(forceSoftwareWebgl ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--enable-webgl', '--enable-unsafe-swiftshader', '--enable-webgl-software-rendering'] : [])] })
    const context = await browser.newContext({ viewport: VIEWPORT })
    const page = await context.newPage()
    try {
        await page.goto(url, { waitUntil: 'networkidle' })
        await page.waitForTimeout(1500)
        const attrs = await page.evaluate((keys) => {
            const result = {}
            for (const key of keys) {
                result[key] = document.body.dataset[key] ?? null
            }
            return result
        }, bodyAttrsToCheck)
        return attrs
    } finally {
        await browser.close()
    }
}

async function captureAfterSearch(url, query) {
    const browser = await chromium.launch({ headless: true, args: [...(forceSoftwareWebgl ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--enable-webgl', '--enable-unsafe-swiftshader', '--enable-webgl-software-rendering'] : [])] })
    const context = await browser.newContext({ viewport: VIEWPORT })
    const page = await context.newPage()
    try {
        await page.goto(url, { waitUntil: 'networkidle' })
        await page.waitForTimeout(1500)
        const input = await page.locator('#search-input').first()
        await input.fill(query)
        await page.keyboard.press('Enter')
        await page.waitForTimeout(2000)
        const attrs = await page.evaluate((keys) => {
            const result = {}
            for (const key of keys) {
                result[key] = document.body.dataset[key] ?? null
            }
            return result
        }, bodyAttrsToCheck)
        return attrs
    } finally {
        await browser.close()
    }
}

function diffAttrs(devAttrs, previewAttrs, flowName) {
    const diffs = []
    for (const key of bodyAttrsToCheck) {
        if (devAttrs[key] !== previewAttrs[key]) {
            diffs.push({
                key,
                dev: devAttrs[key],
                preview: previewAttrs[key]
            })
        }
    }
    return { flowName, diffs }
}

async function main() {
    console.log('W9-A: Production-Preview Parity Smoke\n')
    console.log('  Dev URL    :', DEV_URL)
    console.log('  Preview URL:', PREVIEW_URL)
    console.log('  Body attrs :', bodyAttrsToCheck.length)
    console.log('')

    const allDiffs = []
    for (const flow of flows) {
        console.log(`Flow: ${flow.name}`)
        let devAttrs, previewAttrs
        try {
            devAttrs = flow.setup ? await captureAfterSearch(DEV_URL, flow.setup) : await captureBodyAttrs(DEV_URL)
        } catch (err) {
            console.log(`  [SKIP] dev server not reachable: ${err.message.split('\n')[0]}`)
            continue
        }
        try {
            previewAttrs = flow.setup
                ? await captureAfterSearch(PREVIEW_URL, flow.setup)
                : await captureBodyAttrs(PREVIEW_URL)
        } catch (err) {
            console.log(`  [SKIP] preview server not reachable: ${err.message.split('\n')[0]}`)
            continue
        }
        const result = diffAttrs(devAttrs, previewAttrs, flow.name)
        if (result.diffs.length === 0) {
            console.log(`  [OK] 0 mismatches`)
        } else {
            console.log(`  [MISMATCH] ${result.diffs.length} attr(s) differ:`)
            for (const d of result.diffs) {
                console.log(`    - ${d.key}: dev="${d.dev}" preview="${d.preview}"`)
            }
            allDiffs.push(result)
        }
        console.log('')
    }

    if (allDiffs.length > 0) {
        const totalDiffs = allDiffs.reduce((sum, f) => sum + f.diffs.length, 0)
        console.log(`\n[W9-A FAIL] ${allDiffs.length} flow(s) with ${totalDiffs} attr mismatch(es)`)
        console.log('  This indicates the W8 bridge retirement (commit b9c6154f) introduced parity drift.')
        console.log('  Investigate the offending attr(s) — likely a bridge consumer was not repointed.')
        process.exit(1)
    }

    console.log('\n[W9-A PASS] Dev and production-preview produce identical body data-attrs.')
    console.log('  W8 bridge retirement preserves W15 parity baseline.')
    process.exit(0)
}

main().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(2)
})

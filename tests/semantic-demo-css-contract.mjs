/**
 * @file semantic-demo-css-contract.mjs
 *
 * Source-driven build-contract guard for `dist/svelte/semantic-demo.css`.
 *
 * Background: the root `./semantic-demo.css` is a comment-only reserved shell
 * hook (see its own header: "do not add @import rules here"). vite.config.ts
 * minifies root-level CSS in-place via lightningcss (`transform({ minify: true })`),
 * so a comment-only source minifies to 0 bytes -> `dist/svelte/semantic-demo.css`
 * is intentionally 0 bytes (linked by index.html as an empty stylesheet, harmless).
 *
 * This check is SOURCE-DRIVEN + SELF-CALIBRATING: it re-minifies the source the
 * same way vite does and asserts the dist bytes EXACTLY equal the minified
 * source bytes. So:
 *   - comment-only source => both 0 bytes => PASS (the current benign state).
 *   - if someone later adds real rules => dist has the minified rules => matches => PASS.
 *   - a silent drop-to-0 WITHOUT matching source would FAIL by mismatch.
 *
 * Run: npm run build && node --loader ./tests/helpers/ts-resolve-loader.mjs tests/semantic-demo-css-contract.mjs
 * Registered in the `core` + `smoke` contract groups (contracts.manifest.json).
 */

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

// Resolve lightningcss via CJS (createRequire) so the runner's TS loader passes it
// through cleanly -- mirrors focus-transition-contract.mjs.
const require = createRequire(import.meta.url)
const { transform: lightningTransform } = require('lightningcss')

const root = process.cwd()
const distDir = path.join(root, 'dist/svelte')
const SOURCE_CSS = path.join(root, 'semantic-demo.css')
const DIST_CSS = path.join(distDir, 'semantic-demo.css')
const DIST_INDEX = path.join(distDir, 'index.html')

const failures = []

function rel(p) {
    return path.relative(root, p)
}

// 1. Root source must exist.
if (!fs.existsSync(SOURCE_CSS)) {
    failures.push(`root source ${rel(SOURCE_CSS)} not found`)
} else {
    const sourceBytes = fs.readFileSync(SOURCE_CSS)

    // 2. Dist: skip cleanly if absent (no build run yet) -- exit 0, no FAIL marker.
    if (!fs.existsSync(DIST_CSS)) {
        console.log(`SKIP: ${rel(DIST_CSS)} not found -- run \`npm run build\` first`)
        process.exit(0)
    }
    const distBytes = fs.readFileSync(DIST_CSS)

    // 3. Re-minify the source the same way vite does and compare bytes exactly.
    let minifiedCode
    try {
        minifiedCode = lightningTransform({
            filename: 'semantic-demo.css',
            code: sourceBytes,
            minify: true
        }).code
    } catch (e) {
        failures.push(`lightningcss transform failed: ${e.message}`)
    }

    if (!failures.length) {
        const minifiedBytes = Buffer.isBuffer(minifiedCode) ? minifiedCode : Buffer.from(minifiedCode)
        if (Buffer.compare(distBytes, minifiedBytes) !== 0) {
            failures.push(
                `dist byte mismatch: dist=${distBytes.length}B vs minified-source=${minifiedBytes.length}B ` +
                    `(${rel(DIST_CSS)} does not match lightningcss-minified source -- possible silent drop or stale build)`
            )
        }
    }

    // 4. Built index.html must still link the stylesheet (case-insensitive substring).
    if (!fs.existsSync(DIST_INDEX)) {
        failures.push(`dist/svelte/index.html not found`)
    } else {
        const indexHtml = fs.readFileSync(DIST_INDEX, 'utf8').toLowerCase()
        if (!indexHtml.includes('<link rel="stylesheet" href="semantic-demo.css">')) {
            failures.push('dist/svelte/index.html does not contain the semantic-demo.css <link> tag')
        }
    }

    // 5. Informational: confirm the source is comment-only (documents the 0-byte expectation).
    const sourceText = sourceBytes.toString('utf8')
    const stripped = sourceText.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '').trim()
    const isCommentOnly = stripped.length === 0
    if (!isCommentOnly) {
        console.log(
            `INFO: root source now contains real rules (dist matches minified source; ${fs.statSync(DIST_CSS).size}B). ` +
                `The 0-byte assumption no longer holds -- update docs/important-files.md if desired.`
        )
    }
}

// ── Report ──────────────────────────────────────────────────────────────────
if (failures.length > 0) {
    console.error('FAIL: ' + failures.length + ' contract violation(s)\n')
    failures.forEach((f) => console.error('  x ' + f))
    process.exit(1)
}

console.log('PASS: dist/svelte/semantic-demo.css matches lightningcss-minified source + index.html links it')

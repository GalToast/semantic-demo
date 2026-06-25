/**
 * @file css-minification-build-output-contract.mjs
 *
 * Locks in W44 Quick Win: root-level CSS files must be minified in the
 * build output. Without this, the Lighthouse "unminified-css" finding
 * returns — costing ~140ms on desktop and ~940ms on mobile per the
 * 2026-06-21 recheck.
 *
 * What's covered:
 *   - dist/svelte/semantic-demo.css is minified (single line, no comments)
 *   - dist/svelte/vector-explorer-pandora.css is minified
 *   - dist/svelte/css/*.css are all minified
 *   - dist/svelte/css/ directory total is ≤ 400 KB (was 551 KB unminified)
 *
 * Why structural, not behavioral: we run against the actual build output
 * (dist/svelte/), so this test only passes after `npm run build`. That's
 * intentional — the contract is "what the user downloads", not "what's
 * in source". If a refactor reintroduces unminified output, this test
 * fails immediately in CI before a Lighthouse recheck surfaces it.
 *
 * Run: npm run build && node --loader ./tests/helpers/ts-resolve-loader.mjs tests/css-minification-build-output-contract.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()
const distDir = path.join(root, 'dist/svelte')

const failures = []

function checkMinified(filePath, label) {
    if (!fs.existsSync(filePath)) {
        failures.push(`${label}: file missing at ${path.relative(root, filePath)}`)
        return
    }
    const css = fs.readFileSync(filePath, 'utf8')
    // Minified CSS should be essentially one line. Allow a trailing newline.
    const lineCount = css.replace(/\n$/, '').split('\n').length
    if (lineCount > 2) {
        failures.push(`${label}: expected ≤2 lines (minified), got ${lineCount} in ${path.relative(root, filePath)}`)
    }
    // Comments should be stripped (lightningcss strips /* */ by default).
    if (/\/\*[^*]/.test(css)) {
        // Allow the rare /*! important comments */ but flag normal ones.
        const nonImportant = css.match(/\/\*(?!!)[\s\S]*?\*\//g)
        if (nonImportant && nonImportant.length > 0) {
            failures.push(`${label}: ${nonImportant.length} non-important comment(s) remain (minifier didn't strip them)`)
        }
    }
}

function totalSize(dir) {
    if (!fs.existsSync(dir)) return 0
    return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.css'))
        .reduce((sum, f) => sum + fs.statSync(path.join(dir, f)).size, 0)
}

// ── Run checks ──────────────────────────────────────────────────────────────

console.log('=== CSS minification build-output contract ===\n')

// 1. Root-level CSS files
checkMinified(path.join(distDir, 'semantic-demo.css'), 'semantic-demo.css')
checkMinified(path.join(distDir, 'vector-explorer-pandora.css'), 'vector-explorer-pandora.css')

// 2. All css/ directory files
const cssDir = path.join(distDir, 'css')
if (!fs.existsSync(cssDir)) {
    failures.push(`css/ directory missing at ${path.relative(root, cssDir)}`)
} else {
    const cssFiles = fs.readdirSync(cssDir).filter((f) => f.endsWith('.css'))
    console.log(`Found ${cssFiles.length} CSS files in dist/svelte/css/`)
    cssFiles.forEach((f) => checkMinified(path.join(cssDir, f), `css/${f}`))
}

// 3. Total size budget (was 551 KB unminified; target ≤ 400 KB after W44 win)
const cssDirBytes = totalSize(cssDir)
const rootBytes = ['semantic-demo.css', 'vector-explorer-pandora.css']
    .map((f) => {
        const p = path.join(distDir, f)
        return fs.existsSync(p) ? fs.statSync(p).size : 0
    })
    .reduce((a, b) => a + b, 0)
const totalBytes = cssDirBytes + rootBytes
const totalKB = (totalBytes / 1024).toFixed(1)

console.log(`\ncss/ directory: ${(cssDirBytes / 1024).toFixed(1)} KB`)
console.log(`root CSS files: ${(rootBytes / 1024).toFixed(1)} KB`)
console.log(`Total: ${totalKB} KB (budget: ≤ 400 KB)\n`)

if (totalBytes > 400 * 1024) {
    failures.push(`Total CSS bytes ${totalBytes} exceeds 400 KB budget`)
}

// ── Report ──────────────────────────────────────────────────────────────────

if (failures.length > 0) {
    console.error('FAIL: ' + failures.length + ' contract violation(s)\n')
    failures.forEach((f) => console.error('  ✗ ' + f))
    process.exit(1)
}

console.log('PASS: all root-level CSS is minified and within size budget')
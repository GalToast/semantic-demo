#!/usr/bin/env node
/**
 * ci-check-svelte5-strict-mode.mjs
 *
 * CI guard: flags any `!==` usage in `.svelte` / `.svelte.ts` files that
 * is NOT protected by one of the known-safe patterns.
 *
 * The Svelte 5 strict-mode compiler can incorrectly compile `!==` to
 * `$.strict_equals(a, b, false)` (which is `===`), silently inverting
 * the comparison. This only affects reactive contexts ($derived, $:,
 * template expressions). Plain functions and module-level code are safe.
 *
 * Safe patterns (not flagged):
 *   1. Inside a `typeof x === 'X'` guard
 *   2. Inside an `appState.withMutation()` block
 *   3. Followed by a `// audit-ok:` comment
 *   4. Inside a `writable(...)` module-level init
 *   5. Inside a `setTimeout` / `setInterval` callback
 *   6. Inside a `.filter()` / `.find()` / `.some()` / `.every()` / `.map()`
 *   7. Inside a `get()` store snapshot
 *   8. DOM manipulation (document.*, body.*, window.*)
 *   9. Inside a plain function declaration
 *  10. In an allowlist file
 *
 * Exit codes:
 *   0 — no risky `!==` found
 *   1 — one or more risky `!==` found
 *
 * Usage: node scripts/ci-check-svelte5-strict-mode.mjs
 * Allowlist: scripts/ci-check-svelte5-strict-mode.allowlist.json
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const ALLOWLIST_PATH = resolve(
    PROJECT_ROOT,
    'scripts',
    'ci-check-svelte5-strict-mode.allowlist.json'
)

// Directories to scan
const SCAN_DIRS = [
    resolve(PROJECT_ROOT, 'src', 'lib'),
    resolve(PROJECT_ROOT, 'src', 'components'),
    resolve(PROJECT_ROOT, 'src')
]

// ---------------------------------------------------------------------------
// 1. Load allowlist
// ---------------------------------------------------------------------------
/** @type {Record<string, [number, number, string][]>} */
const allowlist = {}
if (existsSync(ALLOWLIST_PATH)) {
    const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf-8'))
    for (const [file, ranges] of Object.entries(raw)) {
        const abs = resolve(PROJECT_ROOT, file)
        allowlist[abs] = ranges.map(([start, end, reason]) => ({
            start,
            end,
            reason
        }))
    }
}

function isAllowlisted(absPath, line) {
    const entries = allowlist[absPath]
    if (!entries) return false
    return entries.some((e) => line >= e.start && line <= e.end)
}

// ---------------------------------------------------------------------------
// 2. Find all !== usages in .svelte / .svelte.ts files
// ---------------------------------------------------------------------------
function shouldScanFile(absPath) {
    return absPath.endsWith('.svelte') || absPath.endsWith('.svelte.ts')
}

function listSourceFiles(dir) {
    /** @type {string[]} */
    const files = []
    if (!existsSync(dir)) return files
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const abs = resolve(dir, entry.name)
        if (entry.isDirectory()) {
            files.push(...listSourceFiles(abs))
        } else if (entry.isFile() && shouldScanFile(abs)) {
            files.push(abs)
        }
    }
    return files
}

// Collect unique files from all scan directories
const allFiles = new Set()
for (const dir of SCAN_DIRS) {
    for (const f of listSourceFiles(dir)) {
        allFiles.add(f)
    }
}

// Also add App.svelte at src/ root
const appSvelte = resolve(PROJECT_ROOT, 'src', 'App.svelte')
if (existsSync(appSvelte)) {
    allFiles.add(appSvelte)
}

// ---------------------------------------------------------------------------
// 3. Classify each !== usage
// ---------------------------------------------------------------------------

/**
 * Check if the line contains a `typeof` guard pattern.
 */
function hasTypeofGuard(line) {
    return /typeof\s+\w+\s*!==?\s*['"]/.test(line)
}

/**
 * Check if the line is inside an `appState.withMutation()` block.
 */
function isInsideWithMutation(lines, lineIndex) {
    const start = Math.max(0, lineIndex - 30)
    const context = lines.slice(start, lineIndex + 1).join('\n')
    return /appState\.withMutation\s*\(/.test(context)
}

/**
 * Check if the line or next line has a `// audit-ok:` comment.
 */
function hasAuditOkComment(lines, lineIndex) {
    const current = lines[lineIndex] || ''
    const next = lines[lineIndex + 1] || ''
    return /\/\/\s*audit-ok:/.test(current) || /\/\/\s*audit-ok:/.test(next) || /<!--\s*audit-ok:/.test(current) || /<!--\s*audit-ok:/.test(next)
}

/**
 * Check if the !== usage is inside a writable() call (module-level init).
 */
function isInsideWritableInit(lines, lineIndex) {
    const start = Math.max(0, lineIndex - 10)
    const context = lines.slice(start, lineIndex + 1).join('\n')
    return /\bwritable\s*[<(]/.test(context)
}

/**
 * Check if inside a setTimeout or setInterval callback.
 */
function isInsideTimerCallback(lines, lineIndex) {
    const start = Math.max(0, lineIndex - 15)
    const context = lines.slice(start, lineIndex + 1).join('\n')
    return /setTimeout\s*\(/.test(context) || /setInterval\s*\(/.test(context)
}

/**
 * Check if the line is inside a `.filter()`, `.find()`, `.some()`,
 * `.every()`, `.map()`, or `.reduce()` callback.
 */
function isInArrayMethod(lines, lineIndex) {
    const start = Math.max(0, lineIndex - 10)
    const context = lines.slice(start, lineIndex + 1).join('\n')
    return /\.(filter|find|some|every|map|reduce)\s*\(/.test(context)
}

/**
 * Check if the line is inside a `get()` store snapshot call.
 */
function isInsideGetSnapshot(lines, lineIndex) {
    const start = Math.max(0, lineIndex - 5)
    const context = lines.slice(start, lineIndex + 1).join('\n')
    return /\bget\s*\(/.test(context)
}

/**
 * Check if the line is DOM manipulation.
 */
function isDomManipulation(text) {
    return /document\.|body\.|window\.|\.classList|\.dataset|\.setAttribute|\.getAttribute|\.style/.test(text)
}

/**
 * Check if the line is inside a standalone function declaration or arrow
 * function — clearly not reactive.
 */
function isPlainFunctionContext(lines, lineIndex) {
    const start = Math.max(0, lineIndex - 5)
    const end = Math.min(lines.length, lineIndex + 3)
    const context = lines.slice(start, end).join('\n')
    return /\bfunction\s+\w+\s*\(/.test(context) || /=>\s*\{/.test(context) || /=>\s*\(/.test(context)
}

/** @type {{file: string, line: number, text: string, reason: string}[]} */
const risky = []

for (const absFile of allFiles) {
    const source = readFileSync(absFile, 'utf-8')
    const lines = source.split('\n')
    const relFile = relative(PROJECT_ROOT, absFile).replace(/\\/g, '/')

    lines.forEach((text, index) => {
        if (!/!==/.test(text)) return

        const trimmed = text.trim()
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return

        const lineNum = index + 1

        if (isAllowlisted(absFile, lineNum)) return
        if (hasAuditOkComment(lines, index)) return
        if (hasTypeofGuard(text)) return
        if (isInsideWithMutation(lines, index)) return
        if (isInsideWritableInit(lines, index)) return
        if (isInsideTimerCallback(lines, index)) return
        if (isInArrayMethod(lines, index)) return
        if (isInsideGetSnapshot(lines, index)) return
        if (isDomManipulation(text)) return
        if (isPlainFunctionContext(lines, index)) return

        risky.push({
            file: relFile,
            line: lineNum,
            text: trimmed,
            reason: 'No typeof guard, withMutation block, audit-ok comment, or plain-function context detected'
        })
    })
}

// ---------------------------------------------------------------------------
// 4. Report
// ---------------------------------------------------------------------------
if (risky.length === 0) {
    console.log(
        '[svelte5-strict-mode] ✓ All !== usages in .svelte/.svelte.ts are protected (typeof guard, withMutation, audit-ok, or plain-function context).'
    )
    process.exit(0)
}

console.log(
    `[svelte5-strict-mode] ✗ Found ${risky.length} potentially risky !== usage(s):\n`
)
for (const r of risky) {
    console.log(`  ${r.file}:${r.line}`)
    console.log(`    ${r.text}`)
    console.log(`    Reason: ${r.reason}`)
    console.log()
}
console.log(
    'Fix: Add a // audit-ok: <reason> comment, or apply a workaround from docs/svelte-5-strict-mode-cookbook.md.'
)

process.exit(1)

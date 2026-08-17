#!/usr/bin/env node
/**
 * prod-root-align.mjs — Align a built dist so the app sits unambiguously at
 * the HTTP root and the marketing landing page sits at a separate path.
 *
 * Given a dist root (default: dist/svelte), the script:
 *   1. Verifies index.html (the SPA app) exists at the root.
 *   2. Ensures the landing page is named case-study.html — renames if needed.
 *   3. Scans for legacy vector-explorer-* aliases (left untouched, documented).
 *   4. Writes ROOT-MAP.json with routing evidence.
 *
 * Operates statically on the passed dist path. Does NOT run a dev server or
 * invoke npm run build. Safe to re-run (idempotent).
 *
 * Usage:
 *   node scripts/prod-root-align.mjs                   # default: dist/svelte
 *   node scripts/prod-root-align.mjs /path/to/dist
 */

import { readdirSync, statSync, renameSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, basename, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..')

const DEFAULT_DIST = join(REPO_ROOT, 'dist', 'svelte')
const ROOT_MAP_NAME = 'ROOT-MAP.json'

/**
 * Gather every file in dir (non-recursive, flat scan) plus a separate html-only
 * list for the routing classification path.
 */
function allFiles(dir) {
    const out = []
    try {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.isFile()) out.push(entry.name)
        }
    } catch (err) {
        // Dir doesn't exist or isn't readable — caller will FAIL explicitly.
    }
    return out
}

function htmlFiles(dir) {
    return allFiles(dir).filter((n) => n.toLowerCase().endsWith('.html'))
}

/**
 * Match legacy vector-explorer-* aliases (any extension).
 */
function legacyAliases(allNames) {
    return allNames.filter((n) => /^vector-explorer-/i.test(n))
}

/**
 * Decide whether an HTML file is the app (index.html) vs a landing page.
 * Stats/demo pages are neither and are ignored for routing purposes.
 */
function classify(htmlNames, allNames) {
    const hasApp = htmlNames.includes('index.html')
    const hasLanding = htmlNames.includes('case-study.html')
    const legacy = legacyAliases(allNames)

    // Heuristic: any non-index, non-case-study, non-stats, non-legacy HTML is
    // treated as a candidate landing page. If exactly one exists, rename it.
    const candidates = htmlNames.filter(
        (n) =>
            n !== 'index.html' &&
            n !== 'case-study.html' &&
            !/^stats$/i.test(n) &&
            !legacy.some((a) => a.toLowerCase() === n.toLowerCase())
    )

    return { hasApp, hasLanding, legacy, candidates }
}

/**
 * Main alignment routine. Returns a summary object for callers/tests.
 */
export function alignProdRoot(distPath = DEFAULT_DIST) {
    const dist = resolve(distPath)

    if (!existsSync(dist)) {
        throw new Error(`dist path does not exist: ${dist}`)
    }

    const htmlNames = htmlFiles(dist)
    const allNames = allFiles(dist)
    const { hasApp, hasLanding, legacy, candidates } = classify(htmlNames, allNames)

    // ── Fail fast if the app is missing ──────────────────────────────────────
    if (!hasApp) {
        throw new Error(`index.html (the app) not found in ${dist}. Found: ${htmlNames.join(', ')}`)
    }

    // ── Ensure the landing page is named case-study.html ────────────────────
    if (!hasLanding) {
        if (candidates.length === 1) {
            const from = join(dist, candidates[0])
            const to = join(dist, 'case-study.html')
            renameSync(from, to)
        } else if (candidates.length > 1) {
            // Multiple candidates — pick the first alphabetically as the landing.
            candidates.sort()
            const from = join(dist, candidates[0])
            const to = join(dist, 'case-study.html')
            renameSync(from, to)
        }
        // If zero candidates, there's simply no landing page; leave it absent.
    }

    // ── Build the ROOT-MAP ──────────────────────────────────────────────────
    const rootMap = {
        rootApp: true,
        landingPath: 'case-study.html',
        aliases: legacy.map((name) => ({
            file: name,
            note: 'legacy alias — kept undisturbed, serves the app SPA'
        }))
    }

    const rootMapPath = join(dist, ROOT_MAP_NAME)
    writeFileSync(rootMapPath, JSON.stringify(rootMap, null, 2) + '\n', 'utf-8')

    return {
        dist,
        rootApp: true,
        landingPath: 'case-study.html',
        aliases: legacy,
        rootMapPath
    }
}

// ── CLI entry point ─────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const distArg = process.argv[2] ? resolve(process.argv[2]) : undefined
    try {
        const result = alignProdRoot(distArg)
        console.log(JSON.stringify(result, null, 2))
    } catch (err) {
        console.error(`prod-root-align FAILED: ${err.message}`)
        process.exit(1)
    }
}

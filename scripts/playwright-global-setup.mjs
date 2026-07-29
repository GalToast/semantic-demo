/**
 * @file playwright-global-setup.mjs
 *
 * Opt-in strict-freshness guard for Playwright runs.
 *
 * Why this exists: the dev webServer (playwright.config.js) uses
 * `reuseExistingServer: true`, which SKIPS `npm run build` when port 8796 is
 * already bound. That means a stale dist (e.g. missing a CSS file after a
 * source change) can be served to tests, producing cryptic failures. The 5o
 * keyboard-hint-panel z-index regression was exactly this: a stale dist
 * missing mobile_base.css let #info-panel eat #btn-replay-tour clicks.
 *
 * This globalSetup does NOT rebuild. Rebuilding dist while a parallel test
 * server is running on 8796 risks serving partial files to that session.
 * Instead, when opted in via `PLAYWRIGHT_STRICT_FRESH=1`, it FAILS FAST with a
 * clear message if the dist is missing or stale (a build input newer than
 * dist/svelte/index.html), pointing the user at `npm run qa:journey:fresh`
 * (which builds before testing).
 *
 * Default (no env var): no-op — never disrupts parallel sessions.
 *
 * Wired into playwright.config.js as `globalSetup`.
 *
 * Test-only override: `PLAYWRIGHT_DIST_INDEX=<path>` checks a different dist
 * index (handy for unit-testing the guard without touching the real dist).
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const distIndex =
    process.env.PLAYWRIGHT_DIST_INDEX || path.join(root, 'dist/svelte/index.html')

function walkDir(dir) {
    const out = []
    try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) out.push(...walkDir(full))
            else out.push(full)
        }
    } catch {
        // dir missing — ignore
    }
    return out
}

function newestMtime(filePaths) {
    let newest = 0
    for (const p of filePaths) {
        try {
            const m = fs.statSync(p).mtimeMs
            if (m > newest) newest = m
        } catch {
            // missing input file — ignore
        }
    }
    return newest
}

export default async function globalSetup() {
    // Opt-in: default no-op so parallel sessions are never disrupted.
    if (process.env.PLAYWRIGHT_STRICT_FRESH !== '1') return

    if (!fs.existsSync(distIndex)) {
        console.error(
            '[globalSetup] dist index MISSING (' +
                path.relative(root, distIndex) +
                '). Run `npm run build` or `npm run qa:journey:fresh` before testing.'
        )
        process.exit(1)
    }

    const distMtime = fs.statSync(distIndex).mtimeMs
    // Build inputs that affect dist content (excludes package.json, whose mtime
    // changes on every install without changing dist).
    const inputs = [
        ...walkDir(path.join(root, 'src')),
        ...walkDir(path.join(root, 'css')),
        path.join(root, 'index.html'),
        path.join(root, 'semantic-demo.css'),
        path.join(root, 'vite.config.ts'),
        path.join(root, 'scripts/test-server.mjs')
    ]
    const newestInput = newestMtime(inputs)

    if (newestInput > distMtime) {
        console.error(
            '[globalSetup] dist is STALE (a build input is newer than ' +
                path.relative(root, distIndex) +
                '). Run `npm run qa:journey:fresh` to rebuild before testing.'
        )
        process.exit(1)
    }

    console.log('[globalSetup] dist is fresh (OK)')
}

// When run directly (not via Playwright's globalSetup loader), invoke the
// guard so it can be unit-tested in isolation.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    globalSetup().catch((e) => {
        console.error(e)
        process.exit(1)
    })
}

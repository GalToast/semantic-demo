/**
 * svelte-css-sweep.mjs
 *
 * Consolidated sweep: merges svelte-chrome-ownership-contract.mjs +
 * svelte-style-token-contract.mjs (W2 Phase 3+4). Checks Svelte-CSS
 * ownership boundaries and hardcoded-token compliance in one pass.
 *
 * Sweep sources (loc before/after):
 *   tests/svelte-chrome-ownership-contract.mjs     79 LOC
 *   tests/svelte-style-token-contract.mjs           89 LOC
 *   Total originals: 168 LOC → ~165 LOC in this sweep
 *
 * Pass-fail criterion: exit 0 = no violations; exit 1 + error messages = fail.
 */

import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function exists(relativePath) {
    return fs.existsSync(path.join(root, relativePath))
}

function walk(dir, files = []) {
    if (!fs.existsSync(path.join(root, dir))) return files
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const relativePath = path.join(dir, entry.name).replace(/\\/g, '/')
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === 'dist') continue
            walk(relativePath, files)
        } else {
            files.push(relativePath)
        }
    }
    return files
}

// ─── Sweep Part 1: svelte-chrome-ownership (from svelte-chrome-ownership-contract.mjs) ──

const appSource = read('src/App.svelte')
const appIslandSource = read('src/main.ts')
const shellSource = read('dist/svelte/index.html')

assert(
    appSource.includes("import('@components/InfoPanel.svelte')") || appSource.includes("import InfoPanel from '@components/InfoPanel.svelte'"),
    'src/App.svelte should own the canonical InfoPanel component directly or via lazy import'
)
assert(
    appSource.includes("import Legend from '@components/Legend.svelte'"),
    'src/App.svelte should import the canonical Legend component directly'
)
assert(
    appSource.includes('infoPanelLazy') || appSource.includes('<InfoPanel ') || appSource.includes('<InfoPanelComponent '),
    'src/App.svelte should render InfoPanel (via lazy component)'
)
assert(appSource.includes('<Legend '), 'src/App.svelte should render Legend')

assert(
    appIslandSource.includes("import App from './App.svelte'"),
    'src/main.ts should mount the unified App.svelte root'
)
assert(
    !appIslandSource.includes('InfoPanelChrome') && !appIslandSource.includes('LegendPanelChrome'),
    'src/main.ts should not mount retired chrome panels separately'
)

assert(!exists('js/modules/info-panel-chrome-island.ts'), 'obsolete info-panel-chrome-island.ts should not exist')
assert(!exists('js/modules/legend-panel-chrome-island.ts'), 'obsolete legend-panel-chrome-island.ts should not exist')
assert(!exists('js/modules/components/App.svelte'), 'retired js/modules/components/App.svelte should not be restored')
assert(!exists('js/modules/components/InfoPanelChrome.svelte'), 'retired InfoPanelChrome.svelte should not be restored')
assert(!exists('js/modules/components/LegendPanelChrome.svelte'), 'retired LegendPanelChrome.svelte should not be restored')
assert(!shellSource.includes('info-panel-chrome-island'), 'HTML shell should not expose obsolete info-panel chrome slot')
assert(!shellSource.includes('legend-panel-chrome-island'), 'HTML shell should not expose obsolete legend-panel chrome slot')

const sourceFiles = [...walk('js'), ...walk('src')].filter((file) => /\.(?:js|mjs|svelte|ts)$/.test(file))

for (const file of sourceFiles) {
    const source = read(file)
    assert(!source.includes('info-panel-chrome-island'), `${file} should not reference obsolete info-panel chrome island`)
    assert(!source.includes('legend-panel-chrome-island'), `${file} should not reference obsolete legend-panel chrome island`)
    assert(!source.includes('initInfoPanelChromeIsland'), `${file} should not import or call initInfoPanelChromeIsland`)
    assert(!source.includes('initLegendPanelChromeIsland'), `${file} should not import or call initLegendPanelChromeIsland`)
}

console.log('svelte-css-sweep [part 1] chrome ownership: src/App.svelte is the single info/legend chrome owner.')

// ─── Sweep Part 2: svelte-style-token (from svelte-style-token-contract.mjs) ──

const SRC_ROOT = path.join(root, 'src')
const PRIMARY_ALT_RE = /#4ecdc4\b|rgba?\(\s*78\s*,\s*205\s*,\s*196/gi
const STYLE_BLOCK_RE = /<style[^>]*>([\s\S]*?)<\/style>/gi

const ALLOWLIST = new Set([
    'src/components/Canvas.svelte',
    'src/components/CompassRail.svelte',
    'src/components/Controls.svelte',
    'src/components/FocusPocket.svelte',
    'src/components/Splash.svelte'
])

function listSvelteFiles(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) listSvelteFiles(full, out)
        else if (entry.name.endsWith('.svelte')) out.push(full)
    }
    return out
}

function styleBlocksContent(src) {
    let css = ''
    let m
    while ((m = STYLE_BLOCK_RE.exec(src)) !== null) css += m[1] + '\n'
    STYLE_BLOCK_RE.lastIndex = 0
    return css
}

const failures = []
const migrationCandidates = []

for (const abs of listSvelteFiles(SRC_ROOT)) {
    const rel = path.relative(root, abs).replace(/\\/g, '/')
    const css = styleBlocksContent(fs.readFileSync(abs, 'utf8'))
    if (!css) continue
    const hits = css.match(PRIMARY_ALT_RE)
    if (!hits) continue
    if (ALLOWLIST.has(rel)) continue
    failures.push(
        `${rel}: ${hits.length} hardcoded primary-alt in <style> — use var(--color-primary-alt) / rgba(var(--color-primary-alt-rgb), α)`
    )
}

for (const rel of ALLOWLIST) {
    const abs = path.join(root, rel)
    if (!fs.existsSync(abs)) continue
    const css = styleBlocksContent(fs.readFileSync(abs, 'utf8'))
    if (css && !css.match(PRIMARY_ALT_RE)) migrationCandidates.push(rel)
}

if (failures.length) {
    console.error('svelte-css-sweep [part 2] style token contract FAIL — new hardcoded primary-alt colors in .svelte <style>:')
    for (const f of failures) console.error(`  - ${f}`)
    console.error('')
    console.error('Use var(--color-primary-alt) or rgba(var(--color-primary-alt-rgb), <alpha>) instead.')
    console.error('If grandfathering is truly required, add the file to ALLOWLIST with a justification comment.')
    process.exit(1)
}

console.log(`svelte-css-sweep [part 2] style token: ${ALLOWLIST.size} grandfathered file(s), 0 new violations.`)
if (migrationCandidates.length) {
    console.log(
        `  Migration candidates (zero hardcodes — remove from ALLOWLIST to lock): ${migrationCandidates.join(', ')}`
    )
}

console.log('svelte-css-sweep OK: Svelte-CSS ownership boundaries and token parity preserved.')

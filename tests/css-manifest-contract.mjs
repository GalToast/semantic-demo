import fs from 'node:fs'
import path from 'node:path'
import { MOBILE_PREMIUM_SPLIT } from './_fixtures/mobile-premium-split.mjs'

const root = process.cwd()

const failures = []

function read(relativePath) {
    const fullPath = path.join(root, relativePath)
    if (!fs.existsSync(fullPath)) {
        failures.push(`${relativePath} is missing`)
        return ''
    }
    return fs.readFileSync(fullPath, 'utf8')
}

function activeLines(cssText) {
    return cssText
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
}

/**
 * Assert that vite.config.ts's LEGACY_CSS_LINKS array references every
 * shipped CSS file AND that each referenced file exists on disk.
 *
 * Replaces the pre-`5a1a7df5` contract `assertImportShell('semantic-demo.css', …)`:
 * after that refactor `semantic-demo.css` is shell-only (no @imports) and the
 * canonical shipping manifest moved to `LEGACY_CSS_LINKS` in `vite.config.ts`
 * (the array injected into built HTML via `transformIndexHtml`).
 *
 * When adding/removing a shipped CSS file, update BOTH `LEGACY_CSS_LINKS` in
 * `vite.config.ts` AND the `expectedCssPaths` list at the call site below.
 */
function assertLegacyCssLinksContains(relativePath, expectedCssPaths) {
    const ts = read(relativePath)
    const m = ts.match(/LEGACY_CSS_LINKS\s*=\s*\[([\s\S]*?)\]/)
    if (!m) {
        failures.push(`${relativePath} must define a LEGACY_CSS_LINKS array literal`)
        return
    }
    const block = m[1]
    for (const cssPath of expectedCssPaths) {
        if (!block.includes(`href="${cssPath}"`)) {
            failures.push(`${relativePath} LEGACY_CSS_LINKS must reference ${cssPath}`)
        }
        if (!fs.existsSync(path.join(root, cssPath))) {
            failures.push(`${relativePath} LEGACY_CSS_LINKS references missing stylesheet ${cssPath}`)
        }
    }
}

const requiredFragments = [
    // Remaining body[data-*] selectors (not yet migrated or intentionally kept)
    "data-panel-surface='focus-search'",
    'data-panel-surface="semantic-dive"',
    // Phase B3 class-based equivalents
    'body.surface-idle',
    'body.surface-search',
    'body.surface-focus-search',
    'body.surface-semantic-dive',
    'body.surface-map-any',
    '.map-trail-strip',
    '.focus-stage-card'
]

// Post-5a1a7df5 contract: vite.config.ts LEGACY_CSS_LINKS is the canonical
// shipping manifest for the css/* cascade (plus two root standalone styles
// semantic-demo.css + vector-explorer-pandora.css). Update both this list
// AND LEGACY_CSS_LINKS when adding/removing a shipped CSS file.
assertLegacyCssLinksContains('vite.config.ts', [
    'semantic-demo.css',
    'vector-explorer-pandora.css',
    'css/base.css',
    'css/loading.css',
    'css/shell.css',
    'css/time_weather.css',
    'css/synthesis.css',
    'css/controls.css',
    'css/layout_base.css',
    'css/search.css',
    'css/mobile_base.css',
    'css/journey_steps.css',
    'css/journey_active.css',
    'css/clusters.css',
    'css/progressive_disclosure.css',
    'css/strands.css',
    'css/animations.css',
    'css/mobile_premium__components.css',
    'css/mobile_premium__layout.css',
    'css/mobile_premium__state.css',
    'css/modules/focus_stage.css'
])

// mobile_premium split: each shard must ship as a comment-only @import-free stylesheet.
// (No @import lines because they're flattened top-level files loaded via LEGACY_CSS_LINKS.)
for (const file of MOBILE_PREMIUM_SPLIT) {
    const filePath = `css/${file}`
    const css = read(filePath)
    if (!css) {
        failures.push(`${filePath} must exist (split of mobile_premium.css on 2026-06-03)`)
        continue
    }
    const lines = activeLines(css)
    const imports = lines.filter((line) => line.startsWith('@import url('))
    if (imports.length) {
        failures.push(`${filePath} is collapsed; remove active @import rules: ${JSON.stringify(imports)}`)
    }
}

const combinedMobilePremium = MOBILE_PREMIUM_SPLIT.map((file) => read(`css/${file}`)).join('\n')
for (const fragment of requiredFragments) {
    if (!combinedMobilePremium.includes(fragment)) {
        failures.push(
            `mobile_premium split must keep fragment ${JSON.stringify(fragment)} across the ${MOBILE_PREMIUM_SPLIT.length} files`
        )
    }
}

const shellHtml = read('docs/archive/vector-explorer-polished-legacy.html')
if (!shellHtml.includes('semantic-demo.css')) {
    failures.push('docs/archive/vector-explorer-polished-legacy.html must reference semantic-demo.css')
}
let loadedSplits = 0
for (const file of MOBILE_PREMIUM_SPLIT) {
    if (shellHtml.includes(file)) loadedSplits++
}
if (loadedSplits < MOBILE_PREMIUM_SPLIT.length) {
    failures.push(
        `docs/archive/vector-explorer-polished-legacy.html must reference all ${MOBILE_PREMIUM_SPLIT.length} mobile_premium split files; found ${loadedSplits}`
    )
}

if (failures.length) {
    console.error('CSS manifest contract failed:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
}

console.log(
    'CSS manifest contract passed: vite.config.ts LEGACY_CSS_LINKS is the canonical css shipping list; semantic-demo.css is a comment-only shell; mobile_premium split shards are flat; docs/archive legacy HTML stays synchronized.'
)

/**
 * search-sheet-css-ownership-contract.mjs
 *
 * Source-only ownership contract for mobile search/focus-search none, peek,
 * and expanded sheet layout.
 *
 * Ownership rules:
 *   1. data-panel-surface-detail="none|peek|expanded" layout belongs to the
 *      STATE-MACHINE split owner.
 *   2. Baseline search result chrome stays in the split mobile owner.
 *
 * Selector-pattern note: the CSS uses `body.surface-X[data-panel-surface-detail='Y']`
 * (class + attribute combo) while earlier code pre-PhaseB used the pure-attribute
 * selector `[data-panel-surface='X'][data-panel-surface-detail='Y']`. Both forms
 * are accepted in the regexes below to make the contract tolerant of either
 * migration.
 *
 * Usage:
 *   node tests/search-sheet-css-ownership-contract.mjs
 */

import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.cwd())
const MOBILE_PREMIUM_SPLIT = [
    'mobile_premium__components.css',
    'mobile_premium__layout.css',
    'mobile_premium__state.css',
    'mobile_premium__components.css',
    'mobile_premium__state.css',
    'mobile_premium__layout.css'
]
const MOBILE_PREMIUM_PATH = MOBILE_PREMIUM_SPLIT.map((f) => path.join(ROOT, `css/${f}`))

// ── Selector-pattern helpers ──────────────────────────────────────────────
// Accept either the class form (`body.surface-search`) or the attribute form
// (`[data-panel-surface='search']`) or both stacked. Captures the surface mode.
const surfaceMode = (mode) => `(?:body\\.surface-${mode}|\\[data-panel-surface=['"]${mode}['"]\\])`

// Accept the surface-detail attribute (`[data-panel-surface-detail='X']`).
const surfaceDetail = (detail) => `\\[data-panel-surface-detail=['"]${detail}['"]\\]`

// Accept the search-results-active target, either class or id form.
const searchActive = '(?:#search-results|\\.search-results)[^,{]*\\.active'

// Accept an info-panel target reference inside a rule body.
const infoPanelRef = '\\.info-panel'

function read(filePath) {
    if (Array.isArray(filePath)) return filePath.map(read).join('\n')
    return fs.readFileSync(filePath, 'utf8')
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}

function run() {
    console.log('=================================================================')
    console.log('search-sheet-css-ownership-contract.mjs')
    console.log('Contract test: mobile search sheet state/style ownership')
    console.log('=================================================================')

    const mobilePremiumSrc = read(MOBILE_PREMIUM_PATH)

    console.log('\n[TEST] mobile_premium split STATE-MACHINE section owns none/peek/expanded search sheet detail')
    assert(
        /\/\*\s*─── STATE-MACHINE STYLES/.test(mobilePremiumSrc),
        'mobile premium split must keep a named STATE-MACHINE STYLES section'
    )
    // For "detail=none": class form uses `[data-panel-surface-detail='none']`
    // and `:not([data-panel-surface-detail])` rule downstream still references
    // `#search-results.active`.
    assert(
        new RegExp(`${surfaceDetail('none')}[\\s\\S]*${searchActive}`).test(mobilePremiumSrc) &&
            /:not\(\[data-panel-surface-detail\]\)[\s\S]*#search-results\.active/.test(mobilePremiumSrc),
        'mobile premium split must own search detail=none and absent-detail results sizing'
    )
    // For "detail=peek" on search mode: surface=search + detail=peek + active target.
    assert(
        new RegExp(`${surfaceMode('search')}[^,{]*${surfaceDetail('peek')}[\\s\\S]*?${searchActive}`).test(
            mobilePremiumSrc
        ),
        'mobile premium split must own search peek results sizing'
    )
    // For "detail=peek" on focus-search mode: surface=focus-search + detail=peek
    // + target on .info-panel.
    assert(
        new RegExp(`${surfaceMode('focus-search')}[^,{]*${surfaceDetail('peek')}[\\s\\S]*?${infoPanelRef}`).test(
            mobilePremiumSrc
        ),
        'mobile premium split must own focus-search peek drawer geometry'
    )
    // Expanded surface + both search and focus-search modes: a rule that gates
    // .info-panel styling by surface=in{search, focus-search} AND detail=expanded.
    assert(
        new RegExp(
            `(?:${surfaceMode('search')}[^,{]*${surfaceDetail('expanded')}[\\s\\S]*?${surfaceMode('focus-search')}|` +
                `${surfaceMode('focus-search')}[^,{]*${surfaceDetail('expanded')}[\\s\\S]*?${surfaceMode('search')})` +
                `[\\s\\S]*?${infoPanelRef}`
        ).test(mobilePremiumSrc),
        'mobile premium split must own search/focus-search expanded drawer geometry'
    )
    assert(
        new RegExp(`${surfaceDetail('peek')}[\\s\\S]*?\\.search-result-name`).test(mobilePremiumSrc),
        'mobile premium split must own compact peek result typography'
    )
    console.log('  OK - split state section owns search sheet detail states')

    console.log('\n[TEST] mobile_premium split keeps baseline search chrome')
    assert(
        /\.search-results\.active[\s\S]*border-radius/.test(mobilePremiumSrc) &&
            /\.search-result-item\.top-result[\s\S]*padding/.test(mobilePremiumSrc),
        'mobile premium split should keep baseline search result chrome'
    )
    console.log('  OK - baseline chrome exists in the collapsed mobile owner')

    console.log('\n=================================================================')
    console.log('ALL TESTS PASSED')
    console.log('=================================================================')
}

run()

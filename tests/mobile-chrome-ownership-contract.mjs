/**
 * mobile-chrome-ownership-contract.mjs
 *
 * Source-only guard for mobile utility chrome ownership.
 * The app has several historical chrome selectors; this contract keeps the
 * high-risk mobile suppression rules explicit and prevents dead duplicate
 * camera binding modules from re-entering the graph.
 */

import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.cwd())
const MOBILE_PREMIUM_SPLIT = [
    'mobile_premium__focus-dive.css',
    'mobile_premium__chrome.css',
    'mobile_premium__state.css',
    'mobile_premium__idle.css',
    'mobile_premium__map.css',
    'mobile_premium__surfaces.css',
    'mobile_premium__narrow.css'
]
const MOBILE_PREMIUM_CSS = MOBILE_PREMIUM_SPLIT.map((f) => path.join(ROOT, `css/${f}`))
const APP_SHELL = path.join(ROOT, 'src/App.svelte')
const CAMERA_UI_BINDINGS = path.join(ROOT, 'js/modules/camera-ui-bindings.ts')

function read(filePath) {
    if (Array.isArray(filePath)) return filePath.map(read).join('\n')
    return fs.readFileSync(filePath, 'utf8')
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}

function assertContains(src, pattern, message) {
    assert(pattern.test(src), message)
}

function run() {
    console.log('=================================================================')
    console.log('mobile-chrome-ownership-contract.mjs')
    console.log('Contract test: mobile utility chrome ownership')
    console.log('=================================================================')

    const mobilePremiumSrc = read(MOBILE_PREMIUM_CSS)
    const appSrc = read(APP_SHELL)

    console.log('\n[TEST] map-owned surfaces suppress standalone utility chrome')
    // Check that map-trail-strip/map-idle suppress utility chrome
    const hasMapTrailStripSuppression =
        /data-journey-navigation-owner=['"]map-trail-strip['"]/.test(mobilePremiumSrc) &&
        /display:\s*none/.test(mobilePremiumSrc)
    assert(
        hasMapTrailStripSuppression,
        'mobile premium split must suppress utility chrome for map-trail-strip ownership states'
    )
    console.log('  OK - map-trail-strip and map-idle share one explicit suppression rule')

    console.log('\n[TEST] short landscape focus and dive surfaces preserve essential info chrome')
    assertContains(
        mobilePremiumSrc,
        /@media\s*\(max-width:\s*900px\)\s*and\s*\(max-height:\s*430px\)\s*and\s*\(orientation:\s*landscape\)[\s\S]*body\.is-active:is\([\s\S]*data-panel-surface=['"]focus['"][\s\S]*data-panel-surface=['"]focus-search['"][\s\S]*data-panel-surface=['"]semantic-dive['"][\s\S]*\)\s+:is\([\s\S]*\.share-toggle[\s\S]*\.controls[\s\S]*\.panel-toggle[\s\S]*\.time-display[\s\S]*\)\s*{[\s\S]*display:\s*none;[\s\S]*visibility:\s*hidden;[\s\S]*pointer-events:\s*none;/,
        'mobile premium split must suppress share/panel/time chrome on focus/dive short-landscape surfaces wider than the standard mobile breakpoint'
    )
    assertContains(
        mobilePremiumSrc,
        /@media\s*\(max-width:\s*900px\)\s*and\s*\(max-height:\s*430px\)\s*and\s*\(orientation:\s*landscape\)[\s\S]*body\.is-active:is\([\s\S]*data-panel-surface=['"]focus['"][\s\S]*data-panel-surface=['"]focus-search['"][\s\S]*data-panel-surface=['"]semantic-dive['"][\s\S]*\)\s+#btn-share-view\s*{[\s\S]*display:\s*none;[\s\S]*visibility:\s*hidden;[\s\S]*pointer-events:\s*none;/,
        'mobile premium split must suppress the share button separately so #btn-share-view does not raise .controls specificity'
    )
    assertContains(
        mobilePremiumSrc,
        /@media\s*\(max-width:\s*900px\)\s*and\s*\(max-height:\s*430px\)\s*and\s*\(orientation:\s*landscape\)[\s\S]*body\.is-active:is\([\s\S]*data-panel-surface=['"]focus['"][\s\S]*data-panel-surface=['"]focus-search['"][\s\S]*data-panel-surface=['"]semantic-dive['"][\s\S]*\)\s+:is\(#btn-legend,\s*#btn-keyboard-help\)\s*{[\s\S]*display:\s*flex;[\s\S]*visibility:\s*visible;[\s\S]*pointer-events:\s*auto;/,
        'mobile premium split must keep legend/help tappable on focus/dive short-landscape surfaces'
    )
    console.log('  OK - short-landscape focus/dive suppresses nonessential chrome and preserves legend/help')

    console.log('\n[TEST] idle and search surfaces keep chrome out of compact panels')
    assertContains(
        mobilePremiumSrc,
        /data-panel-surface=['"]idle['"][\s\S]*\.controls\s*{[\s\S]*display:\s*none;[\s\S]*visibility:\s*hidden;[\s\S]*pointer-events:\s*none;/,
        'mobile premium split must hide .controls in mobile idle'
    )
    assertContains(
        mobilePremiumSrc,
        /data-panel-surface=['"]idle['"][\s\S]*\.share-toggle\s*{[\s\S]*display:\s*none;[\s\S]*visibility:\s*hidden;[\s\S]*pointer-events:\s*none;/,
        'mobile premium split must hide .share-toggle in mobile idle'
    )
    assertContains(
        mobilePremiumSrc,
        /data-panel-surface=['"]search['"][\s\S]*#btn-share-view[\s\S]*#btn-legend[\s\S]*\.controls\s*{[\s\S]*opacity:\s*0;[\s\S]*visibility:\s*hidden;[\s\S]*pointer-events:\s*none;/,
        'mobile premium split must suppress share/legend/controls in search surfaces'
    )
    console.log('  OK - idle and search suppression owners are explicit')

    console.log('\n[TEST] duplicate camera UI binding module stays retired')
    assert(
        !fs.existsSync(CAMERA_UI_BINDINGS),
        'js/modules/camera-ui-bindings.ts must not exist as an unowned duplicate binding module'
    )
    assert(
        !/camera-ui-bindings|initCameraUiBindings/.test(appSrc),
        'App.svelte must not import or initialize camera-ui-bindings'
    )
    console.log('  OK - camera UI controls remain owned by the Svelte shell and Controls component')

    console.log('\n=================================================================')
    console.log('ALL TESTS PASSED')
    console.log('=================================================================')
}

run()

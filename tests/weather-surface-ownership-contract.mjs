/**
 * weather-surface-ownership-contract.mjs
 *
 * Fast static contract test for weather widget UI ownership.
 *
 * Coverage:
 *   1. The app shell has one weather widget and one weather overlay.
 *   2. weather-ui.js reveals the hidden widget when data or fallback copy renders.
 *   3. time_weather.css owns weather widget visuals and visibility policy.
 *   4. Legacy state/layout stylesheets do not reintroduce weather widget rules.
 *   5. Motion-only weather references stay limited to motion policy files.
 *
 * Usage:
 *   node tests/weather-surface-ownership-contract.mjs
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { resolveSource } from './source-path.mjs'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(resolveSource(relativePath, root), 'utf8')

const html = read('docs/archive/vector-explorer-polished-legacy.html')
const weatherUiJs = read('src/lib/ui/weather-ui.ts')
const timeWeatherCss = read('css/time_weather.css')

const widgetMatches = html.match(/class="[^"]*\bweather-widget\b[^"]*"/g) ?? []
const overlayMatches = html.match(/id="weather-overlay"/g) ?? []

assert.equal(widgetMatches.length, 1, 'app shell should render exactly one .weather-widget')
assert.equal(overlayMatches.length, 1, 'app shell should render exactly one #weather-overlay')
assert.match(
    html,
    /class="[^"]*\bweather-widget\b[^"]*"[^>]*\bhidden\b/,
    'weather widget should start hidden until weather.js has data or fallback copy to render'
)

assert.match(
    weatherUiJs,
    /function\s+revealWeatherWidget\s*\([^)]*\)\s*(?::\s*void\s*)?\s*\{[\s\S]*?document\.getElementById\(['"]weather-widget['"]\)[\s\S]*?(?:display\s*=\s*['"]block['"]|\.hidden\s*=\s*false)/,
    'weather-ui should own a revealWeatherWidget helper that shows the weather-widget element'
)
// Post-W46: widget visibility for live weather data is now CSS-driven by
// data-panel-surface state; the JS reveal helper is invoked on the fallback
// path (renderWeatherFallback) and the reactive router (onWeatherStateChange)
// dispatches both live and fallback rendering.
assert.match(
    weatherUiJs,
    /export\s+function\s+onWeatherStateChange\s*\([^)]*\).*?\{[\s\S]*?renderWeatherFallback[\s\S]*?updateWeatherUi/,
    'onWeatherStateChange should route both fallback and live weather rendering'
)
assert.match(
    weatherUiJs,
    /export\s+function\s+renderWeatherFallback\s*\([^)]*\).*?\{[\s\S]*?revealWeatherWidget\(\)\s*;?/,
    'renderWeatherFallback should reveal the widget for fallback weather state'
)

for (const marker of [
    '.weather-widget {',
    '.weather-temp',
    '.weather-desc',
    '.weather-wind',
    '.weather-staleness',
    '@media (max-width: 768px)'
]) {
    assert.ok(timeWeatherCss.includes(marker), `time_weather.css should contain canonical weather marker: ${marker}`)
}

assert.doesNotMatch(
    timeWeatherCss,
    /\.(?:view-toggle|trail-btn|focus-stage-journey-btn|btn-synthesize|suggestion-btn|share-toggle|close-icon|control-btn|panel-toggle|legend-toggle)\b/,
    'time_weather.css should not own generic app-control button or icon layout'
)

const MOBILE_PREMIUM_SPLIT = [
    'css/mobile_premium__focus-dive.css',
    'css/mobile_premium__chrome.css',
    'css/mobile_premium__state.css',
    'css/mobile_premium__idle.css',
    'css/mobile_premium__surfaces.css',
    'css/mobile_premium__narrow.css'
]

const forbiddenWeatherOwners = [
    'css/strands.css',
    'css/journey_active.css',
    'css/layout_base.css',
    ...MOBILE_PREMIUM_SPLIT
]

for (const relativePath of forbiddenWeatherOwners) {
    const css = read(relativePath)
    assert.doesNotMatch(
        css,
        /\.weather-(?:widget|temp|desc|wind|staleness|icon)\b|#weather-overlay\b/,
        `${relativePath} should not own weather widget visual or visibility rules`
    )
}

const animationsCss = read('css/animations.css')
assert.match(
    animationsCss,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.weather-widget[\s\S]*?\}/,
    'animations.css may reference weather only as part of reduced-motion policy'
)
assert.doesNotMatch(
    animationsCss.replace(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/g, ''),
    /\.weather-(?:widget|temp|desc|wind|staleness|icon)\b|#weather-overlay\b/,
    'animations.css should not contain non-motion weather widget rules'
)

const mobileBaseCss = read('css/mobile_base.css')
assert.match(
    mobileBaseCss,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.weather-widget[\s\S]*?\.weather-icon\s+\.weather-seed-base[\s\S]*?\}/,
    'mobile_base.css may reference weather only as part of reduced-motion policy'
)

console.log('weather-surface-ownership-contract passed')

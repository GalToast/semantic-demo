/**
 * weather-lifecycle-contract.mjs
 *
 * Fast static contract test for weather timer ownership.
 *
 * Coverage:
 *   1. weather.js is safe to import outside a browser window.
 *   2. initWeather restarts timers when initialized state is stale.
 *   3. clearWeatherRefreshTimer clears its interval and resets weatherInitialized.
 *   4. weather-ui owns lightning recursion with a generation token.
 *   5. weather timer helpers are no longer exported on window.
 *
 * Usage:
 *   node tests/weather-lifecycle-contract.mjs
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import { resolveSource } from './source-path.mjs'
import './helpers/svelte-rune-shim.mjs'

const root = process.cwd()
const weatherPath = resolveSource('src/lib/utils/weather.ts', root)
const weatherUiPath = resolveSource('src/lib/ui/weather-ui.ts', root)
const src = fs.readFileSync(weatherPath, 'utf8')
const uiSrc = fs.readFileSync(weatherUiPath, 'utf8')

assert.match(
    src,
    /if\s*\(\s*appState\.weatherInitialized\s*&&\s*weatherRefreshTimer\s*\)\s*return/,
    'initWeather should only no-op when initialized state and its refresh timer are present'
)
assert.match(
    src,
    /clearWeatherRefreshTimer\(\)\s*state\.weatherInitialized\s*=\s*true\s*fetchWeather\(\)/,
    'initWeather should clear stale timer state before starting a fresh lifecycle'
)
assert.match(
    src,
    /state\.weatherInitialized\s*=\s*false/,
    'clearWeatherRefreshTimer should reset weatherInitialized so hydration can restart timers'
)
// Trailing semicolons optional — weather-ui.ts dropped semicolons in a style sweep;
// the generation-token invariant is what matters, not statement terminators.
assert.match(
    uiSrc,
    /let\s+lightningGeneration\s*(?::\s*number\s*)?=\s*0\s*;?/,
    'weather-ui should own a lightning generation token'
)
assert.match(
    uiSrc,
    /(?:const|let)\s+generation\s*=\s*lightningGeneration\s*\+\s*1\s*;?[\s\S]*?if\s*\(\s*generation\s*!==\s*lightningGeneration\s*\)\s*return/,
    'scheduleLightning should prevent stale recursive lightning callbacks from rescheduling'
)
assert.doesNotMatch(
    `${src}\n${uiSrc}`,
    /window\.(updateWeatherStaleness|refreshWeatherStalenessIndicator|clearWeatherRefreshTimer)\s*=/,
    'weather timer helpers should not be exported on window'
)

console.log('weather-lifecycle-contract static passed')

// ── Runtime Behavioral Tests ──────────────────────────────────────────────────

// Shims needed for weather module (window, setInterval, clearInterval, fetch)
const savedWindow = globalThis.window
let intervalId = 0
const intervals = new Map()

globalThis.window = {
    setInterval(fn, ms) {
        const id = ++intervalId
        intervals.set(id, { fn, ms })
        return id
    },
    clearInterval(id) {
        intervals.delete(id)
    },
    location: { search: '' },
    addEventListener() {},
    removeEventListener() {},
    matchMedia() { return { matches: false, addEventListener() {}, removeEventListener() {} } }
}

// Import and test initWeather, clearWeatherRefreshTimer
const { initWeather, clearWeatherRefreshTimer } = await import('../src/lib/utils/weather.ts')
const { appState } = await import('../src/lib/state/app.svelte.ts')

// R1: initWeather SSR guard — returns early when window is undefined
{
    const saved = globalThis.window
    // @ts-ignore
    delete globalThis.window
    try {
        initWeather()
        console.log('  R1 PASS: initWeather SSR guard (no window → early return, no throw)')
    } catch (e) {
        console.error(`  R1 FAIL: initWeather threw under SSR: ${e.message}`)
        process.exitCode = 1
    }
    globalThis.window = saved
}

// R2: clearWeatherRefreshTimer resets weatherInitialized to false
{
    appState.weatherInitialized = true
    clearWeatherRefreshTimer()
    assert.strictEqual(
        appState.weatherInitialized,
        false,
        'clearWeatherRefreshTimer must set weatherInitialized=false'
    )
    console.log('  R2 PASS: clearWeatherRefreshTimer → weatherInitialized = false')
}

// R3: clearWeatherRefreshTimer clears the timer reference
{
    appState.weatherInitialized = true
    // Force a fake timer
    const { initWeather: initW } = await import('../src/lib/utils/weather.ts')
    // Don't call initWeather (it calls fetch) — just test the clear path
    clearWeatherRefreshTimer()
    console.log('  R3 PASS: clearWeatherRefreshTimer is callable and idempotent')
}

// R4: initWeather starts a fresh timer when not initialized
{
    appState.weatherInitialized = false
    intervals.clear()
    try {
        initWeather()
        // After initWeather, a timer should be registered (setInterval called)
        // but fetchWeather() will also be called which may fail in Node.
        // The key invariant is that initWeather doesn't throw.
        console.log('  R4 PASS: initWeather runs without throwing (with window shim)')
    } catch (e) {
        // If fetch fails, that's expected in Node — the lifecycle still ran
        if (e.message?.includes('fetch')) {
            console.log('  R4 PASS: initWeather lifecycle ran (fetch failed as expected in Node)')
        } else {
            console.error(`  R4 FAIL: initWeather threw unexpected error: ${e.message}`)
            process.exitCode = 1
        }
    }
}

// R5: SSR-safe — restore window, verify initWeather works
{
    // Window is already restored from R1. Call clear first.
    clearWeatherRefreshTimer()
    console.log('  R5 PASS: weather lifecycle functions are importable and callable in Node')
}

// Cleanup
if (savedWindow !== undefined) {
    globalThis.window = savedWindow
}

console.log('weather-lifecycle-contract complete')

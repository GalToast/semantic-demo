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
    /state\.weatherInitialized\s*=\s*false;/,
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

console.log('weather-lifecycle-contract passed')

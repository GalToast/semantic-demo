/**
 * weather-lifecycle-contract.mjs
 *
 * Fast static contract test for weather timer ownership.
 *
 * Coverage:
 *   1. weather.js is safe to import outside a browser window.
 *   2. initWeather restarts timers when initialized state is stale.
 *   3. clearWeatherRefreshTimer clears both intervals and resets weatherInitialized.
 *   4. lightning recursion is guarded by a generation token.
 *   5. weather timer helpers are no longer exported on window.
 *
 * Usage:
 *   node tests/weather-lifecycle-contract.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const weatherPath = path.join(root, 'js/modules/weather.js');
const src = fs.readFileSync(weatherPath, 'utf8');

await import(pathToFileURL(weatherPath).href);

assert.match(
  src,
  /if\s*\(\s*state\.weatherInitialized\s*&&\s*weatherRefreshTimer\s*&&\s*stalenessIntervalId\s*\)\s*return/,
  'initWeather should only no-op when initialized state and both interval timers are present'
);
assert.match(
  src,
  /clearWeatherRefreshTimer\(\);\s*state\.weatherInitialized\s*=\s*true;\s*fetchWeather\(\);/,
  'initWeather should clear stale timer state before starting a fresh lifecycle'
);
assert.match(
  src,
  /state\.weatherInitialized\s*=\s*false;/,
  'clearWeatherRefreshTimer should reset weatherInitialized so hydration can restart timers'
);
assert.match(
  src,
  /let\s+lightningGeneration\s*=\s*0;/,
  'weather.js should own a lightning generation token'
);
assert.match(
  src,
  /const\s+generation\s*=\s*lightningGeneration\s*\+\s*1;[\s\S]*?if\s*\(\s*generation\s*!==\s*lightningGeneration\s*\)\s*return;/,
  'scheduleLightning should prevent stale recursive lightning callbacks from rescheduling'
);
assert.doesNotMatch(
  src,
  /window\.(updateWeatherStaleness|refreshWeatherStalenessIndicator|clearWeatherRefreshTimer)\s*=/,
  'weather timer helpers should not be exported on window'
);

console.log('weather-lifecycle-contract passed');

/**
 * weather-surface-ownership-contract.mjs
 *
 * Fast static contract test for weather widget UI ownership.
 *
 * Coverage:
 *   1. The app shell has one weather widget and one weather overlay.
 *   2. weather.js reveals the hidden widget when data or fallback copy renders.
 *   3. time_weather.css owns weather widget visuals and visibility policy.
 *   4. Legacy state/layout stylesheets do not reintroduce weather widget rules.
 *   5. Motion-only weather references stay limited to motion policy files.
 *
 * Usage:
 *   node tests/weather-surface-ownership-contract.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const html = read('vector-explorer-polished.html');
const weatherJs = read('js/modules/weather.js');
const timeWeatherCss = read('css/time_weather.css');

const widgetMatches = html.match(/class="[^"]*\bweather-widget\b[^"]*"/g) ?? [];
const overlayMatches = html.match(/id="weather-overlay"/g) ?? [];

assert.equal(widgetMatches.length, 1, 'app shell should render exactly one .weather-widget');
assert.equal(overlayMatches.length, 1, 'app shell should render exactly one #weather-overlay');
assert.match(
  html,
  /class="[^"]*\bweather-widget\b[^"]*"[^>]*\bhidden\b/,
  'weather widget should start hidden until weather.js has data or fallback copy to render'
);

assert.match(
  weatherJs,
  /function\s+revealWeatherWidget\s*\(\)\s*\{[\s\S]*?document\.querySelector\(['"]\.weather-widget['"]\)[\s\S]*?widget\.hidden\s*=\s*false;/,
  'weather.js should own a revealWeatherWidget helper that clears the hidden attribute'
);
assert.match(
  weatherJs,
  /export\s+function\s+updateWeatherUi\s*\(\)\s*\{[\s\S]*?revealWeatherWidget\(\);/,
  'updateWeatherUi should reveal the widget before rendering live weather state'
);
assert.match(
  weatherJs,
  /function\s+renderWeatherFallback\s*\(\)\s*\{[\s\S]*?revealWeatherWidget\(\);/,
  'renderWeatherFallback should reveal the widget for fallback weather state'
);

for (const marker of [
  '.weather-widget {',
  '.weather-widget[hidden]',
  '.weather-temp',
  '.weather-desc',
  '.weather-wind',
  '.weather-staleness',
  'body[data-panel-surface^="map-"] .weather-widget',
  'body[data-panel-surface="focus-search"] .weather-widget',
  'body[data-panel-surface="semantic-dive"] .weather-widget',
  '@media (max-width: 768px)'
]) {
  assert.ok(timeWeatherCss.includes(marker), `time_weather.css should contain canonical weather marker: ${marker}`);
}

assert.doesNotMatch(
  timeWeatherCss,
  /\.(?:view-toggle|trail-btn|focus-stage-journey-btn|btn-synthesize|suggestion-btn|share-toggle|close-icon|control-btn|panel-toggle|legend-toggle)\b/,
  'time_weather.css should not own generic app-control button or icon layout'
);

const forbiddenWeatherOwners = [
  'css/strands.css',
  'css/journey_active.css',
  'css/layout_base.css',
  'css/mobile_premium.css'
];

for (const relativePath of forbiddenWeatherOwners) {
  const css = read(relativePath);
  assert.doesNotMatch(
    css,
    /\.weather-(?:widget|temp|desc|wind|staleness|icon)\b|#weather-overlay\b/,
    `${relativePath} should not own weather widget visual or visibility rules`
  );
}

const animationsCss = read('css/animations.css');
assert.match(
  animationsCss,
  /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.weather-widget[\s\S]*?\}/,
  'animations.css may reference weather only as part of reduced-motion policy'
);
assert.doesNotMatch(
  animationsCss.replace(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/g, ''),
  /\.weather-(?:widget|temp|desc|wind|staleness|icon)\b|#weather-overlay\b/,
  'animations.css should not contain non-motion weather widget rules'
);

const mobileBaseCss = read('css/mobile_base.css');
assert.match(
  mobileBaseCss,
  /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.weather-widget[\s\S]*?\.weather-icon\s+\.weather-seed-base[\s\S]*?\}/,
  'mobile_base.css may reference weather only as part of reduced-motion policy'
);

console.log('weather-surface-ownership-contract passed');

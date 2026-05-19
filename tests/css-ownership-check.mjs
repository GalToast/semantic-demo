/**
 * css-ownership-check.mjs
 *
 * Fast structural guard for the shared-selector ownership contracts in
 * docs/css-architecture.md. This is intentionally baseline-aware: existing
 * shared selectors are allowed up to their current count, while new definitions
 * in unowned modules fail the check.
 */

import fs from 'node:fs';
import path from 'node:path';

const cssDir = path.resolve(process.cwd(), 'css');

const selectorBaselines = {
  '.close-icon': {
    'synthesis.css': 2,
    'time_weather.css': 1,
  },
  '.suggestion-btn': {
    'synthesis.css': 8,
    'search.css': 1,
    'time_weather.css': 1,
  },
  '.btn-synthesize': {
    'synthesis.css': 7,
    'journey_active.css': 2,
    'mobile_base.css': 1,
    'search.css': 1,
    'time_weather.css': 2,
  },
  '.focus-stage-route': {
    'journey_steps.css': 15,
    'journey_active.css': 7,
    'mobile_premium_focus.css': 2,
    'mobile_premium_surfaces.css': 3,
  },
  '.share-toggle': {
    'layout_base.css': 7,
    'journey_active.css': 3,
    'mobile_base.css': 3,
    'progressive_disclosure.css': 2,
    'strands.css': 4,
    'animations.css': 3,
    'time_weather.css': 2,
  },
  '.legend-toggle': {
    'layout_base.css': 10,
    'journey_active.css': 1,
    'strands.css': 2,
    'time_weather.css': 1,
  },
  '.help-toggle': {
    'layout_base.css': 4,
    'journey_active.css': 1,
    'mobile_base.css': 1,
    'strands.css': 2,
  },
};

const mobilePremiumLegacyStatePatterns = [
  'data-active-view="galaxy"',
  'data-active-view="map"',
  'data-graph-context',
  'data-map-context',
  'data-semantic-dive',
];

const globalLegacyPanelStatePatterns = [
  'data-graph-context',
  'data-map-context',
  'data-semantic-dive="active"',
];

function stripComments(cssText) {
  return cssText.replace(/\/\*[\s\S]*?\*\//g, '');
}

function selectorRulePreludes(cssText) {
  return stripComments(cssText)
    .split('{')
    .slice(0, -1)
    .map((chunk) => chunk.split('}').pop() || '')
    .flatMap((prelude) => prelude.split(',').map((selector) => selector.trim()))
    .filter(Boolean);
}

function countSelectorDefinitions(cssText, selector) {
  return selectorRulePreludes(cssText)
    .filter((prelude) => prelude.includes(selector))
    .length;
}

const violations = [];

if (!fs.existsSync(cssDir)) {
  console.error(`CSS directory not found: ${cssDir}`);
  process.exit(1);
}

const cssFiles = fs.readdirSync(cssDir)
  .filter((file) => file.endsWith('.css'))
  .sort();

for (const file of cssFiles) {
  const content = fs.readFileSync(path.join(cssDir, file), 'utf8');
  const uncommentedContent = stripComments(content);
  for (const pattern of globalLegacyPanelStatePatterns) {
    if (uncommentedContent.includes(pattern)) {
      violations.push(`${file} uses legacy panel state ${pattern}; panel ownership must use data-panel-surface.`);
    }
  }

  if (file.startsWith('mobile_premium')) {
    for (const pattern of mobilePremiumLegacyStatePatterns) {
      if (uncommentedContent.includes(pattern)) {
        violations.push(`${file} uses legacy state selector ${pattern}; mobile premium panel ownership must use data-panel-surface.`);
      }
    }
  }

  for (const [selector, allowedByFile] of Object.entries(selectorBaselines)) {
    const count = countSelectorDefinitions(content, selector);
    if (count === 0) continue;

    const allowedCount = allowedByFile[file] || 0;
    if (allowedCount === 0) {
      violations.push(`${file} now defines ${selector} ${count} time(s), but it is not an owner or documented modifier.`);
    } else if (count > allowedCount) {
      violations.push(`${file} defines ${selector} ${count} time(s); baseline allows ${allowedCount}.`);
    }
  }
}

if (violations.length) {
  console.error('CSS ownership contract violations:');
  for (const violation of violations) console.error(`  - ${violation}`);
  process.exit(1);
}

console.log('CSS ownership contract OK: no new shared-selector definitions beyond the documented baseline.');

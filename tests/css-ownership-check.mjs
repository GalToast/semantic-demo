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
    'controls.css': 1,
    'synthesis.css': 2,
  },
  '.suggestion-btn': {
    'controls.css': 2,
    'synthesis.css': 8,
    'search.css': 1,
  },
  '.btn-synthesize': {
    'controls.css': 3,
    'synthesis.css': 7,
    'journey_active.css': 2,
    'mobile_base.css': 1,
    'search.css': 1,
  },
  '.focus-stage-route': {
    'journey_steps.css': 14,
    'journey_active.css': 5,
    'mobile_premium_focus.css': 2,
    'mobile_premium_surfaces.css': 3,
  },
  '.focus-stage-card': {
    'animations.css': 3,
    'clusters.css': 4,
    'journey_active.css': 8,
    'journey_steps.css': 18,
    'mobile_base.css': 1,
    'mobile_premium_focus.css': 27,
    'progressive_disclosure.css': 1,
    'strands.css': 5,
  },
  '.share-toggle': {
    'controls.css': 3,
    'layout_base.css': 7,
    'journey_active.css': 3,
    'mobile_base.css': 3,
    'progressive_disclosure.css': 2,
    'strands.css': 7,
    'animations.css': 0,
    'mobile_premium_state.css': 2,
  },
  '.legend-toggle': {
    'controls.css': 1,
    'layout_base.css': 10,
    'journey_active.css': 1,
    'strands.css': 2,
    'mobile_premium_state.css': 2,
  },
  '.search-results.active': {
    'search.css': 3,
    'layout_base.css': 2,
    'journey_active.css': 1,
    'progressive_disclosure.css': 3,
    'strands.css': 8,
    'mobile_premium_chrome.css': 7,
    'mobile_premium_state.css': 6,
    'mobile_premium_surfaces.css': 1,
    'animations.css': 1,
  },
  '.help-toggle': {
    'layout_base.css': 4,
    'journey_active.css': 1,
    'mobile_base.css': 1,
    'strands.css': 2,
  },
  '.journey-compass-title': {
    'layout_base.css': 1,
    'journey_active.css': 14,
    'mobile_base.css': 0,
    'mobile_premium_focus.css': 2,
    'mobile_premium_surfaces.css': 9,
    'strands.css': 2,
    'mobile_premium_state.css': 1,
  },
  '.journey-compass-actions': {
    'journey_active.css': 15,
    'mobile_base.css': 2,
    'mobile_premium_focus.css': 3,
    'mobile_premium_surfaces.css': 7,
    'progressive_disclosure.css': 1,
    'strands.css': 6,
  },
  '.journey-compass-rail': {
    'layout_base.css': 1,
    'journey_active.css': 15,
    'mobile_base.css': 2,
    'mobile_premium_focus.css': 2,
    'mobile_premium_surfaces.css': 3,
    'strands.css': 2,
    'mobile_premium_state.css': 1,
  },
  '.journey-compass-action.primary': {
    'animations.css': 2,
    'journey_active.css': 4,
    'mobile_base.css': 4,
    'mobile_premium_focus.css': 2,
    'mobile_premium_surfaces.css': 4,
    'search.css': 4,
    'strands.css': 5,
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

const bannedSelectorImportantRules = [
  {
    file: 'search.css',
    selectorIncludes: [
      'data-panel-surface="focus-search"',
      '.search-results.active',
    ],
    label: 'focus-search search-results active',
  },
];

function stripComments(cssText) {
  return cssText.replace(/\/\*[\s\S]*?\*\//g, '');
}

function selectorRuleBlocks(cssText) {
  return stripComments(cssText)
    .split('}')
    .map((chunk) => {
      const braceIndex = chunk.lastIndexOf('{');
      if (braceIndex === -1) return null;
      return {
        prelude: chunk.slice(0, braceIndex).trim(),
        body: chunk.slice(braceIndex + 1).trim(),
      };
    })
    .filter(Boolean);
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
  const ruleBlocks = selectorRuleBlocks(content);
  for (const pattern of globalLegacyPanelStatePatterns) {
    if (uncommentedContent.includes(pattern)) {
      violations.push(`${file} uses legacy panel state ${pattern}; panel ownership must use data-panel-surface.`);
    }
  }

  for (const rule of bannedSelectorImportantRules) {
    if (file !== rule.file) continue;
    for (const block of ruleBlocks) {
      const matchesSelector = rule.selectorIncludes.every((fragment) => block.prelude.includes(fragment));
      if (matchesSelector && block.body.includes('!important')) {
        violations.push(`${file} uses !important in ${rule.label}; use state-scoped ownership instead.`);
      }
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

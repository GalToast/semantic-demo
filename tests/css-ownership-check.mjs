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

// The app shell loads the double-underscore mobile premium split directly.
// Keep this baseline aligned with vector-explorer-polished.html so selector
// counts describe the loaded cascade instead of the deleted collapsed file.
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
    'mobile_premium__focus-dive.css': 2,
    'mobile_premium__surfaces.css': 3,
  },
  '.focus-stage-card': {
    'animations.css': 3,
    'clusters.css': 4,
    'journey_active.css': 8,
    'journey_steps.css': 18,
    'mobile_base.css': 0,
    'mobile_premium__focus-dive.css': 28,
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
    'mobile_premium__chrome.css': 5,
    'mobile_premium__idle.css': 1,
  },
  '.legend-toggle': {
    'controls.css': 1,
    'layout_base.css': 10,
    'journey_active.css': 1,
    'strands.css': 2,
    'mobile_base.css': 1,
    'mobile_premium__chrome.css': 5,
    'mobile_premium__state.css': 2,
  },
  '.search-results.active': {
    'search.css': 6,
    'layout_base.css': 0,
    'journey_active.css': 1,
    'progressive_disclosure.css': 3,
    'strands.css': 1,
    'mobile_premium__chrome.css': 10,
    'mobile_premium__state.css': 10,
    'mobile_premium__narrow.css': 0,
    'mobile_premium__surfaces.css': 1,
    'animations.css': 1,
  },
  '.help-toggle': {
    'layout_base.css': 4,
    'journey_active.css': 1,
    'mobile_base.css': 1,
    'mobile_premium__chrome.css': 4,
    'strands.css': 2,
  },
  '.journey-compass-title': {
    'layout_base.css': 1,
    'journey_active.css': 14,
    'mobile_base.css': 0,
    'mobile_premium__focus-dive.css': 5,
    'mobile_premium__state.css': 1,
    'mobile_premium__surfaces.css': 4,
    'strands.css': 2,
  },
  '.journey-compass-actions': {
    'journey_active.css': 15,
    'mobile_premium__chrome.css': 1,
    'mobile_premium__focus-dive.css': 4,
    'mobile_premium__narrow.css': 1,
    'mobile_premium__surfaces.css': 7,
    'progressive_disclosure.css': 1,
    'strands.css': 6,
  },
  '.journey-compass-rail': {
    'layout_base.css': 1,
    'journey_active.css': 15,
    'mobile_premium__focus-dive.css': 4,
    'mobile_premium__narrow.css': 12,
    'mobile_premium__state.css': 1,
    'mobile_premium__surfaces.css': 1,
    'strands.css': 2,
  },
  '.journey-compass-action.primary': {
    'animations.css': 2,
    'journey_active.css': 4,
    'mobile_base.css': 4,
    'mobile_premium__chrome.css': 1,
    'mobile_premium__focus-dive.css': 4,
    'mobile_premium__surfaces.css': 4,
    'search.css': 0,
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

const forbiddenSelectorFragments = [
  {
    file: 'strands.css',
    fragment: "body[data-panel-surface='search'] .info-panel {\n        max-height: min(23vh, 178px);",
    label: 'mobile search info-panel geometry belongs to mobile_premium__state.css, not strands.css',
  },
  {
    file: 'strands.css',
    fragment: "body[data-panel-surface='search'] .info-content {\n        max-height: calc(min(23vh, 178px) - 10px);",
    label: 'mobile search info-content geometry belongs to mobile_premium__state.css, not strands.css',
  },
  {
    file: 'strands.css',
    fragment: "body[data-panel-surface='search'] .info-panel,\n    body[data-panel-surface='focus-search'] .info-panel {\n        opacity: 0.97;",
    label: 'mobile search/focus-search info-panel opacity belongs to mobile_premium__state.css, not strands.css',
  },
  {
    file: 'strands.css',
    fragment: "body[data-panel-surface='search'] .info-content,\n    body[data-panel-surface='focus-search'] .info-content {\n        max-height: calc(min(54vh, 456px) - 42px);",
    label: 'mobile search/focus-search info-content sizing belongs to mobile_premium__state.css, not strands.css',
  },
  {
    file: 'strands.css',
    fragment: "body[data-panel-surface='focus'] .info-content,\n    body[data-panel-surface='semantic-dive'] .info-content {\n        max-height: min(15vh, 116px);",
    label: 'dead early focus/semantic info-content block is overridden later in strands.css',
  },
  {
    file: 'strands.css',
    fragment: 'data-panel-surface="focus"]:has(.search-container.has-query) .info-content',
    label: 'redundant focus info-content :has(.search-container.has-query) selector',
  },
  {
    file: 'strands.css',
    fragment: 'data-panel-surface="focus-search"]:has(.search-container.has-query) .info-content',
    label: 'redundant focus-search info-content :has(.search-container.has-query) selector',
  },
  {
    file: 'strands.css',
    fragment: 'data-panel-surface="semantic-dive"]:has(.search-container.has-query) .info-content',
    label: 'redundant semantic-dive info-content :has(.search-container.has-query) selector',
  },
  {
    file: 'layout_base.css',
    fragment: 'data-panel-surface="search"] .search-results.active',
    label: 'mobile search results belong to search.css, not layout_base.css',
  },
  {
    file: 'layout_base.css',
    fragment: 'data-panel-surface="search"] .search-result-item',
    label: 'mobile search result rows belong to search.css, not layout_base.css',
  },
  {
    file: 'layout_base.css',
    fragment: 'data-mobile-route-peek="active"][data-panel-surface]:not([data-panel-surface^="map-"]) .search-result-item',
    label: 'route-peek search result rows belong to search.css, not layout_base.css',
  },
];

const mobileBaseJourneyCompassLayoutProperties = [
  'top:',
  'left:',
  'right:',
  'bottom:',
  'width:',
  'min-width:',
  'max-width:',
  'height:',
  'min-height:',
  'max-height:',
  'display:',
  'grid-template',
  'grid-column',
  'flex:',
  'gap:',
  'padding:',
  'margin:',
  'border-radius:',
  'transform:',
  'overflow',
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

function hasDeclaration(body) {
  return /[a-z-]+\s*:/.test(body);
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

  for (const block of ruleBlocks) {
    if (!hasDeclaration(block.body)) {
      violations.push(`${file} has an empty/comment-only CSS rule for "${block.prelude}". Remove the dead selector or add a real declaration.`);
    }
  }

  if (file === 'mobile_base.css') {
    for (const block of ruleBlocks) {
      if (!block.prelude.includes('.journey-compass')) continue;
      const lowerBody = block.body.toLowerCase();
      const hasLayoutProperty = mobileBaseJourneyCompassLayoutProperties.some((property) => lowerBody.includes(property));
      if (hasLayoutProperty) {
        violations.push('mobile_base.css defines journey-compass layout; mobile journey-compass layout belongs to css/mobile_premium.css.');
      }
    }
  }

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

  for (const rule of forbiddenSelectorFragments) {
    if (file === rule.file && uncommentedContent.includes(rule.fragment)) {
      violations.push(`${file} reintroduced ${rule.label}; use the plain data-panel-surface owner instead.`);
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

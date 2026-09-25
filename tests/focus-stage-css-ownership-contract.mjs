/**
 * focus-stage-css-ownership-contract.mjs
 *
 * Static contract test for focus-stage and journey-compass CSS ownership.
 * Forward-looking only: catches NEW duplicate ownership regressions and
 * forbidden broad ownership before they reach visual QA.
 *
 * Does NOT re-litigate the existing baseline — accepts the current messy
 * distribution as established, but flags any NEW definition added to a
 * non-canonical file or a new duplicate block between files.
 *
 * Canonical ownership model (from wave17 audit):
 *
 * .focus-stage-card
 *   clusters.css           — desktop base glass panel
 *   journey_active.css      — desktop focus/focus-search overrides
 *   mobile_premium.css       — collapsed mobile is-active premium overrides
 *   animations.css          — short-landscape overrides only
 *   journey_steps.css       — transition-phase variants only
 *   strands.css             — galaxy/legacy state variants only
 *   progressive_disclosure.css — panel-overlay variants
 *   mobile_base.css         — no focus-stage-card ownership
 *
 * .journey-compass (base unconditional)
 *   journey_active.css      — base fixed-position, z-index:95, grid
 *   layout_base.css         — scrollbar styling only
 *
 * .journey-compass (mobile is-active premium)
 *   mobile_premium.css       — collapsed mobile is-active override
 *   mobile_base.css         — generic mobile base
 *
 * .journey-compass (field-node compact)
 *   mobile_premium.css       — canonical mobile owner
 *
 * .focus-stage-inside-controls
 *   mobile_premium.css       — display:grid (semantic-dive canonical)
 *   clusters.css             — display:none (non-dive default only)
 *
 * FORBIDDEN (always):
 *   - new files owning .journey-compass or .focus-stage-card geometry without
 *     being added to the current owner registry
 *   - !important in any focus-stage or journey-compass block
 *
 * Usage:
 *   node tests/focus-stage-css-ownership-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function stripComments(cssText) {
  return cssText.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Parse CSS into array of { prelude, body } rule blocks.
 */
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

/**
 * Extract all selector preludes (split by comma, trim whitespace).
 */
function selectorPreludes(cssText) {
  return stripComments(cssText)
    .split('{')
    .slice(0, -1)
    .flatMap((chunk) => chunk.split(',').map((s) => s.trim()))
    .filter(Boolean);
}

/**
 * Return true if selector prelude contains the given fragment string.
 */
function preludeContains(prelude, fragment) {
  return prelude.includes(fragment);
}

/**
 * Return all rule blocks in file that match ALL fragments in selectorSpec.
 */
function matchingBlocks(cssText, selectorSpec) {
  return selectorRuleBlocks(cssText).filter(
    (block) => selectorSpec.every((frag) => preludeContains(block.prelude, frag))
  );
}

/**
 * Return true if any block in cssText matches selectorSpec and contains !important.
 */
function hasImportant(cssText, selectorSpec) {
  return selectorRuleBlocks(cssText).some(
    (block) =>
      selectorSpec.every((frag) => preludeContains(block.prelude, frag)) &&
      block.body.includes('!important')
  );
}

// ─── Transient-data-semantic-dive guard ──────────────────────────────────
// data-semantic-dive="transitioning" is a time-boxed transition flag.
// It may own transient animation overrides (opacity, transform, pointer-events,
// backdrop-filter) but NOT stable geometry (width, height, position, margin,
// padding, border, display, z-index) on .focus-stage-card, .focus-stage,
// .focus-stage-kicker, .focus-stage-name, .journey-compass, or .focus-stage-route.
//
// Known compliant use (animations.css):
//   html body[data-active-view="galaxy"][data-semantic-dive="transitioning"] .focus-stage-card { opacity: 1; transform: none; pointer-events: auto; }
// This is transient reset during the galaxy+transitioning animation window — OK.
// Any block targeting a stable focus-stage geometry state under transitioning is FORBIDDEN.
const TRANSIENT_TRANSITIONING_SELECTORS = [
  '.focus-stage-card',
  '.focus-stage',
  '.focus-stage-kicker',
  '.focus-stage-name',
  '.journey-compass',
  '.focus-stage-route',
];

/**
 * Check that a block's body does not contain stable geometry properties.
 * Transient animation overrides (opacity, transform, pointer-events, backdrop-filter,
 * transition, animation) are allowed; stable layout properties are not.
 */
const STABLE_GEOMETRY_RE = /\b(?:width|height|position|top|left|right|bottom|margin|padding|border|display|z-index|flex|grid|float|clear|overflow)\s*:/;

function hasStableGeometry(block) {
  return STABLE_GEOMETRY_RE.test(block.body);
}

// Files that must not gain new ownership in certain geometry directly.
// These are intentionally baseline-tolerant: current counts are accepted,
// but any added selector in these non-canonical files fails the contract.
const FORWARD_ONLY_LIMITS = [
  {
    file: 'strands.css',
    limits: {
      '.journey-compass': 40,
      '.focus-stage-card': 5,
    },
    message: 'strands.css must not gain new journey-compass or focus-stage-card geometry',
  },
];

const MOBILE_PREMIUM_SPLIT = [
  'mobile_premium__focus-dive.css',
  'mobile_premium__chrome.css',
  'mobile_premium__state.css',
  'mobile_premium__idle.css',
  'mobile_premium__map.css',
  'mobile_premium__surfaces.css',
  'mobile_premium__narrow.css',
];
function readMobilePremium() {
  return MOBILE_PREMIUM_SPLIT.map((f) => read(`css/${f}`)).join('\n');
}

const REGISTERED_GEOMETRY_OWNERS = {
  '.focus-stage-card': new Set([
    'animations.css',
    'clusters.css',
    'journey_active.css',
    'journey_steps.css',
    ...MOBILE_PREMIUM_SPLIT,
    'progressive_disclosure.css',
    'strands.css',
  ]),
  '.journey-compass': new Set([
    'animations.css',
    'clusters.css',
    'journey_active.css',
    'journey_steps.css',
    'layout_base.css',
    'mobile_base.css',
    ...MOBILE_PREMIUM_SPLIT,
    'progressive_disclosure.css',
    'search.css',
    'strands.css',
  ]),
};

const FOCUS_ACTION_PRIMITIVE_GUARD = {
  canonicalFile: 'mobile_premium split (focus-dive.css)',
  ownerMarker: 'Focus stage action/button primitives',
};

const FOCUS_COMPASS_STATE_REFINEMENT_GUARD = {
  canonicalFile: 'mobile_premium split (focus-dive.css)',
  ownerMarker: 'Focus/dive journey compass state refinements',
};

const SEMANTIC_DIVE_INSIDE_HUD_GUARD = {
  canonicalFile: 'mobile_premium split (focus-dive.css)',
  ownerMarker: 'Semantic-dive inside HUD density owner',
};

const MOBILE_COMPASS_TRANSITION_GUARD = {
  file: 'mobile_premium split (focus-dive.css)',
  selectors: ['.journey-compass', '.journey-compass-action'],
};

// ─── Run checks ────────────────────────────────────────────────────────────

const cssDir = path.resolve(root, 'css');
const cssFiles = fs.readdirSync(cssDir).filter((f) => f.endsWith('.css')).sort();

const violations = [];
const warnings = [];

const focusPrimitiveOwner = readMobilePremium();
if (!focusPrimitiveOwner.includes('Focus stage action/button primitives')) {
  violations.push(`${FOCUS_ACTION_PRIMITIVE_GUARD.canonicalFile} must document and own focus-stage action/button primitives`);
}

const focusCompassOwner = readMobilePremium();
if (!focusCompassOwner.includes(FOCUS_COMPASS_STATE_REFINEMENT_GUARD.ownerMarker)) {
  violations.push(
    `${FOCUS_COMPASS_STATE_REFINEMENT_GUARD.canonicalFile} must document and own focus/dive journey-compass state refinements`
  );
}

const semanticDiveInsideHudOwner = readMobilePremium();
if (!semanticDiveInsideHudOwner.includes(SEMANTIC_DIVE_INSIDE_HUD_GUARD.ownerMarker)) {
  violations.push(
    `${SEMANTIC_DIVE_INSIDE_HUD_GUARD.canonicalFile} must document and own semantic-dive inside HUD density`
  );
}

const mobileCompassTransitionOwner = readMobilePremium();
for (const selector of MOBILE_COMPASS_TRANSITION_GUARD.selectors) {
  const transitionAllBlocks = matchingBlocks(mobileCompassTransitionOwner, [selector])
    .filter((block) => /\btransition\s*:\s*all\b/i.test(block.body));
  if (transitionAllBlocks.length) {
    violations.push(
      `${MOBILE_COMPASS_TRANSITION_GUARD.file} must not use transition: all on ${selector}; ` +
      'mobile compass transitions must name paint/compositor properties so route geometry does not animate.'
    );
  }
}

for (const file of cssFiles) {
  const content = read(`css/${file}`);
  const preludeLines = selectorPreludes(content);

  // 1. Check !important in any focus/journey blocks.
  const importantSelectors = [
    '.focus-stage-card',
    '.journey-compass',
    '.focus-stage-journey.active',
    '.focus-stage-inside-controls',
    '.focus-stage-inside-status',
  ];
  for (const sel of importantSelectors) {
    if (hasImportant(content, [sel])) {
      violations.push(`${file} uses !important in ${sel} block — use specificity or cascade instead`);
    }
  }

  // 2. Check forward-only baseline limits.
  for (const limit of FORWARD_ONLY_LIMITS) {
    if (file !== limit.file) continue;
    for (const [selector, maxCount] of Object.entries(limit.limits)) {
      const count = preludeLines.filter((p) => p.includes(selector)).length;
      if (count > maxCount) {
        violations.push(`${file} defines ${selector} ${count} time(s), baseline limit is ${maxCount} — ${limit.message}`);
      }
    }
  }

  // 3. Check new files do not start owning stable focus-card/compass geometry.
  for (const [selector, registeredOwners] of Object.entries(REGISTERED_GEOMETRY_OWNERS)) {
    if (registeredOwners.has(file)) continue;
    const geometryBlocks = matchingBlocks(content, [selector]).filter(hasStableGeometry);
    if (geometryBlocks.length) {
      violations.push(
        `${file} adds stable geometry for ${selector} without registration in focus-stage-css-ownership-contract`
      );
    }
  }

  // 4. Check transient data-semantic-dive="transitioning" does not own stable geometry.
  // Only transient animation overrides (opacity, transform, pointer-events) are allowed.
  for (const sel of TRANSIENT_TRANSITIONING_SELECTORS) {
    const blocks = selectorRuleBlocks(content).filter(
      (block) =>
        block.prelude.includes('data-semantic-dive="transitioning"') &&
        block.prelude.includes(sel)
    );
    for (const block of blocks) {
      if (hasStableGeometry(block)) {
        const snippet = block.prelude.slice(0, 60);
        violations.push(
          `${file} uses data-semantic-dive="transitioning" with stable geometry on ${sel} — ` +
          `transient flag may not own position/size/layout. prelude: "${snippet}..."`
        );
      }
    }
  }
}

// ─── Report ─────────────────────────────────────────────────────────────────

if (violations.length) {
  console.error('focus-stage-css-ownership-contract VIOLATIONS:');
  for (const v of violations) {
    console.error(`  ✗ ${v}`);
  }
  console.error(`\nTotal: ${violations.length} violation(s)`);
  process.exit(1);
}

console.log('focus-stage-css-ownership-contract OK');
console.log('  - !important enforcement: passed');
console.log('  - forbidden geometry ownership: passed');
console.log('  - transient transitioning-geometry guard: passed');
console.log('  - proven canonical-owner checks: passed');

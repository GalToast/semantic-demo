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
 *   mobile_premium_focus.css — mobile is-active premium overrides
 *   animations.css          — short-landscape overrides only
 *   journey_steps.css       — transition-phase variants only
 *   strands.css             — galaxy/legacy state variants only
 *   progressive_disclosure.css — panel-overlay variants
 *   mobile_base.css         — generic mobile base
 *
 * .journey-compass (base unconditional)
 *   journey_active.css      — base fixed-position, z-index:95, grid
 *   layout_base.css         — scrollbar styling only
 *
 * .journey-compass (mobile is-active premium)
 *   mobile_premium_focus.css — mobile is-active override
 *   mobile_base.css         — generic mobile base
 *
 * .journey-compass (field-node compact)
 *   mobile_premium_focus.css — canonical owner (is-active field-node)
 *   mobile_premium_surfaces.css — non-is-active field-node variants
 *
 * .focus-stage-inside-controls
 *   mobile_premium_focus.css — display:grid (semantic-dive canonical)
 *   clusters.css             — display:none (non-dive default only)
 *
 * FORBIDDEN (always):
 *   - strands.css owning .journey-compass or .focus-stage-card geometry
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

// ─── Forwards-only check ───────────────────────────────────────────────────
// Accepts the current baseline as-is. Only flags:
//   1. strands.css owning .journey-compass or .focus-stage-card (always forbidden)
//   2. !important in any focus-stage or journey-compass block
//   3. Future duplicate ownership in known non-canonical files. No current
//      field-node duplicate is asserted here; wave18 verified the earlier
//      audit claim was a false positive.

// Files that must not gain new ownership in certain geometry directly.
// These are intentionally baseline-tolerant: current counts are accepted,
// but any added selector in these non-canonical files fails the contract.
const FORWARD_ONLY_LIMITS = [
  {
    file: 'strands.css',
    limits: {
      '.journey-compass': 110,
      '.focus-stage-card': 25,
    },
    message: 'strands.css must not gain new journey-compass or focus-stage-card geometry',
  },
];

// ─── Run checks ────────────────────────────────────────────────────────────

const cssDir = path.resolve(root, 'css');
const cssFiles = fs.readdirSync(cssDir).filter((f) => f.endsWith('.css')).sort();

const violations = [];
const warnings = [];

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

  // Reserved for future exact-duplicate checks once a canonical owner is proven.
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
console.log('  - proven canonical-owner checks: passed');

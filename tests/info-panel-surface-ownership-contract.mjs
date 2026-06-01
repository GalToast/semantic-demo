/**
 * info-panel-surface-ownership-contract.mjs
 *
 * Source-only ownership contract for the legacy #info-panel host.
 *
 * Ownership rules:
 *   1. #info-panel-content remains the host, not the owner of every child
 *      surface.
 *   2. Each major child surface declares a data-surface-owner boundary.
 *   3. Legacy IDs stay stable for existing renderers and interactions.
 *   4. Surface wrappers must not introduce layout by default; CSS keeps them
 *      display: contents until a surface-specific owner claims geometry.
 *
 * Usage:
 *   node tests/info-panel-surface-ownership-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const HTML_PATH = path.join(ROOT, 'vector-explorer-polished.html');
const LAYOUT_CSS_PATH = path.join(ROOT, 'css/layout_base.css');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function countMatches(src, pattern) {
  return [...src.matchAll(pattern)].length;
}

function getTagByOwner(src, owner) {
  const tagPattern = new RegExp(
    `<(?<tag>section|div)\\b(?=[^>]*\\bclass="[^"]*\\binfo-panel-surface\\b[^"]*")(?=[^>]*\\bdata-surface-owner="${owner}")[^>]*>`,
    'm'
  );
  const match = tagPattern.exec(src);
  assert(match, `#info-panel-content must include info-panel surface owner "${owner}"`);
  return match[0];
}

function assertOwnerContains(src, owner, requiredMarkers) {
  const ownerTag = getTagByOwner(src, owner);
  const startIndex = src.indexOf(ownerTag);
  const nextSurfaceIndex = src.indexOf('class="info-panel-surface', startIndex + ownerTag.length);
  const endIndex = nextSurfaceIndex === -1 ? src.indexOf('</aside>', startIndex) : nextSurfaceIndex;
  const ownerHtml = src.slice(startIndex, endIndex);

  for (const marker of requiredMarkers) {
    assert(ownerHtml.includes(marker), `${owner} surface must contain ${marker}`);
  }
}

function assertIdCount(src, id, expected = 1) {
  assert(
    countMatches(src, new RegExp(`\\bid="${id}"`, 'g')) === expected,
    `#${id} must appear exactly ${expected} time(s)`
  );
}

function run() {
  console.log('=================================================================');
  console.log('info-panel-surface-ownership-contract.mjs');
  console.log('Contract test: #info-panel child surface ownership');
  console.log('=================================================================');

  const htmlSrc = read(HTML_PATH);
  const cssSrc = read(LAYOUT_CSS_PATH);

  console.log('\n[TEST] legacy singleton IDs stay unique');
  for (const id of [
    'info-panel',
    'info-panel-content',
    'search-input',
    'search-results',
    'mode-grid',
    'selected-card',
    'selected-map-summary',
    'selected-details',
    'cluster-section',
    'filters-section',
    'focus-stage',
    'map-trail-strip',
  ]) {
    assertIdCount(htmlSrc, id);
  }
  console.log('  OK - high-risk surface IDs remain singleton');

  console.log('\n[TEST] info panel declares explicit child surface owners');
  const owners = [
    'idle-overview',
    'search-results',
    'selected-business',
    'discovery-filters',
  ];

  assert(
    countMatches(htmlSrc, /\bclass="[^"]*\binfo-panel-surface\b[^"]*"/g) === owners.length,
    '#info-panel-content must expose exactly four owned child surfaces'
  );

  for (const owner of owners) {
    const tag = getTagByOwner(htmlSrc, owner);
    assert(
      /\bdata-ownership-lane="[^"]*\bsurface\b[^"]*"/.test(tag),
      `${owner} surface must declare the surface ownership lane`
    );
  }
  console.log('  OK - child surfaces have declared owners and lanes');

  console.log('\n[TEST] each owner contains its own legacy render targets');
  assertOwnerContains(htmlSrc, 'idle-overview', [
    'class="stats-row"',
    'id="demo-starters"',
    'id="btn-launch"',
  ]);
  assertOwnerContains(htmlSrc, 'search-results', [
    'class="search-container"',
    'id="search-input"',
    'id="search-results"',
    'id="mode-grid"',
  ]);
  assertOwnerContains(htmlSrc, 'selected-business', [
    'id="selected-card"',
    'id="selected-details"',
    'id="selected-map-summary"',
  ]);
  assertOwnerContains(htmlSrc, 'discovery-filters', [
    'id="cluster-section"',
    'id="filters-section"',
  ]);
  console.log('  OK - render targets sit inside the expected owner boundaries');

  console.log('\n[TEST] wrappers do not own layout by default');
  assert(
    /\.info-panel-surface\s*\{\s*display:\s*contents;\s*\}/.test(cssSrc),
    'layout_base.css must keep .info-panel-surface as display: contents by default'
  );
  console.log('  OK - wrappers are structural unless a surface owner opts into layout');

  console.log('\n=================================================================');
  console.log('ALL TESTS PASSED');
  console.log('=================================================================');
}

run();

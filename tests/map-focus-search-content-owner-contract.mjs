/**
 * map-focus-search-content-owner-contract.mjs
 *
 * Source-only ownership contract for the mobile map-focus-search selected-card
 * content variant.
 *
 * Ownership rules:
 *   1. HTML exposes a dedicated #selected-map-summary subtree.
 *   2. focus-stage-renderer.js owns the map-summary variant decision and
 *      writes data-content-variant/data-content-owner on #selected-card.
 *   3. The full #selected-details payload is hidden by the renderer for
 *      map-focus-search, not trimmed after the fact by late CSS.
 *   4. #selected-map-summary remains read-only; map actions stay owned by the
 *      map trail strip.
 *   5. composition-state.js publishes composition updates after panelSurface changes.
 *   6. The mobile premium split MAP SUMMARY section styles the dedicated
 *      summary nodes.
 *   7. Mobile premium CSS must not reintroduce map-focus-search styling for
 *      old selected-card detail internals.
 *
 * Usage:
 *   node tests/map-focus-search-content-owner-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { MOBILE_PREMIUM_PATHS, MOBILE_PREMIUM_SPLIT } from './_fixtures/mobile-premium-split.mjs';

const ROOT = path.resolve(process.cwd());
const HTML_PATH = path.join(ROOT, 'vector-explorer-polished.html');
const FOCUS_RENDERER_PATH = path.join(ROOT, 'js/modules/focus-stage-renderer.js');
const UI_RENDERERS_PATH = path.join(ROOT, 'js/modules/ui-renderers.js');
const JOURNEY_SELECTED_CARD_PATH = path.join(ROOT, 'js/modules/journey-selected-card.js');
const JOURNEY_FOCUS_UI_PATH = path.join(ROOT, 'js/modules/journey-focus-ui.js');
const JOURNEY_COMPASS_PATH = path.join(ROOT, 'js/modules/journey-compass-controller.js');
const JOURNEY_ROUTE_TRACE_PATH = path.join(ROOT, 'js/modules/journey-route-trace.js');
const LIFECYCLE_PATH = path.join(ROOT, 'js/modules/lifecycle.js');
const COMPOSITION_STATE_PATH = path.join(ROOT, 'js/modules/composition-state.js');
const EVENT_BUS_PATH = path.join(ROOT, 'js/modules/event-bus.js');
const MAP_STATE_PATH = path.join(ROOT, 'js/modules/map-state.js');
const SEMANTIC_DIVE_UI_PATH = path.join(ROOT, 'js/modules/semantic-dive-ui.js');
const MOBILE_PREMIUM_PATH = MOBILE_PREMIUM_PATHS;
const PROGRESSIVE_DISCLOSURE_PATH = path.join(ROOT, 'css/progressive_disclosure.css');

function read(filePath) {
  if (Array.isArray(filePath)) return filePath.map(read).join('\n');
  return fs.readFileSync(filePath, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function testHtmlSummarySubtree() {
  console.log('\n[TEST] HTML exposes dedicated map summary subtree');
  const src = read(HTML_PATH);

  for (const id of [
    'selected-map-summary',
    'selected-map-summary-kicker',
    'selected-map-summary-name',
    'selected-map-summary-what',
    'selected-map-summary-role',
    'selected-map-summary-match',
    'selected-map-summary-match-copy',
  ]) {
    assert(src.includes(`id="${id}"`), `vector-explorer-polished.html must include #${id}`);
  }

  assert(
    /id="selected-map-summary"[^>]*hidden[^>]*aria-hidden="true"/.test(src),
    '#selected-map-summary must start hidden until the renderer claims it'
  );

  console.log('  OK - map summary subtree exists and starts hidden');
}

function testRendererOwnsVariantDecision() {
  console.log('\n[TEST] focus-stage-renderer owns map-summary content variant');
  const src = read(FOCUS_RENDERER_PATH);

  assert(
    /export\s+function\s+syncSelectedCardContentVariant\s*\(/.test(src),
    'focus-stage-renderer.js must export syncSelectedCardContentVariant()'
  );
  assert(
    /state\.currentView\s*===\s*['"]map['"]/.test(src) &&
      (/surface\s*===\s*['"]map-focus-search['"]/.test(src) ||
        /isMapSummarySurface\s*\(\s*\)/.test(src)),
    'syncSelectedCardContentVariant() must gate map summary on currentView=map and panelSurface=map-focus-search (literal or helper)'
  );
  assert(
    /cardEl\.dataset\.contentVariant\s*=[\s\S]{0,180}isFocusStageOwner\s*\?\s*['"]focus-stage['"][\s\S]{0,120}isMapSummary\s*\?\s*['"]map-summary['"]/.test(src),
    '#selected-card must declare data-content-variant="focus-stage" before the map-summary fallback'
  );
  assert(
    /cardEl\.dataset\.contentOwner\s*=[\s\S]{0,180}isFocusStageOwner\s*\?\s*['"]focus-stage['"][\s\S]{0,120}isMapSummary\s*\?\s*['"]selected-map-summary['"]/.test(src),
    '#selected-card must declare data-content-owner="focus-stage" before the selected-map-summary fallback'
  );
  assert(
    /function\s+focusStageOwnsSelectedContent\s*\(/.test(src) &&
      src.includes("'focus'") &&
      src.includes("'focus-search'") &&
      src.includes("'semantic-dive'") &&
      /const\s+isFocusStageOwner\s*=[\s\S]{0,120}focusStageOwnsSelectedContent\s*\(\s*surface\s*\)/.test(src),
    'renderer must treat focus, focus-search, and semantic-dive as focus-stage selected-content owners'
  );
  assert(
    /if\s*\(\s*isFocusStageOwner\s*\)\s*\{[\s\S]{0,260}setSurfaceHidden\s*\(\s*detailsEl\s*,\s*true\s*\)/.test(src),
    'renderer must hide #selected-details when the focus stage owns selected content'
  );
  assert(
    /setSurfaceHidden\s*\(\s*detailsEl\s*,\s*isMapSummary\s*\)/.test(src),
    'renderer must hide #selected-details when map summary owns content'
  );
  assert(
    /setSurfaceHidden\s*\(\s*summaryEl\s*,\s*!isMapSummary\s*\)/.test(src),
    'renderer must reveal #selected-map-summary only for map summary state'
  );
  assert(
    /el\.hidden\s*=\s*true[\s\S]{0,120}el\.setAttribute\s*\(\s*['"]aria-hidden['"]\s*,\s*['"]true['"]\s*\)[\s\S]{0,180}el\.hidden\s*=\s*false[\s\S]{0,120}el\.setAttribute\s*\(\s*['"]aria-hidden['"]\s*,\s*['"]false['"]\s*\)/.test(src),
    'setSurfaceHidden() must own hidden state and aria-hidden without inline display writes'
  );
  assert(
    !/function\s+setSurfaceHidden\s*\([^)]*\)\s*\{[\s\S]*?style\.display[\s\S]*?\n\}/.test(src),
    'setSurfaceHidden() must not write inline display; the hidden attribute and CSS own layout visibility'
  );
  assert(
    !/selected-map-summary[\s\S]{0,240}\.innerHTML\s*=/.test(src),
    'renderer must not inject interactive or untrusted HTML into #selected-map-summary'
  );
  assert(
    /selected-map-summary-name[\s\S]*nameEl\.textContent/.test(src) &&
      /selected-map-summary-what[\s\S]*whatEl\.textContent/.test(src) &&
      /selected-map-summary-match-copy[\s\S]*matchCopyEl\.textContent/.test(src),
    'renderer must populate map summary copy via textContent'
  );

  console.log('  OK - renderer owns the map-summary variant and hides full details');
}

function testSummaryIsReadOnly() {
  console.log('\n[TEST] map summary stays read-only; strip owns map actions');
  const htmlSrc = read(HTML_PATH);
  const summaryMatch = htmlSrc.match(/<div class="selected-map-summary"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
  assert(summaryMatch, 'must be able to inspect #selected-map-summary subtree');
  const summaryHtml = summaryMatch[0];

  assert(
    !/<button\b/i.test(summaryHtml) && !/<a\b/i.test(summaryHtml) && !/role="button"/i.test(summaryHtml),
    '#selected-map-summary must not contain buttons, links, or button roles'
  );

  const rendererSrc = read(FOCUS_RENDERER_PATH);
  assert(
    !/selected-map-summary[\s\S]{0,360}addEventListener\s*\(/.test(rendererSrc),
    'focus-stage-renderer.js must not bind interactions inside #selected-map-summary'
  );

  console.log('  OK - map summary is read-only and interaction ownership stays with map trail strip');
}

function testRenderPathCallsVariantSync() {
  console.log('\n[TEST] render and composition paths call content variant sync');
  const uiSrc = read(UI_RENDERERS_PATH);
  const selectedSrc = read(JOURNEY_SELECTED_CARD_PATH);
  const lifecycleSrc = read(LIFECYCLE_PATH);
  const compositionStateSrc = read(COMPOSITION_STATE_PATH);
  const eventBusSrc = read(EVENT_BUS_PATH);

  assert(
    /export\s+function\s+syncSelectedCardContentVariant\s*\(/.test(uiSrc),
    'ui-renderers.js must re-export syncSelectedCardContentVariant()'
  );
  assert(
    /syncSelectedCardContentVariant\s*,/.test(selectedSrc) &&
      /syncSelectedCardContentVariant\s*\(\s*point\s*\)/.test(selectedSrc),
    'journey-selected-card.js must sync the content variant on empty and populated renders'
  );
  assert(
    /cardWasEmpty\s*&&\s*!\(?mapSummarySurface\)?/.test(selectedSrc) ||
      /cardWasEmpty\s*&&\s*!\(?isMapSummarySurface\)?/.test(selectedSrc),
    'journey-selected-card.js must not run the selected-card fade when map summary owns the card'
  );

  assert(
    /COMPOSITION_UPDATED:\s*['"]COMPOSITION_UPDATED['"]/.test(eventBusSrc),
    'event-bus.js must expose COMPOSITION_UPDATED for composition state fanout'
  );
  assert(
    /applyCompositionState\s*\(\s*{\s*state\s*,\s*root:\s*document\.body\s*}\s*\)/.test(lifecycleSrc),
    'lifecycle.js must delegate panelSurface composition through applyCompositionState()'
  );
  assert(
    /function\s+syncSharedCompositionUi\s*\([^)]*\)\s*{[\s\S]*publish\s*\(\s*EVENTS\.COMPOSITION_UPDATED\s*\)/.test(compositionStateSrc) &&
      /export\s+function\s+applyCompositionState\s*\([^)]*\)\s*{[\s\S]*syncSharedCompositionUi\s*\(\s*\)/.test(compositionStateSrc),
    'composition-state.js must publish COMPOSITION_UPDATED after panelSurface changes'
  );

  const compositionSubscribers = [
    [JOURNEY_SELECTED_CARD_PATH, 'journey-selected-card'],
    [JOURNEY_FOCUS_UI_PATH, 'focus-neighbor-rail'],
    [JOURNEY_COMPASS_PATH, 'journey-compass'],
    [JOURNEY_ROUTE_TRACE_PATH, 'route-trace'],
    [MAP_STATE_PATH, 'map-state'],
    [SEMANTIC_DIVE_UI_PATH, 'semantic-dive-ui'],
  ];

  for (const [filePath, keyPrefix] of compositionSubscribers) {
    const src = read(filePath);
    assert(
      new RegExp(`subscribeKeyed\\s*\\(\\s*['"]${keyPrefix}:composition-updated['"]\\s*,\\s*EVENTS\\.COMPOSITION_UPDATED`).test(src),
      `${path.basename(filePath)} must subscribe to COMPOSITION_UPDATED so panelSurface composition changes cannot leave stale UI`
    );
  }

  console.log('  OK - render and composition paths keep content variant synchronized');
}

function testCssOwnsSummaryStyleOnly() {
  console.log('\n[TEST] mobile premium split MAP SUMMARY section owns summary styling');
  const mobilePremiumSrc = read(MOBILE_PREMIUM_PATH);

  assert(
    /\/\*\s*─── MAP SUMMARY/.test(mobilePremiumSrc),
    'mobile premium split must keep a named MAP SUMMARY section'
  );
  assert(
    /#selected-details\.active:not\(\[hidden\]\)/.test(mobilePremiumSrc),
    'generic #selected-details.active rule must preserve [hidden] ownership'
  );
  assert(
    /data-panel-surface=['"]map-focus-search['"][\s\S]*#selected-map-summary\.selected-map-summary:not\(\[hidden\]\)/.test(mobilePremiumSrc),
    'mobile premium split MAP SUMMARY section must style the dedicated #selected-map-summary surface'
  );
  assert(
    /data-panel-surface=['"]map-focus-search['"][\s\S]*\.selected-map-summary-match/.test(mobilePremiumSrc),
    'mobile premium split MAP SUMMARY section must style the dedicated summary content, not only the wrapper'
  );

  const forbiddenLegacyInternals = [
    '#selected-name',
    '#selected-what',
    '#selected-match-panel',
    '#selected-meta-strip',
    '#selected-badges',
    '.selected-grid',
    '#selected-action-row',
    '.selected-action-row',
  ];

  for (const selector of forbiddenLegacyInternals) {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const before = new RegExp(`data-panel-surface=['"]map-focus-search['"][^{}]*${escapedSelector}`);
    const after = new RegExp(`${escapedSelector}[^{}]*data-panel-surface=['"]map-focus-search['"]`);
    assert(
      !before.test(mobilePremiumSrc) && !after.test(mobilePremiumSrc),
      `mobile premium split must not add map-focus-search rules for old detail internal ${selector}`
    );
  }

  console.log('  OK - summary styling is isolated from old selected-card internals');
}

function testProgressiveDisclosureDoesNotTargetMapSummaryState() {
  console.log('\n[TEST] progressive_disclosure map selected-card rules exclude map-focus-search');
  const src = read(PROGRESSIVE_DISCLOSURE_PATH);

  const oldSelectedSelectors = [
    '.selected-card',
    '.selected-card .panel-section-title',
    '.selected-card h3',
    '.selected-hero',
    '.selected-role-badge',
    '.selected-filed-as',
    '.selected-subtitle',
    '.selected-meta-strip',
    '.selected-action-row',
    '.selected-match-panel',
    '.selected-match-copy',
    '.selected-grid',
    '.selected-item',
    '.selected-item-value',
  ];

  for (const selector of oldSelectedSelectors) {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const unsafe = new RegExp(`body\\[data-active-view=['"]map['"]\\](?!:not\\(\\[data-panel-surface=['"]map-focus-search['"]\\]\\))\\s+${escapedSelector.replace(/\\ /g, '\\s+')}`);
    assert(
      !unsafe.test(src),
      `progressive_disclosure.css must not apply broad map selected-card rule to map-focus-search for ${selector}`
    );
  }

  assert(
    /body\[data-active-view=['"]map['"]\]:not\(\[data-panel-surface=['"]map-focus-search['"]\]\)\s+\.selected-card/.test(src),
    'progressive_disclosure.css should explicitly exclude map-focus-search from old map selected-card rules'
  );

  console.log('  OK - old map selected-card rules cannot style the map-summary content owner');
}

function run() {
  console.log('=================================================================');
  console.log('map-focus-search-content-owner-contract.mjs');
  console.log('Contract test: dedicated selected map summary content owner');
  console.log('=================================================================');

  testHtmlSummarySubtree();
  testRendererOwnsVariantDecision();
  testSummaryIsReadOnly();
  testRenderPathCallsVariantSync();
  testCssOwnsSummaryStyleOnly();
  testProgressiveDisclosureDoesNotTargetMapSummaryState();

  console.log('\n=================================================================');
  console.log('ALL TESTS PASSED');
  console.log('=================================================================');
}

run();

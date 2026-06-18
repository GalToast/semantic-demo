/**
 * info-panel-surface-ownership-contract.mjs
 *
 * Svelte-native ownership contract for info-panel surface states.
 *
 * After the chrome migration, info-panel surface ownership maps to:
 *   1. InfoPanel.svelte — the single component owning #info-panel and
 *      all surface rendering (idle, focus, search, focus-search,
 *      semantic-dive, map-*).
 *   2. src/lib/orchestration/info-panel-state.ts — per-state content
 *      descriptor (headerText, headerVisible, emptyHeadline, emptySubtext,
 *      panelVisible, selectionSuppressed) keyed on data-panel-surface.
 *   3. src/lib/view-models/selected-business-view-model.ts — pure
 *      view-model for selected-business props (name, what, theme, status,
 *      matchNarrative, facts, etc.).
 *   4. src/lib/focus/stage-renderer.ts — structural slot visibility
 *      management (NOT Svelte-internal child elements).
 *
 * This contract verifies:
 *   A. InfoPanel.svelte is the single surface owner for all panel IDs.
 *   B. No retired placeholder components exist (SelectedBusinessDetails,
 *      InfoPanelSelectionSurface, selected-details-svelte-island, etc.).
 *   C. info-panel-state.ts owns the per-surface content descriptor table.
 *   D. selected-business-view-model.ts exposes the view-model contract.
 *   E. No vanilla JS module writes to Svelte-internal child elements
 *      that InfoPanel.svelte owns declaratively.
 *   F. The HTML shell does not contain stale surface slots that would
 *      conflict with the Svelte component's ownership.
 *
 * Usage:
 *   node tests/info-panel-surface-ownership-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));

// ── Source paths ──────────────────────────────────────────────────────────────

const INFO_PANEL = 'src/components/InfoPanel.svelte';
const FOCUS_CARD = 'src/components/FocusCard.svelte';
const INFO_PANEL_STATE = 'src/lib/orchestration/info-panel-state.ts';
const VIEW_MODEL = 'src/lib/view-models/selected-business-view-model.ts';
const STAGE_RENDERER = 'src/lib/focus/stage-renderer.ts';
const JOURNEY_STAGE_RENDERER = 'src/lib/journey/focus-stage-renderer.ts';
const HTML_SHELL = 'vector-explorer-polished.html';

// ── InfoPanel surface IDs (must ALL be owned by InfoPanel.svelte) ─────────────

const INFO_PANEL_SURFACE_IDS = [
  'info-panel',
  'info-panel-content',
  'selected-card',
  'selected-empty',
  'selected-details',
  'selected-name',
  'selected-what',
  'selected-meta-strip',
  'selected-badges',
  'selected-facts',
  'selected-match-panel',
  'selected-match-copy',
  'selected-action-row',
  'btn-selected-map',
  'selected-theme',
  'selected-status',
  'selected-map',
  'selected-thread',
  'selected-role-badge',
  'selected-filed-as',
  'selected-sensitivity',
  'selected-trivia',
];

// ── Classes (not IDs) that InfoPanel.svelte must own ──────────────────────────

const INFO_PANEL_SURFACE_CLASSES = [
  'selected-hero',
  'selected-hero-main',
  'selected-subtitle',
  'selected-grid',
  'selected-item',
  'selected-empty-headline',
  'selected-empty-sub',
];

// ── Conditional classes (class:X={condition}) that InfoPanel.svelte must use ──

const INFO_PANEL_CONDITIONAL_CLASSES = [
  'selected-card-empty',
];

// ── Svelte-owned child IDs (stage-renderer must NOT query these) ──────────────

const SVELTE_OWNED_CHILD_IDS = [
  'selected-name',
  'selected-what',
  'selected-meta-strip',
  'selected-badges',
  'selected-facts',
  'selected-match-panel',
  'selected-match-copy',
  'selected-action-row',
  'btn-selected-map',
  'selected-theme',
  'selected-status',
  'selected-map',
  'selected-thread',
];

// ── Retired component paths (must not exist) ──────────────────────────────────

const RETIRED_COMPONENT_PATHS = [
  'src/components/SelectedBusinessDetails.svelte',
  'src/components/InfoPanelSelectionSurface.svelte',
  'js/modules/components/SelectedBusinessDetails.svelte',
  'js/modules/components/InfoPanelSelectionSurface.svelte',
  'js/modules/components/InfoPanelSearchSurface.svelte',
  'js/modules/selected-details-svelte-island.ts',
  'js/modules/search-results-svelte-island.ts',
  'js/modules/info-panel-chrome-island.ts',
  'js/modules/legend-panel-chrome-island.ts',
];

// ── Test A: InfoPanel.svelte owns all surface IDs ────────────────────────────

function testInfoPanelOwnsAllSurfaceIds() {
  const src = read(INFO_PANEL);

  for (const id of INFO_PANEL_SURFACE_IDS) {
    assert(
      src.includes(`id="${id}"`),
      `InfoPanel.svelte must own #${id}`
    );
  }

  // Verify class-based surfaces
  for (const cls of INFO_PANEL_SURFACE_CLASSES) {
    assert(
      src.includes(`class="${cls}"`) || src.includes(`class="${cls} `) || src.includes(`.${cls}`),
      `InfoPanel.svelte must own class .${cls}`
    );
  }

  // Verify conditional classes (class:X={condition} syntax)
  for (const cls of INFO_PANEL_CONDITIONAL_CLASSES) {
    assert(
      src.includes(`class:${cls}=`),
      `InfoPanel.svelte must use conditional class ${cls}`
    );
  }

  console.log('  OK - InfoPanel.svelte owns all surface IDs and classes');
}

// ── Test B: Retired placeholder components do not exist ───────────────────────

function testRetiredComponentsRemoved() {
  for (const rel of RETIRED_COMPONENT_PATHS) {
    assert(
      !exists(rel),
      `retired component ${rel} must not be restored`
    );
  }

  console.log('  OK - retired placeholder components removed');
}

// ── Test C: info-panel-state.ts owns per-surface content descriptors ──────────

function testInfoPanelStateOwnsContentDescriptors() {
  const src = read(INFO_PANEL_STATE);

  // Must export getInfoPanelContent()
  assert(
    /export\s+function\s+getInfoPanelContent\s*\(/.test(src),
    'info-panel-state.ts must export getInfoPanelContent()'
  );

  // Must have content descriptors for all active surfaces
  const requiredSurfaces = [
    'idle',
    'focus',
    'focus-search',
    'search',
    'semantic-dive',
  ];
  for (const surface of requiredSurfaces) {
    // Match either quoted ('idle': {) or unquoted (idle: {) property keys
    const hasDescriptor = new RegExp(`(?:'${surface}'|"${surface}"|\\b${surface}\\b)\\s*:\\s*\\{`).test(src);
    assert(
      hasDescriptor,
      `info-panel-state.ts must have content descriptor for surface "${surface}"`
    );
  }

  // Must have selectionSuppressed for search surface
  assert(
    /selectionSuppressed/.test(src),
    'info-panel-state.ts must define selectionSuppressed for search surfaces'
  );

  // Must have headerVisible / headerText for surface customization
  assert(
    /headerVisible/.test(src) && /headerText/.test(src),
    'info-panel-state.ts must define headerVisible and headerText'
  );

  // Must handle map-* surfaces (panelVisible: false)
  assert(
    /panelVisible/.test(src),
    'info-panel-state.ts must define panelVisible for map surfaces'
  );

  // Must have MAP_SURFACES or map-family set
  assert(
    /MAP_SURFACES|map-idle|map-focus|map-search/.test(src),
    'info-panel-state.ts must handle map-family surfaces'
  );

  console.log('  OK - info-panel-state.ts owns per-surface content descriptors');
}

// ── Test D: selected-business-view-model.ts exposes view-model contract ───────

function testViewModelExposesContract() {
  const src = read(VIEW_MODEL);

  // Must export buildSelectedBusinessProps
  assert(
    /export\s+function\s+buildSelectedBusinessProps\s*\(/.test(src),
    'view-model must export buildSelectedBusinessProps()'
  );

  // Must return SelectedBusinessProps with key fields
  const requiredFields = [
    'name',
    'what',
    'theme',
    'status',
    'matchNarrative',
    'showMatchPanel',
    'facts',
    'sensitivityBadges',
    'isPopulated',
  ];
  for (const field of requiredFields) {
    assert(
      new RegExp(`\\b${field}\\b`).test(src),
      `view-model must expose ${field} in SelectedBusinessProps`
    );
  }

  // Must handle null point (empty state)
  assert(
    /if\s*\(\s*!point\s*\)/.test(src),
    'view-model must handle null point for empty state'
  );

  console.log('  OK - selected-business-view-model.ts exposes view-model contract');
}

// ── Test E: stage-renderer does not write to Svelte-internal children ────────

function testStageRendererRespectsSvelteOwnership() {
  const rendererSrc = read(STAGE_RENDERER);

  for (const id of SVELTE_OWNED_CHILD_IDS) {
    assert(
      !rendererSrc.includes(`getElementById('${id}')`) &&
        !rendererSrc.includes(`getElementById("${id}")`),
      `stage-renderer.ts must not query Svelte-owned #${id}`
    );
  }

  // stage-renderer must NOT write innerHTML to selected-details children
  assert(
    !/selected-name[\s\S]{0,200}\.innerHTML\s*=/.test(rendererSrc),
    'stage-renderer.ts must not write innerHTML to #selected-name'
  );
  assert(
    !/selected-what[\s\S]{0,200}\.innerHTML\s*=/.test(rendererSrc),
    'stage-renderer.ts must not write innerHTML to #selected-what'
  );

  // Same check for journey/focus-stage-renderer.ts
  if (exists(JOURNEY_STAGE_RENDERER)) {
    const jSrc = read(JOURNEY_STAGE_RENDERER);
    for (const id of SVELTE_OWNED_CHILD_IDS) {
      assert(
        !jSrc.includes(`getElementById('${id}')`) &&
          !jSrc.includes(`getElementById("${id}")`),
        `journey/focus-stage-renderer.ts must not query Svelte-owned #${id}`
      );
    }
  }

  console.log('  OK - stage-renderer respects Svelte child element ownership');
}

// ── Test F: HTML shell has no stale surface slots ────────────────────────────

function testHtmlShellNoStaleSlots() {
  const html = read(HTML_SHELL);

  // The HTML shell should NOT render info-panel surface IDs directly
  // (they are owned by InfoPanel.svelte now)
  const staleSlots = [
    'id="info-panel"',
    'id="info-panel-content"',
    'id="selected-card"',
    'id="selected-details"',
    'id="selected-name"',
    'id="selected-what"',
    'id="selected-meta-strip"',
    'id="selected-action-row"',
    'id="btn-selected-map"',
  ];

  for (const slot of staleSlots) {
    assert(
      !html.includes(slot),
      `HTML shell must not render stale surface slot ${slot} (owned by InfoPanel.svelte)`
    );
  }

  // Must NOT reference retired chrome islands
  assert(
    !html.includes('info-panel-chrome-island'),
    'HTML shell must not expose obsolete info-panel chrome slot'
  );
  assert(
    !html.includes('legend-panel-chrome-island'),
    'HTML shell must not expose obsolete legend-panel chrome slot'
  );

  console.log('  OK - HTML shell has no stale surface slots');
}

// ── Test G: InfoPanel.svelte reads surface from body data-attrs (parity) ─────

function testInfoPanelReadsParityAttrs() {
  const src = read(INFO_PANEL);

  // Must read panelSurface from body data-attrs or test-compat store
  assert(
    /panelSurface|panel-surface|bodyPanelSurface/.test(src),
    'InfoPanel.svelte must read panelSurface from body data-attrs or test-compat store'
  );

  // Must use selectionSuppressed to suppress card in search mode
  assert(
    /selectionSuppressed/.test(src),
    'InfoPanel.svelte must use selectionSuppressed for search-mode card suppression'
  );

  // Must derive panelOpen from surface state
  assert(
    /panelOpen/.test(src),
    'InfoPanel.svelte must derive panelOpen from surface state'
  );

  // Must derive isEmpty from selectedRecord
  assert(
    /isEmpty/.test(src),
    'InfoPanel.svelte must derive isEmpty from selectedRecord presence'
  );

  console.log('  OK - InfoPanel.svelte reads parity attrs and derives surface state');
}

// ── Test H: Idle surface releases selected-record ownership ─────────────────

function testIdleSurfaceClearsSelectedRecord() {
  const src = read(INFO_PANEL);

  assert(
    /let\s+selectedRecord\s*=\s*\$derived\.by\s*\(\s*\(\)\s*=>\s*\{[\s\S]*?if\s*\(\s*effectiveSurface\s*===\s*['"]idle['"]\s*\)\s*return\s+null\s*;/.test(src),
    'InfoPanel.svelte must clear selectedRecord on idle surfaces before test/data fallback records can render'
  );

  console.log('  OK - idle surface clears selectedRecord ownership');
}

// ── Run all tests ────────────────────────────────────────────────────────────

function run() {
  console.log('=================================================================');
  console.log('info-panel-surface-ownership-contract.mjs');
  console.log('Svelte-native ownership contract for info-panel surface states');
  console.log('=================================================================');

  testInfoPanelOwnsAllSurfaceIds();
  testRetiredComponentsRemoved();
  testInfoPanelStateOwnsContentDescriptors();
  testViewModelExposesContract();
  testStageRendererRespectsSvelteOwnership();
  testHtmlShellNoStaleSlots();
  testInfoPanelReadsParityAttrs();
  testIdleSurfaceClearsSelectedRecord();

  console.log('\n=================================================================');
  console.log('ALL TESTS PASSED');
  console.log('=================================================================');
}

run();

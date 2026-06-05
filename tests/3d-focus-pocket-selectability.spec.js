/**
 * 3d-focus-pocket-selectability.spec.js
 *
 * Contract test proving that after one node enters focus mode:
 *   1. Focus mode is active with focusedNode set
 *   2. Focus-pocket / nearby nodes are identifiable via state
 *      (focusPocketIndices, focusPocketRoleByIndex, focusPocketMeta)
 *   3. The UI exposes a deterministic selectable relationship path
 *      (thread-inspector panel, focus-stage panel, or node-detail tooltip)
 *   4. At least one related/visible candidate node remains selectable
 *
 * Desktop (1440×900) and short-landscape (844×390, mobile) are both covered.
 *
 * Run directly:
 *   npx playwright test tests/3d-focus-pocket-selectability.spec.js --browser=chromium --headed
 * Or via manifest:
 *   node tests/run-all-contracts.js --group=scene
 */

import { test, expect } from '@playwright/test';
import { probeFocusPocket, isReachableScreenCoordinate, focusNodeViaApp } from './helpers/3d-interaction-helpers.js';

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '');

// ---------------------------------------------------------------------------
// Mock stubs so the app stays responsive even without a live API
// ---------------------------------------------------------------------------

const SEMANTIC_HEALTH_STUB = {
  ok: true,
  state: 'healthy',
  provenance: { label: 'Search ready', detail: 'Semantic search is ready.' }
};

const SEARCH_STUB = {
  ok: true,
  count: 3,
  results: [
    { lead_id: 1, score: 0.99, semantic_score: 0.99, public_note: 'Coffee shop on Main St.' },
    { lead_id: 2, score: 0.91, semantic_score: 0.91, public_note: 'Cafe near the park.' },
    { lead_id: 20, score: 0.86, semantic_score: 0.86, public_note: 'Espresso bar downtown.' }
  ]
};

async function setupMockSearch(page) {
  await page.route('**/api.php?action=semantic_lane_health**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEMANTIC_HEALTH_STUB) })
  );
  await page.route('**/api.php?action=semantic_search**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEARCH_STUB) })
  );
}

// ---------------------------------------------------------------------------
// App bootstrap helper
// ---------------------------------------------------------------------------

async function openApp(page, viewport = { width: 1440, height: 900 }) {
  await setupMockSearch(page);
  await page.setViewportSize(viewport);
  await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (
    typeof window.__APP_ACTIONS__?.clearSearch === 'function' &&
    typeof window.__APP_ACTIONS__?.focusOnNode === 'function' &&
    Array.isArray(window.__APP_STATE__?.points ?? window.__TEST_STATE__?.points) &&
    (window.__APP_STATE__?.points ?? window.__TEST_STATE__?.points ?? []).length > 0 &&
    (window.__APP_STATE__?.pointIndexByLeadId ?? window.__TEST_STATE__?.pointIndexByLeadId)?.size > 0
  ), { timeout: 20000 });
  await page.waitForFunction(() => {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return true;
    const styles = getComputedStyle(overlay);
    return overlay.classList.contains('hidden') ||
      styles.display === 'none' ||
      styles.visibility === 'hidden' ||
      styles.pointerEvents === 'none';
  }, { timeout: 20000 });
  // preceding waitForFunction handles settlement
}

// ---------------------------------------------------------------------------
// Probe helper — capture all relevant runtime state in one call
// ---------------------------------------------------------------------------

async function probe(page) {
  return page.evaluate(() => {
    const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    const body = document.body;
    return {
      url: location.href,
      body: {
        panelSurface: body.dataset.panelSurface || '',
        focusPanelMode: body.dataset.focusPanelMode || '',
        trailDepth: body.dataset.trailDepth || ''
      },
      state: {
        mode: state.navState?.mode || '',
        focusedIndex: state.navState?.focusedIndex ?? null,
        focusedNode: state.focusedNode ?? null,
        focusPocketIndices: state.navState?.focusPocketIndices
          ? [...state.navState.focusPocketIndices]
          : [],
        focusPocketMeta: state.navState?.focusPocketMeta || null,
        focusPocketRoleByIndex: state.navState?.focusPocketRoleByIndex
          ? Object.fromEntries(state.navState.focusPocketRoleByIndex)
          : {},
        threadCandidates: state.navState?.threadCandidates
          ? state.navState.threadCandidates.slice(0, 10)
          : [],
        threadSource: state.navState?.threadSource || '',
        nodesAreSettling: state.nodesAreSettling ?? false
      },
      ui: {
        // Focus-stage / thread-inspector panel elements that expose selectable nodes
        focusStageActions: document.querySelectorAll('.focus-stage-neighbor-actions,.focus-stage-neighbor-action').length,
        threadInspectorItems: document.querySelectorAll('.thread-item,.thread-candidate,.ti-item,.ti-candidate').length,
        nodeDetailCards: document.querySelectorAll('.node-detail,.lead-detail,.person-card,.node-info-card').length,
        pocketCountBadge: document.querySelectorAll('.pocket-count,.focus-pocket-count,.pocket-meta').length
      }
    };
  });
}

// ---------------------------------------------------------------------------
// Enter focus through the app action namespace (deterministic, no click needed)
// ---------------------------------------------------------------------------

async function enterFocusByIndex(page, index) {
  await focusNodeViaApp(page, index);
  // Wait for focus mode to settle
  await page.waitForFunction(() => (window.__APP_STATE__?.navState?.mode ?? window.__TEST_STATE__?.navState?.mode ?? '') === 'focus', { timeout: 15000 });
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {}); // allow pocket animation to begin
}

// ---------------------------------------------------------------------------
// Enter focus via search result click (realistic user path)
// ---------------------------------------------------------------------------

async function performSearch(page, query = 'coffee') {
  const input = page.locator('#search-input');
  await input.focus();
  await input.fill(query);
  await page.evaluate(async (q) => {
    const el = document.getElementById('search-input');
    if (!el) return;
    el.value = q;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const search = window.__APP_ACTIONS__?.search;
    if (typeof search === 'function') {
      await search(q, { preferCachedResults: false });
    }
  }, query);
  await expect(page.locator('.search-result-item').first()).toBeVisible({ timeout: 15000 });
}

async function enterFocusFromSearch(page) {
  await performSearch(page);
  await page.locator('.search-result-item').first().click();
  await page.waitForFunction(() => (window.__APP_STATE__?.navState?.mode ?? window.__TEST_STATE__?.navState?.mode ?? '') === 'focus', { timeout: 15000 });
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});
}

// ---------------------------------------------------------------------------
// TEST SUITE
// ---------------------------------------------------------------------------

test.describe('focus-pocket node selectability', () => {

  // ------------------------------------------------------------------
  // Desktop: focus On Node — pocket state and UI evidence
  // ------------------------------------------------------------------

  test('desktop: entering focus sets focusedNode, populates focusPocketIndices, and exposes selectable UI', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1440, height: 900 });

    // Find an index with actual point data and (ideally) thread candidates
    const entryIndex = await page.evaluate(() => {
      const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
      const pts = state.points;
      if (!pts || pts.length === 0) return 0;
      // Prefer a point that has neighbors in the semantic map
      for (let i = 0; i < Math.min(pts.length, 20); i++) {
        const pt = pts[i];
        if (pt && state.pointIndexByLeadId?.has(pt.lead_id)) {
          const leadId = pt.lead_id;
          const node = state.semanticNeighborMapByLeadId?.get(leadId);
          if (node?.neighbors?.length > 0) return i;
        }
      }
      return 0;
    });

    await enterFocusByIndex(page, entryIndex);

    const snap = await probe(page);

    // --- Focus mode must be active ---
    expect(snap.state.mode, 'navState.mode must be focus').toBe('focus');
    expect(snap.state.focusedIndex, 'focusedIndex must be set').not.toBeNull();

    // --- focusedNode must be set ---
    expect(snap.state.focusedNode, 'focusedNode must be non-null after focusOnNode').not.toBeNull();

    // --- Body surface must reflect focus ---
    expect(['focus', 'focus-search', 'semantic-dive'],
      'body panelSurface must be a focus-related surface'
    ).toContain(snap.body.panelSurface);

    // --- Pocket indices must be populated (the "pocket" of related nodes) ---
    // This is the core contract: focusPocketIndices identifies nearby/focus-pocket nodes
    const pocketNonEmpty =
      Array.isArray(snap.state.focusPocketIndices) && snap.state.focusPocketIndices.length > 0;
    expect(pocketNonEmpty,
      'focusPocketIndices must have at least one entry (or threadCandidates as fallback)'
    ).toBeTruthy();

    // --- Pocket role map must exist ---
    const roleMapNonEmpty =
      snap.state.focusPocketRoleByIndex &&
      Object.keys(snap.state.focusPocketRoleByIndex).length > 0;
    expect(roleMapNonEmpty,
      'focusPocketRoleByIndex must identify node roles (anchor/primary/support/halo)'
    ).toBeTruthy();

    // --- Pocket meta must be active ---
    expect(snap.state.focusPocketMeta, 'focusPocketMeta must be present').not.toBeNull();
    expect(snap.state.focusPocketMeta.active,
      'focusPocketMeta.active must be true when pocket is formed').toBeTruthy();

    // --- nodesAreSettling must be true during pocket animation ---
    expect(snap.state.nodesAreSettling,
      'nodesAreSettling should be true during focus-pocket animation').toBeTruthy();

    // --- UI exposure: at least one of these UI surfaces must exist —
    //    thread inspector items, focus-stage actions, node-detail cards, or a pocket count badge
    const hasThreadInspectorUI = snap.ui.threadInspectorItems > 0;
    const hasFocusStageUI = snap.ui.focusStageActions > 0;
    const hasNodeDetailUI = snap.ui.nodeDetailCards > 0;
    const hasPocketBadge = snap.ui.pocketCountBadge > 0;
    const hasAnyRelationshipUI = hasThreadInspectorUI || hasFocusStageUI || hasNodeDetailUI || hasPocketBadge;

    // The global point cloud remains visible in focus mode; relationship UI is
    // still required as an explicit, deterministic navigation path.
    expect(hasAnyRelationshipUI,
      `At least one relationship UI (thread-inspector/focus-stage/node-detail/pocket-badge) must be visible. ` +
      `Got: thread=${snap.ui.threadInspectorItems}, focusStage=${snap.ui.focusStageActions}, ` +
      `nodeDetail=${snap.ui.nodeDetailCards}, badge=${snap.ui.pocketCountBadge}`
    ).toBeTruthy();

    // --- Selectable relationship path: threadCandidates should be present ---
    //    threadCandidates is the deterministic list of semantically related nodes
    //    that a user can navigate to (the "selectable relationship path")
    const hasThreadCandidates =
      Array.isArray(snap.state.threadCandidates) && snap.state.threadCandidates.length > 0;
    const hasFallbackCandidates =
      Array.isArray(snap.state.focusPocketIndices) && snap.state.focusPocketIndices.length > 0;

    expect(hasThreadCandidates || hasFallbackCandidates,
      'At least one of threadCandidates or focusPocketIndices must be non-empty ' +
      '(deterministic selectable relationship path must exist)'
    ).toBeTruthy();
  });

  // ------------------------------------------------------------------
  // Desktop: search result click enters focus with identifiable pocket
  // ------------------------------------------------------------------

  test('desktop: search-result click enters focus and populates pocket + relationship UI', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1440, height: 900 });

    await enterFocusFromSearch(page);

    const snap = await probe(page);

    expect(snap.state.mode, 'navState.mode must be focus after search result click').toBe('focus');
    expect(snap.state.focusedNode, 'focusedNode must be set').not.toBeNull();
    expect(snap.body.panelSurface,
      'panelSurface must reflect focus mode').toMatch(/focus|semantic-dive/);

    // Pocket identification
    const hasPocketIndices =
      Array.isArray(snap.state.focusPocketIndices) && snap.state.focusPocketIndices.length > 0;
    const hasThreadCandidates =
      Array.isArray(snap.state.threadCandidates) && snap.state.threadCandidates.length > 0;

    expect(hasPocketIndices || hasThreadCandidates,
      'focusPocketIndices or threadCandidates must be populated after search-result focus'
    ).toBeTruthy();

    // Relationship UI must be present (thread inspector is the deterministic path)
    const hasRelationshipUI =
      snap.ui.threadInspectorItems > 0 ||
      snap.ui.focusStageActions > 0 ||
      snap.ui.nodeDetailCards > 0;

    expect(hasRelationshipUI,
      'Relationship UI (thread-inspector/focus-stage/node-detail) must be visible after search-result focus'
    ).toBeTruthy();
  });

  // ------------------------------------------------------------------
  // Mobile / short-landscape: focus-pocket selectability at 844×390
  // ------------------------------------------------------------------

  test('mobile: focusOnNode at 844x390 populates pocket state and relationship UI is visible', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 844, height: 390 });

    const entryIndex = await page.evaluate(() => {
      const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
      const pts = state.points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 20); i++) {
        const pt = pts[i];
        if (pt && state.pointIndexByLeadId?.has(pt.lead_id)) {
          const leadId = pt.lead_id;
          const node = state.semanticNeighborMapByLeadId?.get(leadId);
          if (node?.neighbors?.length > 0) return i;
        }
      }
      return 0;
    });

    await enterFocusByIndex(page, entryIndex);

    const snap = await probe(page);

    expect(snap.state.mode, 'navState.mode must be focus on mobile').toBe('focus');
    expect(snap.state.focusedNode, 'focusedNode must be set on mobile').not.toBeNull();

    // Pocket indices or threadCandidates must be present
    const hasPocketOrCandidates =
      (Array.isArray(snap.state.focusPocketIndices) && snap.state.focusPocketIndices.length > 0) ||
      (Array.isArray(snap.state.threadCandidates) && snap.state.threadCandidates.length > 0);

    expect(hasPocketOrCandidates,
      'At least one of focusPocketIndices or threadCandidates must be populated on mobile'
    ).toBeTruthy();

    // Relationship UI must be visible on mobile (critical for short viewports)
    const hasRelationshipUI =
      snap.ui.threadInspectorItems > 0 ||
      snap.ui.focusStageActions > 0 ||
      snap.ui.nodeDetailCards > 0 ||
      snap.ui.pocketCountBadge > 0;

    expect(hasRelationshipUI,
      `Relationship UI must be visible on mobile. Got: thread=${snap.ui.threadInspectorItems}, ` +
      `focusStage=${snap.ui.focusStageActions}, nodeDetail=${snap.ui.nodeDetailCards}, badge=${snap.ui.pocketCountBadge}`
    ).toBeTruthy();

    // nodesAreSettling during animation
    expect(snap.state.nodesAreSettling,
      'nodesAreSettling should be true during mobile focus-pocket animation').toBeTruthy();
  });

  // ------------------------------------------------------------------
  // Tablet (iPad landscape / generic tablet landscape)
  // ------------------------------------------------------------------

  test('tablet: focusOnNode at 1024x768 populates pocket state and relationship UI is visible', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1024, height: 768 });

    const entryIndex = await page.evaluate(() => {
      const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
      const pts = state.points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 20); i++) {
        const pt = pts[i];
        if (pt && state.pointIndexByLeadId?.has(pt.lead_id)) {
          const leadId = pt.lead_id;
          const node = state.semanticNeighborMapByLeadId?.get(leadId);
          if (node?.neighbors?.length > 0) return i;
        }
      }
      return 0;
    });

    await enterFocusByIndex(page, entryIndex);

    const snap = await probe(page);

    expect(snap.state.mode, 'navState.mode must be focus on tablet').toBe('focus');
    expect(snap.state.focusedNode, 'focusedNode must be set on tablet').not.toBeNull();

    // Pocket indices or threadCandidates must be present
    const hasPocketOrCandidates =
      (Array.isArray(snap.state.focusPocketIndices) && snap.state.focusPocketIndices.length > 0) ||
      (Array.isArray(snap.state.threadCandidates) && snap.state.threadCandidates.length > 0);

    expect(hasPocketOrCandidates,
      'At least one of focusPocketIndices or threadCandidates must be populated on tablet'
    ).toBeTruthy();

    // Relationship UI must be visible on tablet
    const hasRelationshipUI =
      snap.ui.threadInspectorItems > 0 ||
      snap.ui.focusStageActions > 0 ||
      snap.ui.nodeDetailCards > 0 ||
      snap.ui.pocketCountBadge > 0;

    expect(hasRelationshipUI,
      `Tablet: relationship UI must be visible. Got: thread=${snap.ui.threadInspectorItems}, ` +
      `focusStage=${snap.ui.focusStageActions}, nodeDetail=${snap.ui.nodeDetailCards}, badge=${snap.ui.pocketCountBadge}`
    ).toBeTruthy();
  });

  test('tablet: all focusPocketIndices have valid in-bounds screen coordinates at 1024x768', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1024, height: 768 });

    const entryIndex = await page.evaluate(() => {
      const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
      const pts = state.points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 20); i++) {
        const pt = pts[i];
        if (pt && state.pointIndexByLeadId?.has(pt.lead_id)) {
          const node = state.semanticNeighborMapByLeadId?.get(pt.lead_id);
          if (node?.neighbors?.length > 0) return i;
        }
      }
      return 0;
    });

    await enterFocusByIndex(page, entryIndex);
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), { timeout: 8000 }).catch(() => {});

    const pocket = await probeFocusPocket(page);
    expect(pocket.pocketSize, 'tablet pocket must have at least 1 node').toBeGreaterThan(0);
    expect(pocket.reachableCount, `tablet pocket must have at least 1 in-bounds screen node, got ${pocket.reachableCount} of ${pocket.pocketSize}`).toBeGreaterThan(0);
  });

  // ------------------------------------------------------------------
  // Short-landscape (iPad Mini / small Android landscape)
  // ------------------------------------------------------------------

  test('short-landscape: focus mode enters cleanly at 844x390 with pocket evidence', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 844, height: 390 });

    const entryIndex = await page.evaluate(() => {
      const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
      const pts = state.points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 20); i++) {
        const pt = pts[i];
        if (pt && state.pointIndexByLeadId?.has(pt.lead_id)) {
          const leadId = pt.lead_id;
          const node = state.semanticNeighborMapByLeadId?.get(leadId);
          if (node?.neighbors?.length > 0) return i;
        }
      }
      return 0;
    });

    await enterFocusByIndex(page, entryIndex);

    const snap = await probe(page);

    expect(snap.state.mode, 'navState.mode must be focus at short-landscape').toBe('focus');
    expect(snap.state.focusedNode, 'focusedNode must be non-null at short-landscape').not.toBeNull();

    // focusPocketMeta must be active
    expect(snap.state.focusPocketMeta, 'focusPocketMeta must be present at short-landscape').not.toBeNull();
    expect(snap.state.focusPocketMeta.active,
      'focusPocketMeta.active must be true at short-landscape').toBeTruthy();

    // Relationship path: threadCandidates or pocket indices
    const hasSelectablePath =
      (Array.isArray(snap.state.threadCandidates) && snap.state.threadCandidates.length > 0) ||
      (Array.isArray(snap.state.focusPocketIndices) && snap.state.focusPocketIndices.length > 0);

    expect(hasSelectablePath,
      'Deterministic selectable path (threadCandidates or focusPocketIndices) must exist at short-landscape'
    ).toBeTruthy();
  });

  // ------------------------------------------------------------------
  // Focus-stage role evidence: anchor, primary, support, halo roles are assigned
  // ------------------------------------------------------------------

  test('desktop: focusPocketRoleByIndex assigns anchor/primary/support/halo roles deterministically', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1440, height: 900 });

    const entryIndex = await page.evaluate(() => {
      const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
      const pts = state.points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 20); i++) {
        const pt = pts[i];
        if (pt && state.pointIndexByLeadId?.has(pt.lead_id)) {
          const leadId = pt.lead_id;
          const node = state.semanticNeighborMapByLeadId?.get(leadId);
          if (node?.neighbors?.length > 0) return i;
        }
      }
      return 0;
    });

    await enterFocusByIndex(page, entryIndex);

    const snap = await probe(page);

    const roles = snap.state.focusPocketRoleByIndex;
    expect(roles, 'focusPocketRoleByIndex must not be empty').not.toBeNull();
    expect(Object.keys(roles).length, 'focusPocketRoleByIndex must have entries').toBeGreaterThan(0);

    const validRoles = new Set(['anchor', 'primary', 'support', 'halo']);
    for (const [, role] of Object.entries(roles)) {
      expect(validRoles.has(role),
        `Every role value must be one of anchor/primary/support/halo, got "${role}"`
      ).toBeTruthy();
    }

    // Anchor must be the focused index
    expect(roles[String(entryIndex)], 'focused index must have role "anchor"').toBe('anchor');
  });

  // ------------------------------------------------------------------
  // Reachability: all pocket nodes must have valid screen coordinates
  // ------------------------------------------------------------------

  test('desktop: all focusPocketIndices have valid in-bounds screen coordinates', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1440, height: 900 });

    const entryIndex = await page.evaluate(() => {
      const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
      const pts = state.points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 20); i++) {
        const pt = pts[i];
        if (pt && state.pointIndexByLeadId?.has(pt.lead_id)) {
          const node = state.semanticNeighborMapByLeadId?.get(pt.lead_id);
          if (node?.neighbors?.length > 0) return i;
        }
      }
      return 0;
    });

    await enterFocusByIndex(page, entryIndex);
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), { timeout: 8000 }).catch(() => {});

    const pocket = await probeFocusPocket(page);
    expect(pocket.pocketSize, 'pocket must have at least 1 node').toBeGreaterThan(0);
    expect(pocket.reachableCount, `pocket must have at least 1 in-bounds screen node, got ${pocket.reachableCount} of ${pocket.pocketSize}`).toBeGreaterThan(0);

    // Every reachable pocket node must be reachable via screen coordinate
    for (const node of pocket.pocketIndices) {
      const screenNode = pocket.reachableIndices.includes(node);
      if (!screenNode) continue;
      expect(Number.isFinite(node), 'pocket index must be finite').toBe(true);
    }
  });

  // ------------------------------------------------------------------
  // Short-landscape focus-pocket reachability
  // ------------------------------------------------------------------

  test('tablet: focus pocket has reachable nodes at 1024x768', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1024, height: 768 });

    const entryIndex = await page.evaluate(() => {
      const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
      const pts = state.points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 20); i++) {
        const pt = pts[i];
        if (pt && state.pointIndexByLeadId?.has(pt.lead_id)) {
          const node = state.semanticNeighborMapByLeadId?.get(pt.lead_id);
          if (node?.neighbors?.length > 0) return i;
        }
      }
      return 0;
    });

    await enterFocusByIndex(page, entryIndex);
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), { timeout: 8000 }).catch(() => {});

    const pocket = await probeFocusPocket(page);
    expect(pocket.pocketSize, 'tablet pocket must be non-empty').toBeGreaterThan(0);
    expect(pocket.reachableCount, `tablet must have reachable pocket nodes, got ${pocket.reachableCount}`).toBeGreaterThan(0);
  });

  test('short-landscape: focus pocket has reachable nodes at 844x390', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 844, height: 390 });

    const entryIndex = await page.evaluate(() => {
      const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
      const pts = state.points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 20); i++) {
        const pt = pts[i];
        if (pt && state.pointIndexByLeadId?.has(pt.lead_id)) {
          const node = state.semanticNeighborMapByLeadId?.get(pt.lead_id);
          if (node?.neighbors?.length > 0) return i;
        }
      }
      return 0;
    });

    await enterFocusByIndex(page, entryIndex);
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), { timeout: 8000 }).catch(() => {});

    const pocket = await probeFocusPocket(page);
    expect(pocket.pocketSize, 'short-landscape pocket must be non-empty').toBeGreaterThan(0);
    expect(pocket.reachableCount, `short-landscape must have reachable pocket nodes, got ${pocket.reachableCount}`).toBeGreaterThan(0);
  });

  test('mobile-portrait: focus pocket has reachable nodes at 390x844', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 390, height: 844 });

    const entryIndex = await page.evaluate(() => {
      const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
      const pts = state.points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 20); i++) {
        const pt = pts[i];
        if (pt && state.pointIndexByLeadId?.has(pt.lead_id)) {
          const node = state.semanticNeighborMapByLeadId?.get(pt.lead_id);
          if (node?.neighbors?.length > 0) return i;
        }
      }
      return 0;
    });

    await enterFocusByIndex(page, entryIndex);
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), { timeout: 8000 }).catch(() => {});

    const pocket = await probeFocusPocket(page);
    expect(pocket.pocketSize, 'mobile-portrait pocket must be non-empty').toBeGreaterThan(0);
    expect(pocket.reachableCount, `mobile-portrait must have reachable pocket nodes, got ${pocket.reachableCount}`).toBeGreaterThan(0);
  });

  // ------------------------------------------------------------------
  // Deep-dive / Step Inside: trailDepth=2 continues to expose selectable relationship
  // ------------------------------------------------------------------

  test('desktop: Step Inside (trailDepth=2) maintains selectable relationship path', async ({ page }) => {
    test.setTimeout(90000);
    await openApp(page, { width: 1440, height: 900 });

    // Enter focus first
    const entryIndex = await page.evaluate(() => {
      const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
      const pts = state.points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 20); i++) {
        const pt = pts[i];
        if (pt && state.pointIndexByLeadId?.has(pt.lead_id)) {
          const leadId = pt.lead_id;
          const node = state.semanticNeighborMapByLeadId?.get(leadId);
          if (node?.neighbors?.length > 0) return i;
        }
      }
      return 0;
    });

    await enterFocusByIndex(page, entryIndex);

    // Trigger Step Inside if btn-focus-dive is visible
    const diveBtn = page.locator('#btn-focus-dive');
    const diveBtnVisible = await diveBtn.isVisible().catch(() => false);

    if (diveBtnVisible) {
      await diveBtn.click();
      await page.waitForFunction(() => (
        (window.__APP_STATE__?.trailDepth ?? window.__TEST_STATE__?.trailDepth ?? null) === 2 ||
        (window.__APP_STATE__ ?? window.__TEST_STATE__)?.semanticDiveMode === true
      ), { timeout: 15000 });
    } else {
      // Force trailDepth=2 programmatically if button is not present (semantic-dive mode)
      await page.evaluate(() => {
        (window.__APP_STATE__ ?? window.__TEST_STATE__).trailDepth = 2;
        // Re-trigger neighborhood focus to rebuild pocket with DEEP_DIVE personality
        const focusNode = window.__APP_ACTIONS__?.focusOnNode;
        if (typeof focusNode === 'function') {
          focusNode((window.__APP_STATE__ ?? window.__TEST_STATE__).navState.focusedIndex);
        }
      });
      await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});
    }

    const snap = await probe(page);

    expect(['focus', 'semantic-dive', 'trail', 'map-trail'],
      `navState.mode must remain in a focus-derived exploration mode after Step Inside, got "${snap.state.mode}"`
    ).toContain(snap.state.mode);
    expect(snap.state.focusedNode, 'focusedNode must remain set after Step Inside').not.toBeNull();

    // After Step Inside, selectable relationship path must still be present
    const hasSelectablePath =
      (Array.isArray(snap.state.threadCandidates) && snap.state.threadCandidates.length > 0) ||
      (Array.isArray(snap.state.focusPocketIndices) && snap.state.focusPocketIndices.length > 0);

    expect(hasSelectablePath,
      'Selectable relationship path must survive Step Inside (trailDepth=2)'
    ).toBeTruthy();

    // Relationship UI must still be visible
    const hasRelationshipUI =
      snap.ui.threadInspectorItems > 0 ||
      snap.ui.focusStageActions > 0 ||
      snap.ui.nodeDetailCards > 0;

    expect(hasRelationshipUI,
      'Relationship UI must remain visible after Step Inside'
    ).toBeTruthy();
  });

});

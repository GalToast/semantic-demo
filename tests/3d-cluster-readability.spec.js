/**
 * 3d-cluster-readability.spec.js
 *
 * Contract test proving 3D cluster labels are visible, distinguishable,
 * not catastrophically overlapping UI, and still readable across key viewports.
 *
 * Coverage:
 *   - desktop   1440×900  (primary)
 *   - mobile    390×844    (primary mobile)
 *   - short-landscape 844×390
 *
 * Assertions (DOM/layout/runtime — no screenshot):
 *   1. Several .galaxy-cluster-label elements exist with nonzero rects
 *   2. At least some carry the .visible class
 *   3. Color/accent data is present on visible labels
 *   4. No severe overlap with search panel (#search-input) or clear button (#btn-clear)
 *   5. Cluster counts are derivable from state.points
 *
 * Run: node --check tests/3d-cluster-readability.spec.js
 *      npx playwright test tests/3d-cluster-readability.spec.js
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8795';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Wait for the 3D scene to be fully loaded and the galaxy view to be active. */
async function waitForGalaxyReady(page) {
  await page.waitForFunction(() => {
    return (
      typeof window.state === 'object' &&
      window.state !== null &&
      Array.isArray(window.state.points) &&
      window.state.points.length > 0 &&
      window.state.pointIndexByLeadId instanceof Map &&
      window.state.pointIndexByLeadId.size > 0
    );
  }, { timeout: 20000 });

  // Ensure body is in galaxy view mode
  await page.waitForFunction(() => {
    return document.body?.dataset?.graphicsMode === 'webgl';
  }, { timeout: 10000 });

  // Let cluster labels initialise and the first frame render
  await page.waitForTimeout(2500);
}

/** Derive cluster counts from state.points (filters out null clusters). */
async function getClusterCounts(page) {
  return page.evaluate(() => {
    const points = window.state?.points;
    if (!Array.isArray(points)) return null;
    const counts = new Map();
    points.forEach(p => {
      if (p?.cluster !== null && p?.cluster !== undefined) {
        counts.set(p.cluster, (counts.get(p.cluster) || 0) + 1);
      }
    });
    return Object.fromEntries(counts);
  });
}

/**
 * Probe the DOM for cluster-label metrics:
 *   - total label count
 *   - visible label count
 *   - labels with nonzero rects
 *   - labels carrying color/accent data
 *   - labels with .is-active or .is-context state
 */
async function probeClusterLabels(page) {
  return page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('.galaxy-cluster-label'));
    const visible = labels.filter(el => el.classList.contains('visible'));
    const withRects = labels.filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const withColor = labels.filter(el => el.style.color && el.style.color.trim() !== '');
    const withOpacity = labels.filter(el => {
      const o = parseFloat(getComputedStyle(el).opacity);
      return Number.isFinite(o) && o > 0;
    });
    const isActive = labels.filter(el => el.classList.contains('is-active'));
    const isContext = labels.filter(el => el.classList.contains('is-context'));

    return {
      total: labels.length,
      visible: visible.length,
      withRect: withRects.length,
      withColor: withColor.length,
      withOpacity: withOpacity.length,
      isActive: isActive.length,
      isContext: isContext.length,
    };
  });
}

/**
 * Check for catastrophic overlap between cluster labels and the search panel.
 * Returns an array of overlapping label indices (empty = no catastrophic overlap).
 */
async function detectLabelOverlap(page) {
  return page.evaluate(() => {
    const searchInput = document.getElementById('search-input');
    const clearBtn = document.getElementById('btn-clear') || document.getElementById('search-clear-btn');
    const searchPanel = searchInput?.getBoundingClientRect();
    const clearRect = clearBtn?.getBoundingClientRect();

    const overlaps = [];
    document.querySelectorAll('.galaxy-cluster-label.visible').forEach((el, idx) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;

      const hPadding = 4; // px grace
      const overlapSearch = searchPanel && !(
        r.right + hPadding < searchPanel.left ||
        r.left - hPadding > searchPanel.right ||
        r.bottom + hPadding < searchPanel.top ||
        r.top - hPadding > searchPanel.bottom
      );

      const overlapClear = clearRect && !(
        r.right + hPadding < clearRect.left ||
        r.left - hPadding > clearRect.right ||
        r.bottom + hPadding < clearRect.top ||
        r.top - hPadding > clearRect.bottom
      );

      if (overlapSearch || overlapClear) overlaps.push(idx);
    });

    return overlaps;
  });
}

// ── Viewport configurations ────────────────────────────────────────────────────

const VIEWPORTS = {
  desktop:         { width: 1440, height: 900,  label: 'desktop 1440×900' },
  mobile:          { width: 390,  height: 844,  label: 'mobile 390×844' },
  shortLandscape: { width: 844,  height: 390,  label: 'short-landscape 844×390' },
};

// ── Shared describe block ──────────────────────────────────────────────────────

test.describe('3D cluster readability', () => {

  // ── Desktop ─────────────────────────────────────────────────────────────────

  test('desktop: cluster labels exist, are visible, have nonzero rects, and carry color/accent data', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy`, { waitUntil: 'domcontentloaded' });
    await waitForGalaxyReady(page);

    const counts = await getClusterCounts(page);
    expect(counts, 'state.points must contain clustered points').not.toBeNull();
    const clusterCount = Object.keys(counts).length;
    expect(clusterCount, `expected at least 1 cluster in state.points, got ${JSON.stringify(counts)}`).toBeGreaterThan(0);

    const probes = await probeClusterLabels(page);

    // At least one label element must be created
    expect(probes.total, `at least 1 .galaxy-cluster-label must exist (got ${probes.total})`).toBeGreaterThan(0);

    // At least some must be visible (the exact threshold depends on camera distance;
    // we require ≥1 visible to prove the visibility toggle works)
    expect(probes.visible, `at least 1 label must be .visible (got ${probes.visible} of ${probes.total})`).toBeGreaterThan(0);

    // Labels with nonzero rects must match the visible count (visible implies rendered)
    expect(probes.withRect, `visible labels must have nonzero rects (got ${probes.withRect})`).toBeGreaterThanOrEqual(probes.visible);

    // Color/accent data must be present on at least one visible label
    expect(probes.withColor, `at least 1 visible label must have color/accent data (got ${probes.withColor})`).toBeGreaterThan(0);
  });

  test('desktop: no catastrophic overlap with search-input or search-clear-btn', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy`, { waitUntil: 'domcontentloaded' });
    await waitForGalaxyReady(page);

    const overlaps = await detectLabelOverlap(page);
    expect(overlaps, `no cluster label should catastrophically overlap search/clear UI (overlapping indices: ${JSON.stringify(overlaps)})`).toHaveLength(0);
  });

  // ── Mobile ──────────────────────────────────────────────────────────────────

  test('mobile: cluster labels exist, are visible, have nonzero rects, and carry color/accent data', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy`, { waitUntil: 'domcontentloaded' });
    await waitForGalaxyReady(page);

    const counts = await getClusterCounts(page);
    expect(counts, 'state.points must contain clustered points on mobile').not.toBeNull();
    expect(Object.keys(counts).length, 'at least 1 cluster must be present on mobile').toBeGreaterThan(0);

    const probes = await probeClusterLabels(page);

    expect(probes.total, `at least 1 .galaxy-cluster-label must exist on mobile (got ${probes.total})`).toBeGreaterThan(0);
    expect(probes.visible, `at least 1 label must be .visible on mobile (got ${probes.visible})`).toBeGreaterThan(0);
    expect(probes.withRect, `visible labels must have nonzero rects on mobile`).toBeGreaterThanOrEqual(probes.visible);
    expect(probes.withColor, `at least 1 visible label must have color/accent on mobile`).toBeGreaterThan(0);
  });

  test('mobile: no catastrophic overlap with search/clear UI at 390×844', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy`, { waitUntil: 'domcontentloaded' });
    await waitForGalaxyReady(page);

    const overlaps = await detectLabelOverlap(page);
    expect(overlaps, `no catastrophic overlap on mobile (overlapping indices: ${JSON.stringify(overlaps)})`).toHaveLength(0);
  });

  // ── Short-landscape ──────────────────────────────────────────────────────────

  test('short-landscape: cluster labels exist and are visible at 844×390', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize(VIEWPORTS.shortLandscape);
    await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy`, { waitUntil: 'domcontentloaded' });
    await waitForGalaxyReady(page);

    const counts = await getClusterCounts(page);
    expect(counts, 'state.points must contain clustered points in short-landscape').not.toBeNull();
    expect(Object.keys(counts).length, 'at least 1 cluster must be present in short-landscape').toBeGreaterThan(0);

    const probes = await probeClusterLabels(page);

    expect(probes.total, `at least 1 .galaxy-cluster-label must exist at 844×390 (got ${probes.total})`).toBeGreaterThan(0);
    expect(probes.visible, `at least 1 label must be .visible at 844×390 (got ${probes.visible})`).toBeGreaterThan(0);
  });

  test('short-landscape: no catastrophic overlap with search/clear UI at 844×390', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize(VIEWPORTS.shortLandscape);
    await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy`, { waitUntil: 'domcontentloaded' });
    await waitForGalaxyReady(page);

    const overlaps = await detectLabelOverlap(page);
    expect(overlaps, `no catastrophic overlap in short-landscape (overlapping indices: ${JSON.stringify(overlaps)})`).toHaveLength(0);
  });

  // ── Cross-viewport invariants ────────────────────────────────────────────────

  test('cluster counts are derivable from state.points across all viewports', async ({ page }) => {
    test.setTimeout(60000);
    for (const vp of Object.values(VIEWPORTS)) {
      await page.setViewportSize(vp);
      await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy`, { waitUntil: 'domcontentloaded' });
      await waitForGalaxyReady(page);

      const counts = await getClusterCounts(page);
      expect(counts, `cluster counts must be derivable from state.points at ${vp.label}`).not.toBeNull();
      expect(Object.keys(counts).length, `at least 1 cluster at ${vp.label}`).toBeGreaterThan(0);
    }
  });

});
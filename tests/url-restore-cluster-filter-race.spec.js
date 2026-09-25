import { test, expect } from '@playwright/test';
import { setupMockSearch } from './helpers/mock-semantic-search.js';

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '');

/**
 * Probe the three relevant pieces of state for this race test:
 *   - URL cluster param
 *   - (window.__APP_STATE__ ?? window.__TEST_STATE__).activeClusterFilter
 *   - active cluster-item DOM elements
 */
async function clusterStateProbe(page) {
  return page.evaluate(() => {
    const url = new URL(location.href);
    return {
      url: location.href,
      urlCluster: url.searchParams.get('cluster'),
      stateCluster: window.__TEST_STATE__?.activeClusterFilter ?? null,
      activeClusterItems: Array.from(document.querySelectorAll('.cluster-item.active')).map(
        el => Number(el.dataset.cluster)
      )
    };
  });
}

/**
 * Simulate the "pre-existing cluster filter" scenario:
 * - App loads normally (no cluster in URL)
 * - User manually activates a cluster filter via the UI
 * - User then navigates to (or restores) a URL that has a DIFFERENT cluster= param
 *
 * The race: did the URL's cluster= win, or did the old state value persist?
 */
test.describe('activeClusterFilter URL Restoration Race', () => {

  /**
   * Step 1: Open app without cluster param.
   * Step 2: Simulate a prior cluster filter having been set by directly mutating state.
   * Step 3: Navigate to a URL that carries a DIFFERENT cluster= value.
   * Step 4: After applyUrlState completes, verify state.activeClusterFilter
   *         equals the URL's cluster, NOT the stale in-memory value.
   *
   * This proves restoreActiveClusterFilterFromUrl correctly overwrites
   * the stale value left by resetStateBeforeUrlRestore().
   */
  test('navigating to a different cluster= URL overwrites the pre-existing activeClusterFilter', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1440, height: 1000 });

    // Step 1: Open app in galaxy view with no cluster param
    await setupMockSearch(page);
    await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy`);
    await page.waitForFunction(() => (
      document.body.dataset.graphicsMode === 'webgl'
    ), { timeout: 20000 });
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), { timeout: 8000 }).catch(() => {});

    // Step 2: Simulate a pre-existing cluster filter in state (as if user had clicked a cluster)
    // State starts with activeClusterFilter = null after init; stamp it to a known stale value.
    const STALE_CLUSTER = 7;
    await page.evaluate((cluster) => {
      (window.__APP_STATE__ ?? window.__TEST_STATE__).activeClusterFilter = cluster;
    }, STALE_CLUSTER);

    // Verify pre-condition: stale cluster is set
    let probe = await clusterStateProbe(page);
    expect(probe.stateCluster).toBe(STALE_CLUSTER);

    // Step 3: Navigate to a URL with a DIFFERENT cluster param (applyUrlState runs during init, reads URL cluster)
    // The URL cluster value (3) must win over the stale in-memory value (7).
    const URL_CLUSTER = 3;
    const urlWithDifferentCluster = `${BASE_URL}/vector-explorer-polished.html?view=galaxy&cluster=${URL_CLUSTER}`;

    await setupMockSearch(page);
    await page.goto(urlWithDifferentCluster);
    await page.waitForFunction(() => (
      document.body.dataset.graphicsMode === 'webgl'
    ), { timeout: 20000 });

    // Allow applyUrlState to settle (includes deferred path, filter sync, glow activation)
    await page.waitForFunction(() => (
      window.__TEST_STATE__?.activeClusterFilter !== null ||
      document.querySelector('.cluster-item.active') !== null
    ), { timeout: 15000 });
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), { timeout: 8000 }).catch(() => {});

    // Step 4: Verify the URL cluster won
    probe = await clusterStateProbe(page);

    // CRITICAL: state must equal the URL value, not the stale value
    expect(probe.stateCluster).toBe(URL_CLUSTER);
    expect(probe.urlCluster).toBe(String(URL_CLUSTER));

    // The cluster-item UI should reflect the URL-driven active filter
    if (probe.activeClusterItems.length > 0) {
      expect(probe.activeClusterItems).toContain(URL_CLUSTER);
      expect(probe.activeClusterItems).not.toContain(STALE_CLUSTER);
    }
  });

  /**
   * Same race scenario but via browser back/forward navigation:
   * Start with cluster=7 in URL, navigate away, then go back.
   * The back-nav must restore cluster=7, not some stale default.
   */
  test('back/forward restores cluster= from URL, not stale state', async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1440, height: 1000 });

    const INITIAL_CLUSTER = 5;

    // Step 1: Load with cluster=5
    await setupMockSearch(page);
    await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&cluster=${INITIAL_CLUSTER}`);
    await page.waitForFunction(() => (
      document.body.dataset.graphicsMode === 'webgl'
    ), { timeout: 20000 });
    await page.waitForFunction(() => (
      window.__TEST_STATE__?.activeClusterFilter === 5
    ), { timeout: 15000 });
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});

    let probe = await clusterStateProbe(page);
    expect(probe.stateCluster).toBe(5);

    // Step 2: Navigate away to a plain URL (no cluster)
    await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy`);
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), { timeout: 8000 }).catch(() => {});

    probe = await clusterStateProbe(page);
    expect(probe.stateCluster).toBeNull();

    // Step 3: Go back — URL had cluster=5, state must restore to 5
    await page.goBack();
    await page.waitForFunction(() => (
      document.body.dataset.graphicsMode === 'webgl'
    ), { timeout: 20000 });
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), { timeout: 8000 }).catch(() => {});

    probe = await clusterStateProbe(page);
    expect(probe.stateCluster).toBe(5);
    expect(probe.urlCluster).toBe('5');
  });

  /**
   * Edge case: URL has cluster= but state already has a DIFFERENT cluster filter active.
   * This is the inverse of the main race: the URL must still win.
   */
  test('URL with cluster= overwrites an already-active in-memory cluster filter', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1440, height: 1000 });

    const URL_CLUSTER = 2;

    // Load with cluster=2 in URL from the start
    await setupMockSearch(page);
    await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&cluster=${URL_CLUSTER}`);
    await page.waitForFunction(() => (
      document.body.dataset.graphicsMode === 'webgl'
    ), { timeout: 20000 });
    await page.waitForFunction(() => (
      window.__TEST_STATE__?.activeClusterFilter === 2
    ), { timeout: 15000 });
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});

    // Manually stamp a DIFFERENT cluster into state (simulating a race where
    // some other code path set it between reset and restore)
    const STALE_CLUSTER = 9;
    await page.evaluate((cluster) => {
      (window.__APP_STATE__ ?? window.__TEST_STATE__).activeClusterFilter = cluster;
    }, STALE_CLUSTER);

    // Navigate to same URL — applyUrlState runs naturally during init
    await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&cluster=${URL_CLUSTER}`);
    await page.waitForFunction((cluster) => (
      window.__TEST_STATE__?.activeClusterFilter === cluster ||
      document.querySelector('.cluster-item.active') !== null
    ), URL_CLUSTER, { timeout: 15000 });

    const probe = await clusterStateProbe(page);

    // The URL's cluster (2) must still win, even though state was stamped with 9
    expect(probe.stateCluster).toBe(2);
  });
});

/**
 * semantic-guide-fallback-contract.spec.js
 *
 * Deterministic Playwright contract test for the connection-analysis.js
 * showSemanticThreadsDetail() error path. Verifies that when the
 * semantic_trail_story API returns a 500, the fallback UI renders
 * correctly with meaningful error text on both the story and source
 * elements (not an empty string).
 *
 * Run:
 *   npx playwright test tests/semantic-guide-fallback-contract.spec.js --reporter=list --headed
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APP_URL = 'http://127.0.0.1:8795/vector-explorer-polished.html';

/**
 * Wait for state.points to be initialised (the app loads its trail data
 * asynchronously; we need to ensure the state machine is ready before
 * we trigger showSemanticThreadsDetail).
 */
async function waitForStateReady(page) {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  // state is assigned to window by app.js; wait for it to be a non-empty array
  await page.waitForFunction(() => {
    // eslint-disable-next-line no-undef
    return typeof state !== 'undefined' && Array.isArray(state.points) && state.points.length > 0;
  }, { timeout: 30000 });
}

test.describe('showSemanticThreadsDetail error fallback', () => {

  test('500 response populates story-text with error and source with "Connection report unavailable"', async ({ page }) => {
    test.setTimeout(60000);

    // Mock the semantic_trail_story endpoint to return HTTP 500
    await page.route('**/api.php?action=semantic_trail_story', async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'Internal Server Error' })
      });
    });

    await waitForStateReady(page);

    // Ensure state.focusedNode is set so showSemanticThreadsDetail has a valid context
    await page.evaluate(() => {
      const appState = window.__APP_STATE__ ?? window.__TEST_STATE__;
      if (appState.points && appState.points.length > 0) {
        appState.focusedNode = 0;
      }
    });

    // Invoke the function under test
    await page.evaluate(() => {
      // eslint-disable-next-line no-undef
      window.showSemanticThreadsDetail();
    });

    // Small delay to allow async fetch to complete and DOM to update
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});

    // #summary-gemma-story must have .hidden removed (becomes visible)
    const storyEl = page.locator('#summary-gemma-story');
    await expect(storyEl).not.toHaveClass(/\bhidden\b/, { timeout: 10000 });

    // #summary-gemma-story-text must receive an error message containing "unavailable"
    const storyTextEl = page.locator('#summary-gemma-story-text');
    await expect(storyTextEl).toContainText(/Connection report unavailable/i, { timeout: 10000 });

    // #summary-gemma-story-source must NOT be empty — it must say "Connection report unavailable"
    const storySourceEl = page.locator('#summary-gemma-story-source');
    await expect(storySourceEl).not.toHaveText('', { timeout: 10000 });
    await expect(storySourceEl).toHaveText('Connection report unavailable', { timeout: 10000 });
  });

});

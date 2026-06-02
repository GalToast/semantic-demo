/**
 * tests/gemma-fallback-error.spec.js
 *
 * Deterministic Playwright contract test verifying the fallback behavior
 * of the semantic guide synthesis when api.php?action=semantic_guide fails.
 *
 * Run:
 *   npx playwright test tests/gemma-fallback-error.spec.js --browser=chromium --headed
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8795';
const APP_URL = `${BASE_URL}/vector-explorer-polished.html?nodemo=1`;

async function waitForStateReady(page) {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  // __APP_STATE__ is assigned to window by app.js; wait for it to be a non-empty array
  await page.waitForFunction(() => {
    // eslint-disable-next-line no-undef
    return typeof __APP_STATE__ !== 'undefined'
      && Array.isArray(__APP_STATE__.points)
      && __APP_STATE__.points.length > 0
      && __APP_STATE__.eventListenersInitialized === true;
  }, { timeout: 60000 });
}

test.describe('Semantic Guide Error Fallback (Gemma Fallback)', () => {

  test('500 response on action=semantic_guide triggers deterministic fallback path and populates elements', async ({ page }) => {
    test.setTimeout(120000);

    // Mock **/api.php?action=semantic_guide to return a 500 status
    await page.route('**/api.php?action=semantic_guide', async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'Internal Server Error' })
      });
    });
    await page.route('**/api.php?action=semantic_lane_health**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, status: 'healthy' })
      });
    });

    await waitForStateReady(page);

    // Setup state so buildSemanticGuideRequestPayload returns a valid payload
    const anchorName = await page.evaluate(() => {
      return window.withStateMutation(() => {
        const s = window.__APP_STATE__ ?? window.__TEST_STATE__;
        s.currentSearchSummary = {
          query: 'coffee',
          anchorIndex: 0,
          resultIndices: [0, 1, 2, 3]
        };
        s.currentView = 'list';
        return s.points[0]?.name || '';
      });
    });

    expect(anchorName).not.toBe('');

    // Trigger through the bound button; use DOM click so visibility does not matter.
    await page.evaluate(async () => {
      window.withStateMutation(() => {
        const s = window.__APP_STATE__ ?? window.__TEST_STATE__;
        s.currentSearchSummary = {
          query: 'coffee',
          anchorIndex: 0,
          resultIndices: [0, 1, 2, 3]
        };
        s.currentView = 'list';
      });
      const trigger = document.getElementById('synthesize-trigger');
      if (trigger) {
        trigger.hidden = false;
        trigger.classList.remove('hidden');
        trigger.style.display = 'block';
      }
      const button = document.getElementById('btn-synthesize');
      if (button) button.disabled = false;
      button?.onclick?.(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    });

    // Small delay to allow async fetch to reject and DOM to update
    await page.waitForTimeout(500);

    // Assertions:
    // 1. #semantic-summary-card has .is-synthesizing removed and is not .hidden
    const cardEl = page.locator('#semantic-summary-card');
    await expect(cardEl).not.toHaveClass(/\bhidden\b/, { timeout: 10000 });
    await expect(cardEl).not.toHaveClass(/\bis-synthesizing\b/, { timeout: 10000 });

    // 2. #summary-card-title-text matches client-side fallback value (uppercase with anchors this trail)
    const titleEl = page.locator('#summary-card-title-text');
    const expectedTitle = `${anchorName} anchors this trail`.toUpperCase();
    await expect(titleEl).toHaveText(expectedTitle, { timeout: 10000 });

    // 3. #summary-text is populated by the fallback summary generator
    const textEl = page.locator('#summary-text');
    await expect(textEl).toContainText(/Logical mapping of 4 matches for "coffee"/i, { timeout: 10000 });

    // 4. #summary-suggestions has populated suggestion buttons with correct data attributes
    const suggestionsEl = page.locator('#summary-suggestions');
    const buttons = suggestionsEl.locator('button.suggestion-btn');
    await expect(buttons).toHaveCount(3, { timeout: 10000 });

    // Verify data-lead-id attributes exist and correspond to the results
    const leadIds = await page.evaluate(() => {
      const s = window.__APP_STATE__ ?? window.__TEST_STATE__;
      return s.points.slice(0, 3).map(p => String(p.lead_id));
    });

    for (let i = 0; i < 3; i++) {
      const button = buttons.nth(i);
      const dataLeadId = await button.getAttribute('data-lead-id');
      expect(dataLeadId).toBe(leadIds[i]);
    }

    // 5. #summary-lane-status has 'Deterministic fallback active'
    const statusEl = page.locator('#summary-lane-status');
    await expect(statusEl).toHaveText('Deterministic fallback active', { timeout: 10000 });
  });

});

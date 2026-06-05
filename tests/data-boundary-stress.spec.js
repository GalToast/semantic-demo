import { test, expect } from '@playwright/test';

// Malicious mock data payload
const MOCK_DATA = [
  // 1. Unbreakable extremely long name
  [
    0.5, 0.5, 0.5, 1, 
    "THIS_IS_A_MASSIVE_UNBREAKABLE_STRING_THAT_SHOULD_HOPEFULLY_TRIGGER_WORD_WRAP_OR_TEXT_OVERFLOW_FAILURES_IF_CSS_IS_NOT_ROBUST_ENOUGH_TO_HANDLE_IT_PROPERLY", 
    "Extreme category length that goes on and on and on and on and on and on and on and on", 
    "Conroe", 9001, 30.3, -95.4, 
    "https://this-is-a-super-long-domain-name-that-might-overflow.com/very/long/path/name/here/it/goes", 
    "super.long.email.address.that.might.break.layout@extreme-domain-name.co.uk", 
    "+1 (555) 123-4567 ext 890123456789", 
    "This is a massive description. ".repeat(20), 
    "active"
  ],
  // 2. Missing fields and empty strings
  [
    0.6, 0.6, 0.6, 1, 
    "", 
    "", 
    "", 9002, 30.4, -95.5, 
    null, null, null, 
    "", 
    "active"
  ],
  // 3. HTML injection test
  [
    0.7, 0.7, 0.7, 1, 
    "<b>Bold Name</b><script>alert(1)</script>", 
    "<i>Category</i>", 
    "Conroe", 9003, 30.5, -95.6, 
    null, null, null, 
    "<b>Description</b>", 
    "active"
  ]
];

// Mock massive connections for node 9001
const MOCK_THREADS = [];
for (let i = 0; i < 500; i++) {
  MOCK_THREADS.push({
    source: 9001,
    target: 8000 + i, // Target fake nodes
    type: "extreme_connection",
    weight: Math.random()
  });
}

test.describe('Data Boundary Stress Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept data.dat
    await page.route('**/data.dat', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_DATA)
      });
    });

    // Intercept semantic_threads.dat
    await page.route('**/semantic_threads.dat', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_THREADS)
      });
    });
  });

  test('Layouts survive extreme unbreakable strings without X overflow', async ({ page }) => {
    await page.goto('http://127.0.0.1:8795/vector-explorer-polished.html?view=galaxy', { waitUntil: 'networkidle' });

    // Ensure we trigger the search or focus state on the malformed node
    await page.evaluate(() => {
      if (window.__APP_ACTIONS__ && window.__APP_ACTIONS__.triggerSearch) {
        window.__APP_ACTIONS__.triggerSearch('THIS_IS_A_MASSIVE');
      }
    });

    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {}); // Wait for UI to render search results

    // Check if any element is overflowing the viewport width
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    // Also check the specific search container / info panel
    const infoPanelOverflow = await page.evaluate(() => {
      const panel = document.querySelector('.info-panel');
      if (!panel) return false;
      return panel.scrollWidth > panel.clientWidth;
    });

    expect(hasHorizontalOverflow).toBeFalsy();
    expect(infoPanelOverflow).toBeFalsy();

    // Now force focus onto the node
    await page.evaluate(() => {
      if (window.__APP_ACTIONS__ && window.__APP_ACTIONS__.focusNode) {
        window.__APP_ACTIONS__.focusNode(9001, 'search');
      }
    });

    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {}); // Wait for UI to render selected card

    // Check for overflow in selected card
    const cardOverflow = await page.evaluate(() => {
      const card = document.querySelector('.selected-card');
      if (!card) return false;
      return card.scrollWidth > card.clientWidth;
    });

    expect(cardOverflow).toBeFalsy();
  });
});

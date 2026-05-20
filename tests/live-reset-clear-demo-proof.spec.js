import { test, expect } from '@playwright/test';

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '');
const STORAGE_KEY = 'moco_mycelium_demo_v1';

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

async function mockSemanticSearch(page) {
  await page.route('**/api.php?action=semantic_lane_health**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEMANTIC_HEALTH_STUB) });
  });
  await page.route('**/api.php?action=semantic_search**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEARCH_STUB) });
  });
}

async function waitForSearchResults(page, query = 'coffee') {
  try {
    await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 8000 });
  } catch {
    await page.evaluate((searchQuery) => {
      if (typeof window.search === 'function') window.search(searchQuery);
    }, query);
    await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 15000 });
  }
}

test.describe('live clear-search and demo reset proof', () => {
  test.beforeEach(async ({ page }) => {
    await mockSemanticSearch(page);
  });

  test('clear button appears for a query and clears live search results', async ({ page }) => {
    test.setTimeout(45000);

    await page.goto(`${BASE_URL}/vector-explorer-polished.html`);
    await page.waitForFunction(() => typeof window.clearSearch === 'function', { timeout: 20000 });

    const searchInput = page.locator('#search-input');
    const clearBtn = page.locator('#search-clear-btn');

    await expect(clearBtn).not.toBeVisible();

    await searchInput.fill('coffee');
    await expect(clearBtn).toBeVisible();
    await waitForSearchResults(page, 'coffee');

    await clearBtn.click();

    await expect(searchInput).toHaveValue('');
    await expect(clearBtn).not.toBeVisible();
    await expect(page.locator('#search-results .search-result-item')).toHaveCount(0);
  });

  test('clear button is keyboard operable', async ({ page }) => {
    test.setTimeout(45000);

    await page.goto(`${BASE_URL}/vector-explorer-polished.html`);
    await page.waitForFunction(() => typeof window.clearSearch === 'function', { timeout: 20000 });

    const searchInput = page.locator('#search-input');
    const clearBtn = page.locator('#search-clear-btn');

    await searchInput.fill('cafe');
    await expect(clearBtn).toBeVisible();

    await clearBtn.focus();
    await page.keyboard.press('Enter');

    await expect(searchInput).toHaveValue('');
    await expect(clearBtn).not.toBeVisible();
  });

  test('Escape during forced demo cancels demo and returns to overview', async ({ page }) => {
    test.setTimeout(60000);

    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.addInitScript(({ key }) => {
      localStorage.removeItem(key);
      sessionStorage.clear();
      window.__demoResetProof = { cancelled: false };
      window.addEventListener('demo-cancelled', () => {
        window.__demoResetProof.cancelled = true;
      }, { once: true });
    }, { key: STORAGE_KEY });

    await page.goto(`${BASE_URL}/vector-explorer-polished.html?demo=force`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#micro-demo-pill', { state: 'visible', timeout: 15000 });
    await expect.poll(async () => page.evaluate(() => window.demoController?.isRunning?.() ?? false)).toBe(true);

    await page.keyboard.press('Escape');

    await expect.poll(async () => page.evaluate(() => window.demoController?.isRunning?.() ?? false)).toBe(false);
    await expect.poll(async () => page.evaluate(() => window.state?.navState?.mode ?? 'unknown')).toBe('overview');
    await expect.poll(async () => page.evaluate(() => window.state?.focusedNode)).toBeNull();
    await expect(page.locator('#search-input')).toHaveValue('');

    const demoProof = await page.evaluate(() => window.__demoResetProof);
    expect(demoProof.cancelled, 'Escape must emit demo-cancelled while demo is active').toBe(true);

    const realErrors = errors.filter(e => !e.includes('net::ERR') && !e.includes('Failed to load resource'));
    expect(realErrors, `Unexpected console errors: ${JSON.stringify(realErrors)}`).toHaveLength(0);
  });
});

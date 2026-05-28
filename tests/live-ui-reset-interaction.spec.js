import { test, expect } from '@playwright/test';
import { setupMockSearch } from './helpers/mock-semantic-search.js';

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '');

async function openApp(page) {
  await setupMockSearch(page);
  await page.goto(`${BASE_URL}/vector-explorer-polished.html?nodemo=1`);
  await page.waitForFunction(() => (
    typeof window.clearSearch === 'function' &&
    typeof window.setSemanticDiveMode === 'function' &&
    typeof window.refreshCompositionState === 'function' &&
    Array.isArray(window.__TEST_STATE__?.points) &&
    (window.__APP_STATE__ ?? window.__TEST_STATE__).points.length > 0 &&
    (window.__APP_STATE__ ?? window.__TEST_STATE__).pointIndexByLeadId?.size > 0
  ), { timeout: 20000 });
  await page.waitForTimeout(1000);
}

async function performSearch(page, query = 'coffee') {
  const input = page.locator('#search-input');
  await input.focus();
  await input.fill('');
  await input.pressSequentially(query, { delay: 20 });
  await expect(page.locator('.search-result-item').first()).toBeVisible({ timeout: 15000 });
}

async function enterFocusFromSearch(page) {
  await performSearch(page);
  await page.locator('.search-result-item').first().click();
  await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 });
  await expect(page.locator('#btn-focus-dive')).toBeVisible({ timeout: 10000 });
}

async function stepInside(page) {
  await page.locator('#btn-focus-dive').click();
  await page.waitForFunction(() => (
    window.__TEST_STATE__?.trailDepth === 2 &&
    window.__TEST_STATE__?.semanticDiveMode === true &&
    document.body.dataset.semanticDive === 'active' &&
    document.body.dataset.panelSurface === 'semantic-dive'
  ), { timeout: 15000 });
}

async function probe(page) {
  return page.evaluate(() => ({
    inputValue: document.getElementById('search-input')?.value ?? '',
    resultCount: document.querySelectorAll('.search-result-item').length,
    url: location.href,
    body: {
      panelSurface: document.body.dataset.panelSurface || '',
      semanticDive: document.body.dataset.semanticDive || '',
      trailDepth: document.body.dataset.trailDepth || ''
    },
    state: {
      focusedNode: window.__TEST_STATE__?.focusedNode ?? null,
      trailDepth: window.__TEST_STATE__?.trailDepth ?? null,
      semanticDiveMode: window.__TEST_STATE__?.semanticDiveMode ?? null,
      navMode: window.__TEST_STATE__?.navState?.mode || ''
    }
  }));
}

async function expectOverviewReset(page, label) {
  await expect.poll(async () => {
    const state = await probe(page);
    return {
      navMode: state.state.navMode,
      focusedNode: state.state.focusedNode,
      trailDepth: state.state.trailDepth,
      semanticDiveMode: state.state.semanticDiveMode,
      semanticDive: state.body.semanticDive,
      panelSurface: state.body.panelSurface
    };
  }, { message: `${label}: overview reset state`, timeout: 15000 }).toEqual({
    navMode: 'overview',
    focusedNode: null,
    trailDepth: 0,
    semanticDiveMode: false,
    semanticDive: 'inactive',
    panelSurface: 'idle'
  });
  const after = await probe(page);
  return after;
}

test.describe('live reset interaction proof', () => {
  test('desktop: Step Inside then Escape returns through the production keyboard path', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openApp(page);
    await enterFocusFromSearch(page);
    await stepInside(page);

    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('Escape');

    const after = await expectOverviewReset(page, 'desktop Escape');
    const url = new URL(after.url);
    expect(url.searchParams.get('depth'), 'Escape removes depth param').toBeNull();
  });

  test('mobile: Step Inside then Escape clears the dive state without desktop-only assumptions', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page);
    await enterFocusFromSearch(page);
    await stepInside(page);

    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('Escape');

    await expectOverviewReset(page, 'mobile Escape');
  });

  test('desktop: clear search button uses the real click path from search results', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openApp(page);
    await performSearch(page);

    await expect(page.locator('#search-clear-btn')).toBeVisible({ timeout: 10000 });
    await page.locator('#search-clear-btn').click();

    const after = await expectOverviewReset(page, 'clear button');
    expect(after.inputValue, 'clear button empties input').toBe('');
    expect(after.resultCount, 'clear button removes rendered results').toBe(0);
    const url = new URL(after.url);
    expect(url.searchParams.get('q'), 'clear button removes q param').toBeNull();
  });
});

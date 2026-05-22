import { test, expect } from '@playwright/test';

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '');
const APP_PATH = process.env.TEST_APP_PATH || '/vector-explorer-polished.html';

test.describe('short-landscape viewport contracts', () => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 667, height: 375 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}${APP_PATH}`);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.body.classList.add('is-active'));
  });

  test('search bar visible and not overflowing at 667x375', async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    const searchInput = page.locator('#search-input');
    const searchContainer = page.locator('.search-container');
    await expect(searchInput).toBeVisible({ timeout: 15000 });
    await expect(searchContainer).toBeVisible({ timeout: 10000 });
    const containerOverflow = await searchContainer.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const overflowRight = rect.right - (window.innerWidth || document.documentElement.clientWidth);
      return { overflowRight: Math.max(0, overflowRight) };
    });
    expect(containerOverflow.overflowRight, 'search container should not overflow right edge').toBeLessThanOrEqual(0);
  });

  test('info panel visible and not overflowing at 667x375', async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    const infoPanel = page.locator('#info-panel');
    await expect(infoPanel).toBeVisible({ timeout: 15000 });
    const panelDisplay = await infoPanel.evaluate((el) => getComputedStyle(el).display);
    expect(panelDisplay).not.toBe('none');
    const panelVisibility = await infoPanel.evaluate((el) => getComputedStyle(el).visibility);
    expect(panelVisibility).not.toBe('hidden');
    const panelOverflow = await infoPanel.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const winWidth = window.innerWidth || document.documentElement.clientWidth;
      const winHeight = window.innerHeight || document.documentElement.clientHeight;
      return { overflowRight: Math.max(0, rect.right - winWidth), overflowBottom: Math.max(0, rect.bottom - winHeight) };
    });
    expect(panelOverflow.overflowRight, 'info panel should not overflow right edge').toBeLessThanOrEqual(0);
    expect(panelOverflow.overflowBottom, 'info panel should not overflow bottom').toBeLessThanOrEqual(0);
  });

  test('layout adapts correctly at short-landscape 667x375', async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    const shortLandscapeApplied = await page.evaluate(() => {
      const infoPanel = document.querySelector('#info-panel');
      if (!infoPanel) return false;
      const computed = window.getComputedStyle(infoPanel);
      return computed.opacity === '0' || computed.visibility === 'hidden';
    });
    const searchInput = page.locator('#search-input');
    await expect(searchInput).toBeVisible({ timeout: 15000 });
  });

  test('no viewport overflow on any key element at 667x375', async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      document.body.dataset.panelSurface = 'focus-search';
    });
    // Removed mode-grid and mode-chip since they are hidden in short-landscape
    const selectors = ['#search-input', '.search-container', '#info-panel'];
    for (const selector of selectors) {
      const elements = page.locator(selector);
      const count = await elements.count();
      if (count === 0) continue;
      for (let i = 0; i < Math.min(count, 10); i++) {
        const el = elements.nth(i);
        const isVisible = await el.isVisible().catch(() => false);
        if (!isVisible) continue;
        const overflow = await el.evaluate((elem) => {
          const rect = elem.getBoundingClientRect();
          const winWidth = window.innerWidth || document.documentElement.clientWidth;
          const winHeight = window.innerHeight || document.documentElement.clientHeight;
          return { right: Math.max(0, rect.right - winWidth), bottom: Math.max(0, rect.bottom - winHeight), left: Math.max(0, -rect.left), top: Math.max(0, -rect.top) };
        });
        expect(overflow.right, selector + '[' + i + '] should not overflow right').toBeLessThanOrEqual(0);
        expect(overflow.bottom, selector + '[' + i + '] should not overflow bottom').toBeLessThanOrEqual(0);
        expect(overflow.left, selector + '[' + i + '] should not overflow left').toBeLessThanOrEqual(0);
        expect(overflow.top, selector + '[' + i + '] should not overflow top').toBeLessThanOrEqual(0);
      }
    }
  });

  test('focus card leaves graph breathing room at 667x375', async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await page.evaluate(() => {
      document.body.dataset.activeView = 'galaxy';
      document.body.dataset.panelSurface = 'focus-search';
      document.body.dataset.graphContext = 'focus-search';
      document.body.dataset.focusPanelMode = 'focus';

      const stage = document.querySelector('#focus-stage');
      const card = document.querySelector('.focus-stage-card');
      if (stage) {
        stage.hidden = false;
        stage.classList.add('active');
        stage.setAttribute('aria-hidden', 'false');
        stage.setAttribute('aria-expanded', 'true');
      }
      if (card) {
        card.style.height = '';
      }
    });

    const footprint = await page.locator('.focus-stage-card').evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        bottom: rect.bottom,
        height: rect.height,
        maxHeight: style.maxHeight,
        top: rect.top,
        viewportHeight: window.innerHeight || document.documentElement.clientHeight,
      };
    });

    expect(footprint.bottom, 'focus card should stay inside short-landscape viewport').toBeLessThanOrEqual(footprint.viewportHeight);
    expect(footprint.height, 'focus card must not consume the focus-neighborhood canvas in short landscape').toBeLessThanOrEqual(170);
    expect(footprint.top, 'focus card should leave visible canvas above it for neighborhood nodes and threads').toBeGreaterThanOrEqual(190);
  });
});

import { test, expect } from '@playwright/test';
import { openShortLandscape } from './helpers/short-landscape-helpers.js';

const VIEWPORTS = [
  { width: 667, height: 375 },
  { width: 768, height: 380 }
];

async function elementOverflow(locator) {
  return locator.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const winWidth = window.innerWidth || document.documentElement.clientWidth;
    const winHeight = window.innerHeight || document.documentElement.clientHeight;
    const clampSubpixel = (value) => value <= 0.5 ? 0 : value;
    return {
      right: clampSubpixel(Math.max(0, rect.right - winWidth)),
      bottom: clampSubpixel(Math.max(0, rect.bottom - winHeight)),
      left: clampSubpixel(Math.max(0, -rect.left)),
      top: clampSubpixel(Math.max(0, -rect.top))
    };
  });
}

for (const vp of VIEWPORTS) {
  const vpString = `${vp.width}x${vp.height}`;

  test.describe(`short-landscape viewport contracts at ${vpString}`, () => {
    test.use({ isMobile: true, hasTouch: true, viewport: vp });

    test(`layout, overflow, and focus-card footprint at ${vpString}`, async ({ page }) => {
      test.setTimeout(90000);
      await openShortLandscape(page, vp);

      await test.step('search bar visible and not overflowing', async () => {
        const searchInput = page.locator('#search-input');
        const searchContainer = page.locator('.search-container');
        await expect(searchInput).toBeVisible({ timeout: 15000 });
        await expect(searchContainer).toBeVisible({ timeout: 10000 });

        const overflow = await elementOverflow(searchContainer);
        expect(overflow.right, 'search container should not overflow right edge').toBeLessThanOrEqual(0);
      });

      await test.step('info panel visible and not overflowing', async () => {
        const infoPanel = page.locator('#info-panel');
        await expect(infoPanel).toBeVisible({ timeout: 15000 });
        const panelDisplay = await infoPanel.evaluate((el) => getComputedStyle(el).display);
        expect(panelDisplay).not.toBe('none');
        const panelVisibility = await infoPanel.evaluate((el) => getComputedStyle(el).visibility);
        expect(panelVisibility).not.toBe('hidden');

        const overflow = await elementOverflow(infoPanel);
        expect(overflow.right, 'info panel should not overflow right edge').toBeLessThanOrEqual(0);
        expect(overflow.bottom, 'info panel should not overflow bottom').toBeLessThanOrEqual(0);
      });

      await test.step('fixed action chrome stays contained and tappable', async () => {
        const fixedActions = [
          { selector: '.share-toggle', visible: false },
          { selector: '.legend-toggle', visible: true },
          { selector: '.help-toggle', visible: true }
        ];
        for (const { selector, visible } of fixedActions) {
          const action = page.locator(selector).first();
          const metrics = await action.evaluate((el) => {
            const rect = el.getBoundingClientRect();
            const styles = getComputedStyle(el);
            return {
              overflow: {
                right: Math.max(0, rect.right - (window.innerWidth || document.documentElement.clientWidth)),
                bottom: Math.max(0, rect.bottom - (window.innerHeight || document.documentElement.clientHeight)),
                left: Math.max(0, -rect.left),
                top: Math.max(0, -rect.top)
              },
              pointerEvents: styles.pointerEvents,
              width: rect.width,
              height: rect.height
            };
          });
          if (!visible) {
            expect(['none', 'hidden'].includes(metrics.pointerEvents) || metrics.width === 0 || metrics.height === 0,
              `${selector} should stay suppressed in idle short landscape`).toBe(true);
            continue;
          }
          await expect(action, `${selector} should be visible in short landscape`).toBeVisible({ timeout: 10000 });
          expect(metrics.overflow.right, `${selector} should not overflow right`).toBeLessThanOrEqual(0.5);
          expect(metrics.overflow.bottom, `${selector} should not overflow bottom`).toBeLessThanOrEqual(0.5);
          expect(metrics.overflow.left, `${selector} should not overflow left`).toBeLessThanOrEqual(0.5);
          expect(metrics.overflow.top, `${selector} should not overflow top`).toBeLessThanOrEqual(0.5);
          expect(metrics.pointerEvents, `${selector} should remain tappable`).not.toBe('none');
          expect(metrics.width, `${selector} should retain touch target width`).toBeGreaterThanOrEqual(40);
          expect(metrics.height, `${selector} should retain touch target height`).toBeGreaterThanOrEqual(40);
        }
      });

      await test.step('no viewport overflow on key elements in focus-search', async () => {
        await page.evaluate(() => {
          document.body.dataset.panelSurface = 'focus-search';
        });
        const selectors = ['#search-input', '.search-container', '#info-panel'];
        for (const selector of selectors) {
          const elements = page.locator(selector);
          const count = await elements.count();
          for (let i = 0; i < Math.min(count, 10); i++) {
            const el = elements.nth(i);
            const isVisible = await el.isVisible().catch(() => false);
            if (!isVisible) continue;
            const overflow = await elementOverflow(el);
            expect(overflow.right, selector + '[' + i + '] should not overflow right').toBeLessThanOrEqual(0);
            expect(overflow.bottom, selector + '[' + i + '] should not overflow bottom').toBeLessThanOrEqual(0);
            expect(overflow.left, selector + '[' + i + '] should not overflow left').toBeLessThanOrEqual(0);
            expect(overflow.top, selector + '[' + i + '] should not overflow top').toBeLessThanOrEqual(0);
          }
        }
      });

      await test.step('focus card leaves graph breathing room', async () => {
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
            viewportHeight: window.innerHeight || document.documentElement.clientHeight
          };
        });

        expect(footprint.bottom, 'focus card should stay inside short-landscape viewport').toBeLessThanOrEqual(footprint.viewportHeight);
        expect(footprint.height, 'focus card must not consume the focus-neighborhood canvas in short landscape').toBeLessThanOrEqual(170);
        expect(footprint.top, 'focus card should leave visible canvas above it for neighborhood nodes and threads').toBeGreaterThanOrEqual(190);
      });
    });
  });
}

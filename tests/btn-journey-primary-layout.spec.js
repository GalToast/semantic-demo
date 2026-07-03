import { test, expect } from '@playwright/test';

/**
 * Regression test: btn-journey-primary (the primary .journey-compass-action button) must not
 * overflow its container on mobile viewports.
 *
 * Bug: .journey-compass-action.primary had no box-sizing or overflow constraints, causing
 * text content to spill 2–10px beyond the button boundary on narrow viewports.
 *
 * Fix: Added to .journey-compass-action.primary:
 *   - box-sizing: border-box
 *   - max-width: 100%
 *   - overflow: hidden
 *   - text-overflow: ellipsis
 *   - white-space: nowrap
 * And to .journey-compass-action (mobile base):
 *   - box-sizing: border-box
 *   - max-width: 100%
 *   - overflow: hidden
 *   - text-overflow: ellipsis
 *   - white-space: nowrap
 *
 * Run: TEST_BASE_URL=http://127.0.0.1:9876 npx playwright test tests/btn-journey-primary-layout.spec.js --headed
 */
test.describe('btn-journey-primary mobile overflow regression', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

  test('btn-journey-primary does not overflow its container at 390px width', async ({ page }) => {
    test.setTimeout(30000);
    const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:9876').replace(/\/$/, '');

    await page.goto(`${BASE_URL}/index.html`);
    await page.waitForSelector('#btn-journey-primary', { state: 'visible', timeout: 20000 });

    // Get the button and its nearest scrollable ancestor
    const overflowInfo = await page.evaluate(() => {
      const btn = document.getElementById('btn-journey-primary');
      if (!btn) return null;

      // Walk up the DOM to find a container with overflow (scroll/auto hidden)
      let container = btn.parentElement;
      while (container) {
        const overflow = getComputedStyle(container).overflowX;
        if (overflow === 'hidden' || overflow === 'auto') break;
        container = container.parentElement;
        if (!container || container === document.body || container === document.documentElement) {
          container = btn.parentElement;
          break;
        }
      }

      const btnRect = btn.getBoundingClientRect();
      const containerRect = container ? container.getBoundingClientRect() : btnRect;

      return {
        btnRight: btnRect.right,
        btnLeft: btnRect.left,
        containerRight: containerRect.right,
        containerLeft: containerRect.left,
        overflowPx: btnRect.right - containerRect.right,
        containerOverflow: container ? getComputedStyle(container).overflow : 'unknown'
      };
    });

    expect(overflowInfo, 'btn-journey-primary must be present').not.toBeNull();
    expect(
      overflowInfo.overflowPx,
      `btn-journey-primary overflows container by ${overflowInfo.overflowPx}px — must be ≤ 0`
    ).toBeLessThanOrEqual(0);
  });

  test('btn-journey-primary has box-sizing: border-box and text-overflow: ellipsis', async ({ page }) => {
    test.setTimeout(30000);
    const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:9876').replace(/\/$/, '');

    await page.goto(`${BASE_URL}/index.html`);
    await page.waitForSelector('#btn-journey-primary', { state: 'visible', timeout: 20000 });

    const styleProps = await page.evaluate(() => {
      const btn = document.getElementById('btn-journey-primary');
      if (!btn) return null;
      const cs = getComputedStyle(btn);
      return {
        boxSizing: cs.boxSizing,
        overflow: cs.overflow,
        textOverflow: cs.textOverflow,
        whiteSpace: cs.whiteSpace
      };
    });

    expect(styleProps, 'btn-journey-primary must exist').not.toBeNull();
    expect(styleProps.boxSizing).toBe('border-box');
    expect(styleProps.overflow).toBe('hidden');
    expect(styleProps.textOverflow).toBe('ellipsis');
    expect(styleProps.whiteSpace).toBe('nowrap');
  });
});

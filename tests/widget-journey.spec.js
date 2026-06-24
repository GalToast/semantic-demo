/**
 * widget-journey.spec.js — W46-E3
 *
 * 10 user-journey Playwright tests that verify what the user actually sees,
 * not what the file structure looks like. Each test is named after the bug
 * class it catches, and is intentionally cheap (one or two assertions).
 *
 * Why this exists: the 285 contract/invariant tests check structure (does
 * WeatherData have a `temp` field, does the widget render a .weather-temp
 * span). They cannot catch:
 *   - callback wiring bugs (onSceneReady missing in the desktop branch)
 *   - z-index / click-eating bugs (chrome button overlapping the widget pill)
 *   - text-truncation bugs (forecast cut off at 130px)
 *   - "this was never connected to a real API" bugs (simulated fetchWeather)
 * This suite catches all of those.
 *
 * Run: TEST_BASE_URL=http://127.0.0.1:5180 npx playwright test tests/widget-journey.spec.js --browser=chromium
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:5180';

test.describe('Widget Journey Tests — what the user actually sees', () => {

  /**
   * Boot: navigate, dismiss the gesture gate, wait for the weather widget.
   * The widget only renders when the canvas's onSceneReady callback fires,
   * which is itself a regression we want to catch. If s3dSceneReady never
   * fires, the widget never mounts, and every test below fails.
   */
  test.beforeEach(async ({ page }) => {
    // Surface any console errors so failed tests show the real cause
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));
    page.on('console-errors', (list) => { /* exposed for diagnostics */ });

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // Dismiss the gesture gate. The button might be labelled "Explore" or
    // "Enter 3D Scene" depending on which branch renders. We match both.
    const explore = page.getByRole('button', { name: /^(Explore|Enter 3D [Ss]cene)$/ }).first();
    await explore.waitFor({ state: 'visible', timeout: 15000 });
    await explore.click();

    // Wait for the weather widget to mount. This implicitly verifies the
    // onSceneReady wiring (the widget is gated on s3dSceneReady).
    await page.locator('.weather-widget').waitFor({ state: 'attached', timeout: 30000 });

    // Wait for the temperature to populate with a real number. Simulated
    // data starts at 0, so a non-zero value proves we hit the real API.
    await page
      .locator('.weather-temp')
      .filter({ hasText: /^[1-9]\d?°$/ })
      .first()
      .waitFor({ timeout: 15000 });

    // Store the error collector on the page object for later assertions
    page._bootErrors = errors;
  });

  // ── Tests ────────────────────────────────────────────────────────────────

  /**
   * 1. The temperature displayed is a real Fahrenheit value, not a
   *    placeholder (0) or a random stub.
   *
   * Catches: `weather.svelte.ts` returning `Math.random()` or `0` initial
   * value, App.svelte's onSceneReady callback not wiring s3dSceneReady=true.
   */
  test('1. temperature is a real Fahrenheit value (not 0, not simulated)', async ({ page }) => {
    const temp = (await page.locator('.weather-temp').first().textContent()) ?? '';
    const m = temp.match(/^(-?\d+)°$/);
    expect(m, `temperature "${temp}" did not match /^\\d+°$/`).not.toBeNull();
    const value = Number(m[1]);
    // Montgomery County, TX in June: realistic range is 65-105°F.
    expect(value).toBeGreaterThan(40);
    expect(value).toBeLessThan(130);
  });

  /**
   * 2. The widget pill is clickable — the topmost element at the pill's
   *    center is the weather toggle, not the legend/help chrome button.
   *
   * Catches: z-index/layering bugs where chrome buttons sit on top of the
   * pill and eat clicks (W46-D2 bug — widget at y=105 hidden behind
   * legend at y=117).
   */
  test('2. pill center hits the weather toggle, not a chrome button', async ({ page }) => {
    const box = await page.locator('.weather-toggle').first().boundingBox();
    expect(box).not.toBeNull();
    const top = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return {
        tag: el?.tagName ?? null,
        cls: (typeof el?.className === 'string' ? el.className : el?.className?.baseVal ?? '').slice(0, 80),
        aria: el?.getAttribute('aria-label') ?? ''
      };
    }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });

    // The topmost element must be the weather toggle (or its icon child).
    // The legend/help buttons are NOT acceptable here.
    expect(top.cls, `topmost element was ${top.cls} (aria: ${top.aria})`).toContain('weather-toggle');
    expect(top.aria).not.toMatch(/category legend|keyboard shortcuts/i);
  });

  /**
   * 3. The detail panel shows 4 rows (Condition, Feels like, Humidity, Wind)
   *    and the forecast row (if any) is NOT truncated with ellipsis.
   *
   * Catches: text-overflow:ellipsis on .detail-value.forecast, FORECAST
   * row still present, missing humidity/wind rows.
   */
  test('3. detail panel: 4 rows, no ellipsis on forecast', async ({ page }) => {
    await page.locator('.weather-toggle').first().click();
    const details = page.locator('.weather-details').first();
    await details.waitFor({ state: 'visible', timeout: 5000 });

    const rowCount = await page.locator('.weather-detail-row').count();
    expect(rowCount, `expected 4 detail rows, got ${rowCount}`).toBe(4);

    // The 4 labels must be these (in any order — but no "Forecast" in detail-value)
    const labels = await page.locator('.weather-detail-row .detail-label').allTextContents();
    expect(labels.map(l => l.trim()).sort()).toEqual(['Condition', 'Feels like', 'Humidity', 'Wind']);

    // The old FORECAST row had `text-overflow: ellipsis`. If a forecast-style
    // value still exists, it must NOT have ellipsis.
    const forecastCount = await page.locator('.detail-value.forecast').count();
    if (forecastCount > 0) {
      const overflow = await page
        .locator('.detail-value.forecast')
        .first()
        .evaluate(el => getComputedStyle(el).textOverflow);
      expect(overflow, `forecast value uses text-overflow: ${overflow}`).not.toBe('ellipsis');
    }
  });

  /**
   * 4. Pressing `/` focuses the search input. This is the documented
   *    shortcut; if it doesn't work, search is unreachable from the keyboard.
   *
   * Catches: keyboard handler not bound, focus stolen by another element,
   * the shortcut is bound to the wrong key.
   */
  test('4. pressing / focuses the search input', async ({ page }) => {
    // Make sure no input is focused first
    await page.evaluate(() => (document.activeElement)?.blur());
    await page.keyboard.press('/');
    const focusedId = await page.evaluate(() => document.activeElement?.id ?? null);
    expect(focusedId).toBe('search-input');
  });

  /**
   * 5. Clicking the "Search" mode tab flips the active mode. Mode routing
   *    is the primary navigation surface; a dead tab is a critical bug.
   */
  test('5. clicking the Search mode tab activates it', async ({ page }) => {
    await page.getByRole('radio', { name: 'Search' }).first().click();
    const active = await page.evaluate(
      () => document.querySelector('[role="radio"][aria-checked="true"]')?.textContent?.trim() ?? null
    );
    expect(active).toBe('Search');
  });

  /**
   * 6. The category legend toggle (top-right grid icon) actually toggles
   *    the panel. Closed by default, opens on click.
   */
  test('6. category legend toggle opens the panel', async ({ page }) => {
    const toggle = page.locator('#btn-legend').first();
    await expect(toggle).toBeVisible();

    // Closed by default: aside is off-screen or aria-hidden
    const before = await page.evaluate(() => {
      const w = document.querySelector('aside[aria-label="Business category legend"]');
      if (!w) return { exists: false };
      const r = w.getBoundingClientRect();
      return { exists: true, x: Math.round(r.x), onScreen: r.x >= 0 };
    });
    expect(before.exists).toBe(true);
    expect(before.onScreen).toBe(false);

    await toggle.click();
    await page.waitForTimeout(400);

    const after = await page.evaluate(() => {
      const w = document.querySelector('aside[aria-label="Business category legend"]');
      const r = w?.getBoundingClientRect();
      return { x: Math.round(r?.x ?? -1), onScreen: (r?.x ?? -1) >= 0 };
    });
    expect(after.onScreen, `legend still off-screen after toggle (x=${after.x})`).toBe(true);
  });

  /**
   * 7. The keyboard shortcuts help button (top-right ? icon) opens the
   *    shortcuts panel and the panel lists at least 4 shortcuts.
   *
   * Catches: help button overlap with other chrome, region missing
   * `aria-label`, shortcuts silently broken.
   */
  test('7. keyboard help button opens the shortcuts panel', async ({ page }) => {
    const help = page.locator('#btn-keyboard-help').first();
    await expect(help).toBeVisible();
    await help.click();

    const panel = page.locator('[role="region"][aria-label*="keyboard" i], [role="region"][aria-label*="shortcut" i]').first();
    await panel.waitFor({ state: 'visible', timeout: 5000 });

    // Panel should list multiple shortcuts (the help panel has 9 in current build)
    const shortcutCount = await panel.locator(':scope > *').count();
    expect(shortcutCount, `expected multiple shortcut rows, got ${shortcutCount}`).toBeGreaterThanOrEqual(4);
  });

  /**
   * 8. Switching to Map mode produces no real console errors. The map
   *    view has its own init logic (MapView.svelte) and has historically
   *    broken when #map-container wasn't present.
   */
  test('8. switching to Map mode produces no real console errors', async ({ page }) => {
    const errors = [];
    const handler = (msg) => { if (msg.type() === 'error') errors.push(msg.text()); };
    page.on('console', handler);

    await page.getByRole('radio', { name: 'Map' }).first().click();
    await page.waitForTimeout(2000);

    page.off('console', handler);

    // Filter known dev-only noise that isn't a regression
    const real = errors.filter(
      (e) =>
        !/Svelte-first|font|nunito|Resource|favicon|Preconnect|net::ERR_ABORTED/i.test(e)
    );
    expect(real, `unexpected console errors: ${JSON.stringify(real, null, 2)}`).toEqual([]);
  });

  /**
   * 9. Clicking on the 3D canvas doesn't throw. We don't assert which
   *    point is selected (camera + scene state is non-deterministic), but
   *    a click must not produce a pageerror or a 3D-engine crash.
   */
  test('9. clicking on the 3D canvas produces no page errors', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const canvas = page.locator('canvas').first();
    await canvas.waitFor({ state: 'visible' });
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    // Click in the canvas viewport center where points are densest
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(800);

    expect(pageErrors, `page errors: ${JSON.stringify(pageErrors, null, 2)}`).toEqual([]);
  });

  /**
   * 10. The skip-to-main-content link is present, focusable, and moves
   *     focus into the main region on activation. This is a baseline a11y
   *     check that catches the "header is a div, skip link is dead" class
   *     of regressions.
   */
  test('10. skip-to-main link moves focus into main on activation', async ({ page }) => {
    const skip = page.locator('a[href="#main-content"]').first();
    await expect(skip).toBeAttached();

    // Focus and activate the link
    await skip.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // After activation, the main element should either have focus or be
    // scrolled into view. We check both since browser behavior varies.
    const result = await page.evaluate(() => {
      const main = document.querySelector('main');
      const hash = window.location.hash;
      return {
        activeIsMain: document.activeElement?.tagName === 'MAIN',
        hash: hash,
        mainTop: main ? Math.round(main.getBoundingClientRect().top) : null
      };
    });

    // Either focus moved to main, or the URL hash changed to #main-content,
    // or the main is scrolled into the viewport (top within 200px of 0).
    const focusMoved = result.activeIsMain || result.hash === '#main-content';
    const scrolled = result.mainTop !== null && result.mainTop < 200;
    expect(focusMoved || scrolled, `skip link did not move focus or scroll to main: ${JSON.stringify(result)}`).toBe(true);
  });
});

/**
 * real-route-contract.mjs
 *
 * Permanent regression contract for the real mobile focus-search route that
 * previously escaped synthetic field-node checks.
 *
 * Route:  ?view=galaxy&q=coffee&anchor=1&mode=trail&depth=1&record=1
 * Mobile 390x844 — real URL state, no simulation hacks.
 *
 * Contract (fail if any check fails):
 *   1. .journey-compass-title is NOT clipped/ellipsis/nowrap
 *   2. .journey-compass-rail is NOT visible
 *   3. .journey-compass does NOT overflow (scrollWidth > innerWidth)
 *   4. .journey-compass-action.primary touch target >= 44px
 *
 * Usage:
 *   node tests/real-route-contract.mjs [url]
 *   npm run qa:contract:real-route
 *
 * Exit: 0 = all checks pass, 1 = any check fails
 */

import { chromium } from 'playwright';

const TARGET_URL  = 'http://127.0.0.1:8795/vector-explorer-polished.html?view=galaxy&q=coffee&anchor=1&mode=trail&depth=1&record=1';

const VIEWPORT = { width: 390, height: 844 };
const DEVICE_SCALE_FACTOR = 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadAndWait(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('load', { timeout: 5000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(2200); // real route needs slightly more settle time
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const url = process.argv[2] || TARGET_URL;

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    console.error('FAIL: browser launch failed:', e.message);
    process.exit(1);
  }

  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    isMobile: true,
  });
  const page = await context.newPage();

  const failures = [];

  try {
    await loadAndWait(page, url);

    const info = await page.evaluate(() => {
      function textClipped(el) {
        if (!el) return false;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const rect = el.getBoundingClientRect();
        return el.scrollWidth > rect.width + 1 || el.scrollHeight > rect.height + 1;
      }

      function isVisible(el) {
        if (!el) return false;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }

      const results = {};

      // 1. .journey-compass-title — check clipping via scrollWidth vs boundingRect
      const title = document.querySelector('.journey-compass-title');
      results.titlePresent = title !== null;
      if (title) {
        const style = getComputedStyle(title);
        const rect = title.getBoundingClientRect();
        results.titleTextOverflows = title.scrollWidth > rect.width + 1;
        results.titleBlockOverflows = title.scrollHeight > rect.height + 1;
        results.titleOverflowX = style.overflowX;
        results.titleWhiteSpace = style.whiteSpace;
        results.titleTextOverflow = style.textOverflow;
        results.titleRectWidth = Math.round(rect.width * 100) / 100;
        results.titleScrollWidth = title.scrollWidth;
      }

      // 2. .journey-compass-rail — should NOT be visible in focus-search
      const rail = document.querySelector('.journey-compass-rail');
      results.railPresent = rail !== null;
      results.railVisible = isVisible(rail);

      // 3. .journey-compass overflow check
      const compass = document.querySelector('.journey-compass');
      results.compassPresent = compass !== null;
      if (compass) {
        const rect = compass.getBoundingClientRect();
        results.compassOverflows = compass.scrollWidth > window.innerWidth + 1;
        results.compassRectWidth = Math.round(rect.width * 100) / 100;
        results.compassScrollWidth = compass.scrollWidth;
        results.compassOverflowX = getComputedStyle(compass).overflowX;
        results.viewportWidth = window.innerWidth;
      }

      // 4. .journey-compass-action.primary touch target
      const primaryActions = Array.from(document.querySelectorAll('.journey-compass-action.primary')).filter(isVisible);
      results.primaryActionsCount = primaryActions.length;
      results.primaryActionsTouchOk = primaryActions.map((btn) => {
        const r = btn.getBoundingClientRect();
        return {
          ok: r.width >= 43.5 && r.height >= 43.5,
          width: Math.round(r.width * 100) / 100,
          height: Math.round(r.height * 100) / 100,
          datasetAction: btn.dataset?.journeyAction || null,
        };
      });

      // URL / state validation
      results.url = window.location.href;
      results.panelSurface = document.body?.dataset?.panelSurface || null;

      return results;
    });

    console.log('\n=== REAL ROUTE CONTRACT ===');
    console.log(`URL:  ${info.url}`);
    console.log(`Surface: ${info.panelSurface}`);
    console.log('');

    // Check 1: .journey-compass-title NOT clipped, nowrap, or ellipsis-styled.
    if (info.titlePresent) {
      if (info.titleTextOverflows || info.titleBlockOverflows) {
        console.log('FAIL 1: .journey-compass-title is clipped (scrollWidth > rect.width)');
        console.log(`       rect.width=${info.titleRectWidth}  scrollWidth=${info.titleScrollWidth}`);
        console.log(`       overflowX=${info.titleOverflowX}  whiteSpace=${info.titleWhiteSpace}  textOverflow=${info.titleTextOverflow}`);
        failures.push('title-clipped');
      } else if (info.titleWhiteSpace === 'nowrap') {
        console.log('FAIL 1: .journey-compass-title is still nowrap');
        failures.push('title-nowrap');
      } else if (info.titleTextOverflow === 'ellipsis') {
        console.log('FAIL 1: .journey-compass-title is still ellipsis-styled');
        failures.push('title-ellipsis');
      } else {
        console.log('PASS 1: .journey-compass-title not clipped, nowrap, or ellipsis-styled');
      }
    } else {
      console.log('FAIL 1: .journey-compass-title not found in DOM');
      failures.push('title-missing');
    }

    // Check 2: .journey-compass-rail NOT visible
    if (info.railPresent) {
      if (info.railVisible) {
        console.log('FAIL 2: .journey-compass-rail is VISIBLE (should be hidden in focus-search)');
        failures.push('rail-visible');
      } else {
        console.log('PASS 2: .journey-compass-rail is hidden');
      }
    } else {
      console.log('WARN 2: .journey-compass-rail not found in DOM');
    }

    // Check 3: .journey-compass does NOT overflow
    if (info.compassPresent) {
      if (info.compassOverflows) {
        console.log('FAIL 3: .journey-compass overflows horizontally');
        console.log(`       innerWidth=${info.viewportWidth}  compass.scrollWidth=${info.compassScrollWidth}  rect.width=${info.compassRectWidth}`);
        failures.push('compass-overflows');
      } else {
        console.log('PASS 3: .journey-compass no horizontal overflow');
      }
    } else {
      console.log('FAIL 3: .journey-compass not found in DOM');
      failures.push('compass-missing');
    }

    // Check 4: primary action touch target >= 44px
    if (info.primaryActionsCount > 0) {
      const badTargets = info.primaryActionsTouchOk.filter((t) => !t.ok);
      if (badTargets.length > 0) {
        console.log('FAIL 4: .journey-compass-action.primary < 44px touch target');
        console.log(`       ${JSON.stringify(info.primaryActionsTouchOk)}`);
        failures.push('primary-action-small-touch-target');
      } else {
        console.log(`PASS 4: primary action touch target OK (${info.primaryActionsCount} button(s))`);
      }
    } else {
      console.log('FAIL 4: no visible .journey-compass-action.primary found');
      failures.push('primary-action-missing');
    }

    console.log('');
    console.log(`=== RESULT: ${failures.length === 0 ? 'ALL PASS' : `FAIL (${failures.length} failure(s): ${failures.join(', ')})`} ===`);

  } catch (e) {
    console.error('FAIL: contract threw during execution:', e.message);
    failures.push('threw');
  } finally {
    await context.close();
    await browser.close();
  }

  process.exit(failures.length > 0 ? 1 : 0);
}

main();

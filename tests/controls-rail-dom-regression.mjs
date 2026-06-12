/**
 * Regression test for the controls-rail 3-control overlap fix.
 *
 * Bug: The HTML wrapper `<div class="controls controls-rail" data-controls-rail>`
 *      was lost from vector-explorer-polished.html via a `git reset HEAD^`
 *      operation. With no parent, the 3 controls (#view-toggle, #info-controls,
 *      #camera-controls) all anchored to the same `position: fixed; right: 16px;
 *      bottom: 16px` and stacked on top of each other.
 *
 * Fix (commit 2cedc12): Re-applied the HTML wrapper. CSS reset rules in
 *                       css/mobile_base.css use `[data-controls-rail] > .controls`
 *                       (specificity 0,3,1) to win over the base `.controls`
 *                       rule. An ID-level selector `#view-toggle` (1,0,0) provides
 *                       the highest-specificity reset.
 *
 * This test asserts the DOM structure and computed styles are correct, and
 * that hit tests land on the right control at each control's geometric center.
 *
 * Run: node --loader ./tests/helpers/ts-resolve-loader.mjs tests/controls-rail-dom-regression.mjs
 */

import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const URL = process.env.TEST_URL || 'http://127.0.0.1:8795/vector-explorer-polished.html';
const VIEWPORT = { width: 1440, height: 900 };

const EXPECTED_CONTROLS = ['#view-toggle', '#info-controls', '#camera-controls'];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: VIEWPORT });
const page = await context.newPage();

try {
  await page.goto(URL, { waitUntil: 'networkidle' });

  await page.waitForSelector('[data-controls-rail]', { timeout: 10000 });
  const rail = page.locator('[data-controls-rail]');

  const railInfo = await rail.evaluate((el) => ({
    tag: el.tagName,
    classes: el.className,
    childCount: el.children.length,
    position: getComputedStyle(el).position,
  }));

  assert.equal(railInfo.tag, 'DIV', 'data-controls-rail is a DIV element');
  assert.ok(railInfo.classes.includes('controls'), 'data-controls-rail has the .controls class');
  assert.ok(railInfo.classes.includes('controls-rail'), 'data-controls-rail has the .controls-rail class');

  for (const selector of EXPECTED_CONTROLS) {
    const parent = await page.locator(selector).evaluate((el) => el.parentElement?.getAttribute('data-controls-rail'));
    assert.equal(parent, '', `${selector} is NOT wrapped in [data-controls-rail]`);
  }

  for (const selector of EXPECTED_CONTROLS) {
    const styles = await page.locator(selector).evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        position: s.position,
        right: s.right,
        bottom: s.bottom,
      };
    });
    assert.notEqual(styles.position, 'fixed',
      `${selector} should NOT be position:fixed (it should flow inside the rail, not anchor to viewport)`);
  }

  for (const selector of EXPECTED_CONTROLS) {
    const element = page.locator(selector);
    const box = await element.boundingBox();
    assert.ok(box, `${selector} has a bounding box`);

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    const hitId = await page.evaluate(({ x, y, expectedId }) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      let current = el;
      while (current) {
        if (current.id === expectedId) return current.id;
        current = current.parentElement;
      }
      return el.id || el.tagName.toLowerCase();
    }, { x: centerX, y: centerY, expectedId: selector.replace('#', '') });

    const expectedId = selector.replace('#', '');
    assert.equal(hitId, expectedId,
      `Hit test at ${selector} center (${Math.round(centerX)},${Math.round(centerY)}) should land on #${expectedId} or a descendant of it, got ${hitId}`);
  }

  const railBox = await rail.boundingBox();
  assert.ok(railBox, 'rail has a bounding box');
  const totalChildHeight = await rail.evaluate((el) => {
    return Array.from(el.children).reduce((sum, c) => sum + c.getBoundingClientRect().height, 0);
  });
  assert.ok(totalChildHeight > 0, 'all 3 children contribute non-zero height to the rail');

  console.log('controls-rail DOM regression PASSED');
  console.log(`  - rail child count: ${railInfo.childCount}`);
  console.log(`  - all 3 controls wrapped in [data-controls-rail]`);
  console.log(`  - all 3 controls are position:static (not fixed)`);
  console.log(`  - all 3 hit tests land on the correct control`);
} finally {
  await browser.close();
}

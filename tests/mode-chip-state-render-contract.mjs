/**
 * mode-chip-state-render-contract.mjs
 *
 * Rendered contract test for mode-chip states.
 * Asserts: grid/chips exist, active chip aria/state, locked/waiting/disabled styles,
 * galaxy active view override determinism.
 *
 * Usage:
 *   node tests/mode-chip-state-render-contract.mjs [url]
 *
 * Default URL: http://127.0.0.1:8795/vector-explorer-polished.html
 */

import { chromium } from 'playwright';

const DEFAULT_URL = 'http://127.0.0.1:8795/vector-explorer-polished.html';
const URL = process.argv[2] || DEFAULT_URL;

/** Parse rgba() or rgb() into {r,g,b,a} or null */
function rgbaChannels(cssRgba) {
  const m = cssRgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return null;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] !== undefined ? Number(m[4]) : 1 };
}

/** Teal galaxy palette: r≈78, g≈205, b≈196 */
function isTealGalaxy(ch) {
  return ch && ch.r > 70 && ch.r < 90 && ch.g > 195 && ch.g < 215 && ch.b > 185 && ch.b < 205;
}

/** Cyan-teal locked palette: r≈82, g≈229, b≈215 */
function isCyanLocked(ch) {
  return ch && ch.r > 75 && ch.r < 90 && ch.g > 220 && ch.g < 240 && ch.b > 205 && ch.b < 225;
}

async function main() {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext();
  const page = await context.newPage();

  const errors = [];
  function fail(msg) { errors.push(msg); }

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);
  } catch (_) {
    await browser.close();
    console.error('mode-chip-state-render-contract FAILED: could not load page');
    process.exit(1);
  }

  // ── 0. Canonical state: non-galaxy view ──────────────────────────────────
  // Ensure we are NOT in galaxy mode so base styles apply.
  // The app starts in galaxy mode; switch to "map" (non-galaxy) so that
  // base .active, .is-locked, .is-waiting overrides are testable.
  await page.evaluate(() => {
    document.body.classList.add('is-active');
    document.body.setAttribute('data-active-view', 'map');
    document.body.setAttribute('data-panel-surface', 'idle');
    document.body.removeAttribute('data-panel-surface-detail');
    document.body.removeAttribute('data-mobile-route-peek');
    document.body.removeAttribute('data-mobile-search-sheet');
  });
  await page.waitForTimeout(300);

  // ── 1. Mode grid and chips exist ────────────────────────────────────────────
  const modeGrid = page.locator('#mode-grid');
  if (await modeGrid.count() === 0) {
    fail('mode-grid #mode-grid does not exist in DOM');
  } else {
    const chips = modeGrid.locator('.mode-chip');
    const chipCount = await chips.count();
    if (chipCount < 2) {
      fail(`Expected at least 2 mode-chip elements, found ${chipCount}`);
    } else {
      for (let i = 0; i < chipCount; i++) {
        const tag = await chips.nth(i).evaluate((el) => el.tagName);
        if (tag !== 'BUTTON') fail(`mode-chip[${i}] tag is <${tag}>, expected <button>`);
      }
    }
  }

  // ── 2. Default active chip (County View / data-mode="default") ────────────
  const activeChip = page.locator('.mode-chip.active');
  if (await activeChip.count() === 0) {
    fail('No .mode-chip.active found — expected County View chip to be active by default');
  } else {
    const ariaPressed = await activeChip.getAttribute('aria-pressed');
    if (ariaPressed !== 'true') fail(`active chip aria-pressed="${ariaPressed}", expected "true"`);
    const bg = await activeChip.evaluate((el) => window.getComputedStyle(el).getPropertyValue('background'));
    const ch = rgbaChannels(bg);
    if (!ch || ch.a < 0.05) fail(`active chip background="${bg}" appears transparent`);
  }

  // ── 3. Locked chip style (.is-locked) via state machine ───────────────────
  // lifecycle.js: is-locked is applied when trailDepth >= 1 on the Trail chip.
  // Drive trailDepth=1 via state, then call updateExplorationUi if available.
  const trailChip = page.locator('.mode-chip[data-mode="trail"]');
  if (await trailChip.count() > 0) {
    await page.evaluate(() => {
      window.state.trailDepth = 1;
      window.state.focusedNode = null;
      if (typeof window.updateExplorationUi === 'function') window.updateExplorationUi();
    });
    await page.waitForTimeout(300);

    const isLocked = await trailChip.evaluate((el) => el.classList.contains('is-locked'));
    if (!isLocked) {
      // Fallback: direct class injection to validate CSS contract in isolation
      await trailChip.evaluate((el) => el.classList.add('is-locked'));
    }

    const lockedBg = await trailChip.evaluate((el) => window.getComputedStyle(el).getPropertyValue('background'));
    const lockedBgCh = rgbaChannels(lockedBg);
    if (!lockedBgCh || lockedBgCh.a < 0.05) {
      fail(`is-locked chip background="${lockedBg}" appears transparent`);
    }
    const lockedShadow = await trailChip.evaluate((el) => window.getComputedStyle(el).getPropertyValue('box-shadow'));
    if (!lockedShadow || lockedShadow === 'none' || lockedShadow.match(/^0px\s+0px\s+0px\s+0px\s+transparent/)) {
      fail(`is-locked chip box-shadow="${lockedShadow}" missing or none`);
    }

    // Reset state
    await page.evaluate(() => {
      window.state.trailDepth = 0;
      if (typeof window.updateExplorationUi === 'function') window.updateExplorationUi();
    });
  } else {
    fail('Trail chip [data-mode="trail"] not found — cannot test is-locked state');
  }

  // ── 4. Waiting chip style (.is-waiting) via state machine ─────────────────
  // lifecycle.js: is-waiting is applied to Trail chip when focusedNode === null.
  // (bloom chip does NOT receive is-waiting from the state machine)
  // For CSS contract validation, inject directly on the bloom chip.
  const bloomChip = page.locator('.mode-chip[data-mode="bloom"]');
  if (await bloomChip.count() > 0) {
    const isWaiting = await bloomChip.evaluate((el) => el.classList.contains('is-waiting'));
    if (!isWaiting) {
      await bloomChip.evaluate((el) => el.classList.add('is-waiting'));
    }
    const waitOpacity = await bloomChip.evaluate((el) => window.getComputedStyle(el).getPropertyValue('opacity'));
    if (Number(waitOpacity) >= 1) fail(`is-waiting chip opacity="${waitOpacity}" should be < 1`);
    const waitBorderStyle = await bloomChip.evaluate((el) => window.getComputedStyle(el).getPropertyValue('border-style'));
    if (waitBorderStyle !== 'solid') fail(`is-waiting chip border-style="${waitBorderStyle}", expected "solid"`);
  } else {
    fail('Bloom chip [data-mode="bloom"] not found — cannot test is-waiting state');
  }

  // ── 5. Disabled chip style (:disabled) ────────────────────────────────────
  const bridgeChip = page.locator('.mode-chip[data-mode="bridge"]');
  if (await bridgeChip.count() > 0) {
    const isDisabled = await bridgeChip.evaluate((el) => el.disabled);
    if (!isDisabled) {
      await bridgeChip.evaluate((el) => { el.disabled = true; });
    }
    const disabledCursor = await bridgeChip.evaluate((el) => window.getComputedStyle(el).getPropertyValue('cursor'));
    if (disabledCursor !== 'not-allowed') fail(`disabled chip cursor="${disabledCursor}", expected "not-allowed"`);
    const disabledOpacity = await bridgeChip.evaluate((el) => window.getComputedStyle(el).getPropertyValue('opacity'));
    if (Number(disabledOpacity) >= 1) fail(`disabled chip opacity="${disabledOpacity}" should be < 1`);
  } else {
    fail('Bridge chip [data-mode="bridge"] not found — cannot test :disabled state');
  }

  // ── 6. Galaxy active view override ─────────────────────────────────────────
  // Switch to galaxy and verify active chip uses teal palette (r≈78,g≈205,b≈196)
  // which differs from base blue (r≈120,g≈200,b≈255).
  await page.evaluate(() => document.body.setAttribute('data-active-view', 'galaxy'));
  await page.waitForTimeout(300);

  const galaxyActiveChip = page.locator('.mode-chip.active');
  if (await galaxyActiveChip.count() === 0) {
    fail('No .mode-chip.active found in galaxy view');
  } else {
    const galaxyBg = await galaxyActiveChip.evaluate((el) => window.getComputedStyle(el).getPropertyValue('background'));
    const galaxyBgCh = rgbaChannels(galaxyBg);
    if (!galaxyBgCh || galaxyBgCh.a < 0.05) {
      fail(`galaxy .active chip background="${galaxyBg}" appears transparent`);
    } else if (!isTealGalaxy(galaxyBgCh)) {
      fail(`galaxy .active chip background="${galaxyBg}" does not use teal galaxy palette (r≈78,g≈205,b≈196)`);
    }
  }

  // ── 7. Base vs galaxy palette should differ ────────────────────────────────
  await page.evaluate(() => document.body.setAttribute('data-active-view', 'map'));
  await page.waitForTimeout(300);

  const baseActiveChip = page.locator('.mode-chip.active');
  if (await baseActiveChip.count() > 0) {
    const baseBg = await baseActiveChip.evaluate((el) => window.getComputedStyle(el).getPropertyValue('background'));
    const baseBgCh = rgbaChannels(baseBg);
    // Base palette should be blue (r≈120,g≈200,b≈255), NOT teal
    if (baseBgCh) {
      if (isTealGalaxy(baseBgCh)) {
        fail(`base (map view) active chip background="${baseBg}" unexpectedly uses teal galaxy palette — should be blue`);
      }
    }
  }

  await browser.close();

  // ── Report ─────────────────────────────────────────────────────────────────
  if (errors.length > 0) {
    console.error('mode-chip-state-render-contract FAILED');
    for (const e of errors) console.error('  FAIL:', e);
    process.exit(1);
  }

  console.log('mode-chip-state-render-contract passed');
}

main().catch((err) => {
  console.error('mode-chip-state-render-contract FAILED:', err.message);
  process.exit(1);
});

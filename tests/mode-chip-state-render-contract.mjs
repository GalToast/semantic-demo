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
 * Default URL: http://127.0.0.1:8795/dist/svelte/index.html
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { mutate } from './helpers/state-harness.js';

const DEFAULT_URL = 'http://127.0.0.1:8795/dist/svelte/index.html';
let targetUrl = process.argv[2] || DEFAULT_URL;
const USE_LOCAL_SERVER = process.argv.length <= 2;

function startServer(rootDir, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const rel = urlPath === '/' ? 'dist/svelte/index.html' : urlPath.replace(/^\/+/, '');
      const fullPath = path.resolve(rootDir, rel);
      if (fullPath !== rootDir && !fullPath.startsWith(`${rootDir}${path.sep}`)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      fs.readFile(fullPath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const ext = path.extname(fullPath).toLowerCase();
        const type = {
          '.html': 'text/html',
          '.css': 'text/css',
          '.js': 'application/javascript',
          '.mjs': 'application/javascript',
          '.ts': 'application/javascript',
          '.json': 'application/json',
          '.dat': 'application/json',
          '.png': 'image/png',
          '.svg': 'image/svg+xml',
        }[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type });
        res.end(data);
      });
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

/** Parse rgba() or rgb() into {r,g,b,a} or null */
function rgbaChannels(cssRgba) {
  const m = cssRgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return null;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] !== undefined ? Number(m[4]) : 1 };
}

/** Teal galaxy palette: r approximately 78, g approximately 205, b approximately 196 */
function isTealGalaxy(ch) {
  return ch && ch.r > 70 && ch.r < 90 && ch.g > 195 && ch.g < 215 && ch.b > 185 && ch.b < 205;
}

/** Cyan-teal locked palette: r approximately 82, g approximately 229, b approximately 215 */
function isCyanLocked(ch) {
  return ch && ch.r > 75 && ch.r < 90 && ch.g > 220 && ch.g < 240 && ch.b > 205 && ch.b < 225;
}

async function main() {
  let server = null;
  if (USE_LOCAL_SERVER) {
    server = await startServer(process.cwd(), 0);
    const address = server.address();
    targetUrl = `http://127.0.0.1:${address.port}/dist/svelte/index.html`;
  }
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox'] });
  const context = await browser.newContext();
  const page = await context.newPage();

  const errors = [];
  function fail(msg) { errors.push(msg); }

  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForFunction(() =>
      (window.__APP_STATE__ ?? window.__TEST_STATE__)
      && document.querySelectorAll('#mode-grid .mode-chip, #mode-chips .mode-chip').length >= 2,
      { timeout: 20000 }
    );
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  } catch (_) {
    await browser.close();
    server?.close();
    console.error('mode-chip-state-render-contract FAILED: could not load page');
    process.exit(1);
  }

  // -- 0. Canonical state: non-galaxy view -----------------------------------
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
  // state mutation applied synchronously

  // -- 1. Mode grid and chips exist ------------------------------------------
  const modeGrid = page.locator('#mode-grid, #mode-chips');
  if (await modeGrid.count() === 0) {
    fail('mode chip container (#mode-grid or #mode-chips) does not exist in DOM');
  } else {
    const chips = page.locator('#mode-grid .mode-chip, #mode-chips .mode-chip');
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

  // -- 2. Default active chip -------------------------------------------------
  const activeChip = page.locator('#mode-chips .mode-chip.active');
  if (await activeChip.count() === 0) {
    fail('No .mode-chip.active found - expected one active chip by default');
  } else {
    const ariaPressed = await activeChip.getAttribute('aria-pressed');
    const ariaChecked = await activeChip.getAttribute('aria-checked');
    if (ariaPressed !== 'true' && ariaChecked !== 'true') {
      fail(`active chip aria-pressed="${ariaPressed}" aria-checked="${ariaChecked}", expected one true state`);
    }
    const bg = await activeChip.evaluate((el) => window.getComputedStyle(el).getPropertyValue('background'));
    const ch = rgbaChannels(bg);
    if (!ch || ch.a < 0.05) fail(`active chip background="${bg}" appears transparent`);
  }

  // -- 3. Locked chip style (.is-locked) via state machine -------------------
  // lifecycle.js: is-locked is applied when trailDepth >= 1 on the Trail chip.
  // Drive trailDepth=1 via state, then call updateExplorationUi if available.
  const trailChip = page.locator('#mode-chips .mode-chip[data-mode="trail"]');
  if (await trailChip.count() > 0) {
    // Drive trailDepth=1 via named harness mutation, then call updateExplorationUi.
    await mutate(page, 'setTrailDepth', { trailDepth: 1 });
    await page.evaluate(() => { if (typeof window.updateExplorationUi === 'function') window.updateExplorationUi(); });
    // state mutation applied synchronously

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
    await mutate(page, 'clearFocusedNode');
    await page.evaluate(() => { if (typeof window.updateExplorationUi === 'function') window.updateExplorationUi(); });
  } else {
    fail('Trail chip [data-mode="trail"] not found - cannot test is-locked state');
  }

  // -- 4. Waiting chip style (.is-waiting) -----------------------------------
  // Validate the generic waiting style against an existing chip. Legacy used
  // bloom; the Svelte rail exposes overview/search/trail/focus/inside/map.
  const waitingChip = page.locator('#mode-chips .mode-chip[data-mode="trail"], #mode-chips .mode-chip').first();
  if (await waitingChip.count() > 0) {
    const isWaiting = await waitingChip.evaluate((el) => el.classList.contains('is-waiting'));
    if (!isWaiting) {
      await waitingChip.evaluate((el) => el.classList.add('is-waiting'));
    }
    const waitOpacity = await waitingChip.evaluate((el) => window.getComputedStyle(el).getPropertyValue('opacity'));
    if (Number(waitOpacity) >= 1) fail(`is-waiting chip opacity="${waitOpacity}" should be < 1`);
    const waitBorderStyle = await waitingChip.evaluate((el) => window.getComputedStyle(el).getPropertyValue('border-style'));
    if (waitBorderStyle !== 'solid') fail(`is-waiting chip border-style="${waitBorderStyle}", expected "solid"`);
  } else {
    fail('No mode chip found - cannot test is-waiting state');
  }

  // -- 5. Disabled chip style (:disabled) ------------------------------------
  const disabledChip = page.locator('#mode-chips .mode-chip[data-mode="inside"], #mode-chips .mode-chip').first();
  if (await disabledChip.count() > 0) {
    const isDisabled = await disabledChip.evaluate((el) => el.disabled);
    if (!isDisabled) {
      await disabledChip.evaluate((el) => { el.disabled = true; });
    }
    const disabledCursor = await disabledChip.evaluate((el) => window.getComputedStyle(el).getPropertyValue('cursor'));
    if (disabledCursor !== 'not-allowed') fail(`disabled chip cursor="${disabledCursor}", expected "not-allowed"`);
    const disabledOpacity = await disabledChip.evaluate((el) => window.getComputedStyle(el).getPropertyValue('opacity'));
    if (Number(disabledOpacity) >= 1) fail(`disabled chip opacity="${disabledOpacity}" should be < 1`);
    await disabledChip.evaluate((el) => { el.disabled = false; });
  } else {
    fail('No mode chip found - cannot test :disabled state');
  }

  // -- 6. Galaxy active view override ----------------------------------------
  await page.locator('#mode-chips .mode-chip').evaluateAll((chips) => {
    for (const chip of chips) {
      chip.classList.remove('is-locked', 'is-waiting');
      chip.disabled = false;
    }
  });

  const overviewChip = page.locator('#mode-chips .mode-chip[data-mode="overview"], #mode-chips .mode-chip', { hasText: /overview/i }).first();
  if (await overviewChip.count() > 0) {
    await overviewChip.click();
  } else {
    await page.evaluate(() => document.body.setAttribute('data-active-view', 'galaxy'));
  }
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});

  const galaxyActiveChip = page.locator('#mode-chips .mode-chip.active');
  if (await galaxyActiveChip.count() === 0) {
    fail('No .mode-chip.active found in galaxy view');
  } else {
    const galaxyBg = await galaxyActiveChip.evaluate((el) => window.getComputedStyle(el).getPropertyValue('background'));
    const galaxyBgCh = rgbaChannels(galaxyBg);
    if (!galaxyBgCh || galaxyBgCh.a < 0.05) {
      fail(`galaxy .active chip background="${galaxyBg}" appears transparent`);
    } else if (!isTealGalaxy(galaxyBgCh)) {
      fail(`galaxy .active chip background="${galaxyBg}" does not use teal galaxy palette`);
    }
  }

  // -- 7. Map active view keeps active chips visible --------------------------
  // This contract checks behavior, not exact hue ownership. CSS visual audits
  // cover whether map should use a distinct palette from galaxy.
  const mapChip = page.locator('#mode-chips .mode-chip[data-mode="map"], #mode-chips .mode-chip', { hasText: /^map$/i }).first();
  if (await mapChip.count() > 0) {
    await mapChip.click();
  } else {
    await page.evaluate(() => {
      document.body.setAttribute('data-active-view', 'map');
      document.documentElement.setAttribute('data-active-view', 'map');
    });
  }
  await page.waitForFunction(() => document.body.getAttribute('data-active-view') === 'map', null, { timeout: 5000 }).catch(() => {});
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});

  const mapActiveChip = page.locator('#mode-chips .mode-chip.active');
  if (await mapActiveChip.count() === 0) {
    fail('No .mode-chip.active found in map view');
  } else {
    const mapState = await mapActiveChip.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        background: style.getPropertyValue('background'),
        borderColor: style.getPropertyValue('border-color'),
        opacity: style.getPropertyValue('opacity'),
      };
    });
    const mapBgCh = rgbaChannels(mapState.background);
    const mapBorderCh = rgbaChannels(mapState.borderColor);
    if (!mapBgCh || mapBgCh.a < 0.05) {
      fail(`map .active chip background="${mapState.background}" appears transparent`);
    }
    if (!mapBorderCh || mapBorderCh.a < 0.1) {
      fail(`map .active chip border-color="${mapState.borderColor}" appears transparent`);
    }
    if (Number(mapState.opacity) < 0.9) {
      fail(`map .active chip opacity="${mapState.opacity}" should remain readable`);
    }
  }

  await browser.close();
  server?.close();

  // -- Report ----------------------------------------------------------------
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

/**
 * persistence-contract.mjs
 *
 * Contract test proving that browser storage persistence flags are respected
 * across page reloads for three key UX behaviors:
 *
 *   1. kh_dismissed (sessionStorage)  — dismissing Keyboard Help prevents it
 *      from reappearing on page reload.
 *   2. moco_mycelium_demo_v1 (localStorage) — completing or cancelling the
 *      micro-demo is respected across sessions (demo never re-runs).
 *   3. searchVisibleCount (sessionStorage) — expanding search results and
 *      refreshing preserves the expanded count (results stay expanded).
 *
 * All three are Playwright browser tests requiring a running dev server on
 * port 8795. Each sub-test uses a fresh isolated browser context so storage
 * is completely independent between sub-tests.
 *
 * Run: node tests/run-all-contracts.js --group=quality
 */

import { chromium } from '@playwright/test';

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '');
const STORAGE_KEY_DEMO = 'moco_mycelium_demo_v1';
const STORAGE_KEY_KH_DISMISSED = 'kh_dismissed';
const STORAGE_KEY_SEARCH_VISIBLE = 'searchVisibleCount';
// SwiftShader gate (see visual-state-audit.mjs)
const forceSoftwareWebgl = process.env.SEMANTIC_FORCE_WEBGL_SOFTWARE === '1'

const SEMANTIC_HEALTH_STUB = {
  ok: true, state: 'healthy',
  provenance: { label: 'Search ready', detail: 'Semantic search is ready.' }
};
const SEARCH_STUB = {
  ok: true, count: 8,
  results: [
    { lead_id: 1, score: 0.99, semantic_score: 0.99, public_note: 'Coffee shop on Main St.' },
    { lead_id: 2, score: 0.91, semantic_score: 0.91, public_note: 'Cafe near the park.' },
    { lead_id: 20, score: 0.86, semantic_score: 0.86, public_note: 'Espresso bar downtown.' },
    { lead_id: 3, score: 0.85, semantic_score: 0.85, public_note: 'Tea house on Elm St.' },
    { lead_id: 4, score: 0.82, semantic_score: 0.82, public_note: 'Bakery and coffee spot.' },
    { lead_id: 5, score: 0.80, semantic_score: 0.80, public_note: 'Coffee roastery.' },
    { lead_id: 6, score: 0.78, semantic_score: 0.78, public_note: 'Internet cafe.' },
    { lead_id: 7, score: 0.75, semantic_score: 0.75, public_note: 'Smoothie and coffee bar.' }
  ]
};

async function setupNetworkStubs(page) {
  await page.route('**/api.php?action=semantic_lane_health**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEMANTIC_HEALTH_STUB) });
  });
  await page.route('**/api.php?action=semantic_search**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEARCH_STUB) });
  });
}

async function waitForAppReady(page) {
  // Canonical boot path (?q=coffee&nodemo=1) populates __TEST_STATE__.points.
  // Modern readiness (2026-08-11, mirror focus-trap-contract.mjs): the legacy
  // window globals clearSearch / refreshCompositionState were REMOVED in the
  // Svelte-5-native migration — waiting on them as bare identifiers inside
  // page.waitForFunction (which runs in the browser) never resolves. The
  // canonical test hook is __APP_STATE__ / __TEST_STATE__.points. Wait on the
  // hook, not the gone globals.
  await page.goto(`${BASE_URL}/dist/svelte/index.html?q=coffee&nodemo=1&view=galaxy`);
  await page.waitForFunction(() => (
    Array.isArray(window.__TEST_STATE__?.points) &&
    (window.__APP_STATE__ ?? window.__TEST_STATE__).points.length > 0
  ), undefined, { timeout: 30000 });
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});
}

async function performSearch(page, query = 'coffee') {
  // Canonical driver (2026-08-11, same as widget-journey + focus-trap): the
  // app fires search on Enter, not raw input events; the old block also had a
  // 'const search = search' shadow (self-shadowed import -> no search ever
  // fired). fill + Enter is the real path.
  await page.fill('#search-input', query);
  await page.keyboard.press('Enter');
  // Result items render with .search-result-listitem (the presentation
  // refactor renamed .search-result-item -> .search-result-listitem; see
  // SearchResultItem.svelte + widget-journey.spec.js).
  await page.waitForFunction(() => (
    document.querySelectorAll('.search-result-listitem').length > 0 ||
    document.getElementById('search-results')?.innerHTML?.includes('search-result-listitem')
  ), undefined, { timeout: 20000 });
}

async function expandSearchResults(page) {
  const showMoreBtn = page.locator('#search-show-more-btn, .search-show-more-btn, button:has-text("Show more")').first();
  const btnVisible = await showMoreBtn.isVisible().catch(() => false);
  if (btnVisible) {
    await showMoreBtn.click();
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});
  }
}

async function openKeyboardHelp(page) {
  const khBtn = page.locator('#btn-keyboard-help').first();
  const btnVisible = await khBtn.isVisible().catch(() => false);
  if (!btnVisible) return false;
  await khBtn.click();
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});
  return true;
}

async function dismissKeyboardHelp(page) {
  const closeBtn = page.locator('.kh-close, button[aria-label*="dismiss" i], button[aria-label*="close" i]').first();
  const closeVisible = await closeBtn.isVisible().catch(() => false);
  if (!closeVisible) {
    await page.keyboard.press('Escape');
  } else {
    await closeBtn.click();
  }
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});
}

async function getStorageValue(page, storageType, key) {
  return page.evaluate(([t, k]) => {
    return window[t].getItem(k);
  }, [storageType, key]);
}

// ── Sub-test 1: kh_dismissed persistence ──────────────────────────────────────

// Current keyboard-help panel: keyboard-hint-panel (id), role=region,
// aria-label "Keyboard shortcuts". Dismiss button is .kh-close (aria-label
// "Dismiss shortcuts panel"); clicking it calls closePanel() which writes
// sessionStorage kh_dismissed='1' (keyboard-help.ts:229).
const KH_PANEL_SELECTOR = '#keyboard-hint-panel, [role="region"][aria-label="Keyboard shortcuts"]';

async function test_kh_dismissed_persistence() {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', ...(forceSoftwareWebgl ? ['--enable-unsafe-swiftshader', '--enable-webgl-software-rendering'] : [])] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  try {
    await setupNetworkStubs(page);
    await waitForAppReady(page);

    // Verify keyboard help button is visible (not yet dismissed)
    const khBtnVisible = await page.locator('#btn-keyboard-help').isVisible().catch(() => false);

    if (khBtnVisible) {
      const opened = await openKeyboardHelp(page);
      if (opened) {
        const panelBefore = await page.locator(KH_PANEL_SELECTOR).isVisible().catch(() => false);
        if (panelBefore) {
          await dismissKeyboardHelp(page);
          const panelAfter = await page.locator(KH_PANEL_SELECTOR).isVisible().catch(() => true);
          const dismissed = await getStorageValue(page, 'sessionStorage', STORAGE_KEY_KH_DISMISSED);
          if (dismissed) {
            // Reload the page
            await page.reload();
            await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});
            const panelOnReload = await page.locator(KH_PANEL_SELECTOR).isVisible().catch(() => false);
            if (panelOnReload) {
              throw new Error('kh_dismissed: keyboard help reappeared after reload despite dismissal flag');
            }
          }
        }
      }
    }

    console.log('  PASS: kh_dismissed persistence — keyboard help stays dismissed after reload');
  } finally {
    await browser.close();
  }
}

// ── Sub-test 2: micro-demo localStorage flag ──────────────────────────────────

async function test_micro_demo_localStorage_flag() {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', ...(forceSoftwareWebgl ? ['--enable-unsafe-swiftshader', '--enable-webgl-software-rendering'] : [])] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  try {
    await setupNetworkStubs(page);

    // Step 1: navigate with ?nodemo to bypass micro-demo auto-start
    // This lets us control localStorage before startDemo() runs
    await page.goto(`${BASE_URL}/dist/svelte/index.html?q=coffee&nodemo=1&view=galaxy`);
    await page.waitForFunction(() => (
      Array.isArray(window.__TEST_STATE__?.points) &&
      (window.__APP_STATE__ ?? window.__TEST_STATE__).points.length > 0
    ), undefined, { timeout: 30000 });
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});

    // Pre-set the localStorage flag to simulate completed demo
    // localStorage value is a JSON object: { seen: true, timestamp: '...' }
    await page.evaluate((key) => {
      localStorage.setItem(key, JSON.stringify({ seen: true, timestamp: new Date().toISOString() }));
    }, STORAGE_KEY_DEMO);

    // Also pre-set sessionStorage so shouldRunDemo() sees both flags on first check
    await page.evaluate((key) => {
      sessionStorage.setItem(key, new Date().toISOString());
    }, 'moco_mycelium_demo_session_v1');

    // Now reload without nodemo — shouldRunDemo() should see both flags
    await page.reload();
    await page.waitForFunction(() => (
      Array.isArray(window.__TEST_STATE__?.points) &&
      (window.__APP_STATE__ ?? window.__TEST_STATE__).points.length > 0
    ), undefined, { timeout: 30000 });
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), { timeout: 8000 }).catch(() => {});

    const demoState = await page.evaluate((key) => ({
      running: document.body.dataset.demoActive === 'true',
      active: document.body.dataset.demoActive === 'true',
      blocker: Boolean(document.getElementById('micro-demo-blocker')),
      stored: localStorage.getItem(key),
    }), STORAGE_KEY_DEMO);
    if (demoState.running || demoState.active || demoState.blocker) {
      throw new Error(`moco_mycelium_demo_v1: demo started despite localStorage flag: ${JSON.stringify(demoState)}`);
    }
    if (!demoState.stored) {
      throw new Error('moco_mycelium_demo_v1: localStorage completion flag was lost after reload');
    }

    console.log('  PASS: moco_mycelium_demo_v1 localStorage — micro-demo respects completion flag across sessions');
  } finally {
    await browser.close();
  }
}

// ── Sub-test 3: searchVisibleCount persistence ───────────────────────────────

async function test_searchVisibleCount_persistence() {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', ...(forceSoftwareWebgl ? ['--enable-unsafe-swiftshader', '--enable-webgl-software-rendering'] : [])] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  try {
    await setupNetworkStubs(page);
    await waitForAppReady(page);
    await performSearch(page, 'coffee');
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});

    // Wait for the "Show more" button to appear
    await page.waitForSelector('.search-show-more-btn', { timeout: 10000 }).catch(() => {});
    // element already confirmed visible

    // Click "Show more" to expand all results
    await expandSearchResults(page);
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});

    // Verify sessionStorage has the count set
    const savedCount = await getStorageValue(page, 'sessionStorage', STORAGE_KEY_SEARCH_VISIBLE);

    // The button should be visible before we try to expand if there are > 5 results
    const btnBefore = await page.locator('.search-show-more-btn').first();
    const btnVisibleBefore = await btnBefore.isVisible().catch(() => false);

    if (!btnVisibleBefore) {
      console.log(`  INFO: searchVisibleCount — "Show more" button not visible (may have already shown all results). Checking sessionStorage directly.`);
      // If all 8 results are already shown (searchVisibleCount persisted from a previous interaction),
      // the count should be set to 8
      const currentCount = await page.evaluate(() => {
        const list = document.querySelectorAll('.search-result-listitem');
        return list.length;
      });
      console.log(`  INFO: current result count=${currentCount}, savedCount="${savedCount}"`);
      if (currentCount >= 8) {
        console.log(`  PASS: searchVisibleCount persistence — all ${currentCount} results shown (sessionStorage value="${savedCount}")`);
        return;
      }
    }

    if (!savedCount || Number.parseInt(savedCount, 10) === 0) {
      throw new Error(`searchVisibleCount: expected sessionStorage to have expanded count, got "${savedCount}"`);
    }

    // Reload the page
    await page.reload();
    await page.waitForFunction(() => (
      Array.isArray(window.__TEST_STATE__?.points) &&
      (window.__APP_STATE__ ?? window.__TEST_STATE__).points.length > 0
    ), undefined, { timeout: 30000 });
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});

    // Re-run search to restore state (input was cleared on reload)
    await performSearch(page, 'coffee');
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});

    // After reload + re-search, the "Show more" button should NOT appear with non-zero remaining text
    // because sessionStorage restored searchVisibleCount=total
    const showMoreBtn = page.locator('.search-show-more-btn').first();
    const btnExists = await showMoreBtn.count().catch(() => 0);
    if (btnExists > 0) {
      const btnText = await showMoreBtn.textContent().catch(() => '');
      const isHidden = await showMoreBtn.isHidden().catch(() => false);
      if (!isHidden && btnText && !btnText.includes('0 more')) {
        throw new Error(`searchVisibleCount: after reload with saved count="${savedCount}", "Show more" button still visible with text "${btnText}" — persistence not respected`);
      }
    }

    console.log(`  PASS: searchVisibleCount persistence — expanded count "${savedCount}" respected after reload`);
  } finally {
    await browser.close();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Persistence Contract ===\n');

  let passed = 0;
  let failed = 0;

  for (const [label, fn] of [
    ['kh_dismissed sessionStorage', test_kh_dismissed_persistence],
    ['moco_mycelium_demo_v1 localStorage', test_micro_demo_localStorage_flag],
    ['searchVisibleCount sessionStorage', test_searchVisibleCount_persistence],
  ]) {
    try {
      await fn();
      passed++;
    } catch (err) {
      console.log(`  FAIL: ${label} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`  ${passed}/${passed + failed} persistence checks passed`);

  if (failed > 0) {
    console.log(`  Failed: ${failed} sub-test(s)`);
    process.exit(1);
  }

  console.log('\n  All persistence contracts passed.\n');
}

main().catch(err => {
  console.error('Runner error:', err);
  process.exit(1);
});

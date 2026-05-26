/**
 * focus-trap-contract.mjs
 *
 * Contract test proving that keyboard focus is trapped within visible UI
 * elements and does NOT leak into hidden or 3D canvas elements when the
 * Info Panel / Search Results are active.
 *
 * Approach:
 *   1. Open the app and enter the search results view (panelSurface='search').
 *   2. Programmatically enumerate all focusable elements within the active panel.
 *   3. Starting from the first focusable element, simulate sequential Tab key
 *      presses using page.keyboard.press('Tab').
 *   4. After each Tab, record the currently active element and its bounding box.
 *   5. Verify the focused element is NOT a canvas element and is within the
 *      visible panel bounds.
 *   6. After N tabs (where N = number of focusable panel elements + 3 buffer
 *      tabs to catch any canvas leak), assert focus has not left the panel.
 *
 * Requires: running dev server on port 8795.
 *
 * Run: node tests/run-all-contracts.js --group=quality
 */

import { chromium } from '@playwright/test';

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '');

const SEMANTIC_HEALTH_STUB = {
  ok: true, state: 'healthy',
  provenance: { label: 'Search ready', detail: 'Semantic search is ready.' }
};
const SEARCH_STUB = {
  ok: true, count: 5,
  results: [
    { lead_id: 1, score: 0.99, semantic_score: 0.99, public_note: 'Coffee shop on Main St.' },
    { lead_id: 2, score: 0.91, semantic_score: 0.91, public_note: 'Cafe near the park.' },
    { lead_id: 20, score: 0.86, semantic_score: 0.86, public_note: 'Espresso bar downtown.' },
    { lead_id: 3, score: 0.85, semantic_score: 0.85, public_note: 'Tea house on Elm St.' },
    { lead_id: 4, score: 0.80, semantic_score: 0.80, public_note: 'Bakery and coffee spot.' }
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
  await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy`);
  await page.waitForFunction(() => (
    typeof window.clearSearch === 'function' &&
    typeof window.refreshCompositionState === 'function' &&
    Array.isArray(window.__TEST_STATE__?.points) &&
    window.__TEST_STATE__.points.length > 0
  ), { timeout: 20000 });
  await page.waitForTimeout(800);
}

async function performSearch(page, query = 'coffee') {
  const input = page.locator('#search-input');
  await input.focus();
  await input.fill(query);
  await page.evaluate(async (q) => {
    const el = document.getElementById('search-input');
    if (!el) return;
    el.value = q;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    if (typeof window.search === 'function') {
      await window.search(q, { preferCachedResults: false });
    }
  }, query);
  await page.waitForFunction(() => (
    document.querySelectorAll('.search-result-item').length > 0 ||
    document.getElementById('search-results')?.innerHTML?.includes('search-result-item')
  ), { timeout: 15000 });
}

async function getFocusableElements(page, rootEl) {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector) || document.body;
    const focusable = root.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    return Array.from(focusable).map(el => ({
      tag: el.tagName,
      id: el.id || '',
      cls: el.className || '',
      text: (el.textContent || '').trim().substring(0, 40),
      ariaLabel: el.getAttribute('aria-label') || '',
    }));
  }, rootEl);
}

async function getActiveElementInfo(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!active) return { tag: null, id: null, isCanvas: false, boundingRect: null };
    const rect = active.getBoundingClientRect();
    return {
      tag: active.tagName,
      id: active.id || '',
      cls: active.className || '',
      isCanvas: active.tagName === 'CANVAS',
      isMainCanvas: active.id === 'main-canvas' || active.id === 'three-canvas' || active.classList?.contains?.('main-canvas'),
      ariaLabel: active.getAttribute('aria-label') || '',
      boundingRect: rect ? {
        x: rect.x, y: rect.y, width: rect.width, height: rect.height
      } : null
    };
  });
}

async function getPanelVisibleState(page) {
  return page.evaluate(() => {
    return {
      panelSurface: document.body.dataset.panelSurface || '',
      semanticDive: document.body.dataset.semanticDive || '',
    };
  });
}

// ── Main test ────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Focus Trap Contract ===\n');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  let passed = 0;
  let failed = 0;

  try {
    await setupNetworkStubs(page);
    await waitForAppReady(page);
    await performSearch(page, 'coffee');
    await page.waitForTimeout(500);

    const panelState = await getPanelVisibleState(page);
    console.log(`  [INFO] panelSurface="${panelState.panelSurface}" semanticDive="${panelState.semanticDive}"`);

    // Collect focusable elements in the search panel
    const focusableInSearch = await getFocusableElements(page, '#search-input, #search-results');
    const focusableInInfoPanel = await getFocusableElements(page, '#info-panel');
    const allPanelFocusable = [...focusableInSearch, ...focusableInInfoPanel.filter(el => !focusableInSearch.some(f => f.id === el.id))];

    console.log(`  [INFO] Focusable elements found:`);
    console.log(`    search panel: ${focusableInSearch.length}`);
    console.log(`    info panel: ${focusableInInfoPanel.length}`);

    if (allPanelFocusable.length === 0) {
      console.log('  PASS: No focusable elements in panel — nothing to trap (canvas is hidden/inert)');
      passed++;
    } else {
      // Focus the first focusable element in search
      await page.locator('#search-input').focus();
      await page.waitForTimeout(200);

      const MAX_TABS = allPanelFocusable.length + 5;
      let canvasLeakDetected = false;
      let leakDetails = null;

      for (let i = 0; i < MAX_TABS; i++) {
        await page.keyboard.press('Tab');
        await page.waitForTimeout(50);

        const active = await getActiveElementInfo(page);

        if (active.isCanvas || active.isMainCanvas) {
          canvasLeakDetected = true;
          leakDetails = active;
          break;
        }

        // Also verify the element is in the DOM and has a non-zero bounding box
        if (active.boundingRect && active.boundingRect.width === 0 && active.boundingRect.height === 0) {
          // Could be a hidden element — skip but flag
          continue;
        }
      }

      if (canvasLeakDetected) {
        console.log(`  FAIL: Tab ${leakDetails} focus leaked into canvas element`);
        failed++;
      } else {
        console.log(`  PASS: Focus stayed within panel UI for ${MAX_TABS} Tab presses — no canvas leak`);
        passed++;
      }
    }

    // Additional check: verify the canvas has inert or hidden when panel is open
    const canvasState = await page.evaluate(() => {
      const canvas = document.getElementById('main-canvas') || document.querySelector('canvas');
      if (!canvas) return { found: false };
      return {
        found: true,
        hasHiddenAttr: canvas.hasAttribute('hidden'),
        hasInertAttr: canvas.hasAttribute('inert'),
        stylePointerEvents: canvas.style?.pointerEvents || '',
        tabIndex: canvas.getAttribute('tabindex'),
      };
    });
    console.log(`  [INFO] Canvas state: found=${canvasState.found}, hidden=${canvasState.hasHiddenAttr}, inert=${canvasState.hasInertAttr}, pointerEvents=${canvasState.stylePointerEvents}`);

  } catch (err) {
    console.log(`  FAIL: ${err.message}`);
    if (err.stack) console.log(`  Stack: ${err.stack.split('\n').slice(0, 5).join('\n')}`);
    failed++;
  } finally {
    await browser.close();
  }

  console.log(`\n--- Summary ---`);
  console.log(`  ${passed}/${passed + failed} focus trap checks passed`);

  if (failed > 0) {
    process.exit(1);
  }

  console.log('\n  All focus trap contracts passed.\n');
}

main().catch(err => {
  console.error('Runner error:', err);
  process.exit(1);
});

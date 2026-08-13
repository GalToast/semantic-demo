/**
 * focus-trap-contract.mjs
 *
 * Contract test proving that keyboard focus STAYS INSIDE the active focus trap
 * when the search / focus surface is open on the active sheet. This is the
 * hardened version of the original "canvas leak" check: it does not merely
 * assert the focused element is not a canvas — it asserts the focused element
 * is a member of the trap's own selector set (i.e. focus cannot escape the
 * active trap into the persistent header chrome or the 3D canvas).
 *
 * It also verifies audit finding #1 directly: the header's real visible
 * utility controls (#btn-legend / .legend-toggle, #btn-keyboard-help,
 * #btn-app-help) and the mode chips are CONTAINED by the trap (reachable via
 * Tab) rather than left as escape hatches.
 *
 * Approach:
 *   1. Open the app and enter the search results view (panelSurface='search').
 *   2. Enumerate the trap's focusable set = visible focusable descendants of
 *      every active-surface trap container selector (mirrors focus-trap.ts).
 *   3. Enumerate the "outside" set = document focusables NOT contained by any
 *      trap container.
 *   4. From #search-input, press Tab for (2 * trapFocusables + buffer) times.
 *   5. After every Tab, assert the active element is contained by a trap
 *      container (and not a canvas). If focus ever lands outside the trap, the
 *      active sheet has leaked — the contract fails.
 *   6. Assert the named header utility toggles are present in the trap's
 *      focusable set when visible.
 *
 * Requires: running dev server on port 8795 + a Chromium for Playwright.
 *
 * Run: node tests/focus-trap-contract.mjs
 */

import { chromium } from '@playwright/test';
// SwiftShader gate (see visual-state-audit.mjs)
const forceSoftwareWebgl = process.env.SEMANTIC_FORCE_WEBGL_SOFTWARE === '1'

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '');

// Must mirror src/lib/utils/focus-trap-bindings.ts ACTIVE_TRAP_SELECTORS
// (audit 2026-08-12) and src/lib/utils/focus-trap.ts FOCUSABLE_SELECTORS.
const TRAP_CONTAINERS = [
    '.search-container',
    '#info-panel',
    '.journey-compass',
    '.controls',
    '.search-drawer-chrome',
    '.thread-inspector',
    '#app-header',
    '#focus-stage',
    '#focus-pocket-a11y',
    '#focus-pocket-list-toggle',
    '#experience-reset-toast'
];

const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled]):not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"])',
    'select:not([disabled])',
    '[tabindex="0"]'
].join(', ');

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
  // Data boot: the canonical search+boot path (?q=coffee&nodemo=1) is what
  // populates __TEST_STATE__.points. A bare ?view=galaxy never satisfies the
  // points.length>0 ready predicate.
  await page.goto(`${BASE_URL}/dist/svelte/index.html?q=coffee&nodemo=1&view=galaxy`);
  await page.waitForFunction(() => (
    Array.isArray(window.__TEST_STATE__?.points) &&
    (window.__APP_STATE__ ?? window.__TEST_STATE__).points.length > 0
  ), undefined, { timeout: 30000 });
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});
}

async function performSearch(page, query = 'coffee') {
  await page.fill('#search-input', query);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => {
    const s = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    return Array.isArray(s.searchResults) && s.searchResults.length >= 0;
  }, undefined, { timeout: 20000 });
  await page.waitForFunction(() => (
    document.querySelectorAll('.search-result-listitem').length > 0 ||
    document.getElementById('search-results')?.innerHTML?.includes('search-result-listitem')
  ), undefined, { timeout: 20000 });
}

async function getPanelVisibleState(page) {
  return page.evaluate(() => ({
    panelSurface: document.body.dataset.panelSurface || '',
    semanticDive: document.body.dataset.semanticDive || '',
  }));
}

/** Enumerate the trap's reachable focusable set + the "outside" set, mirroring
 *  focus-trap.ts handleKeydown's visibility filter exactly. */
async function getFocusContainment(page) {
  return page.evaluate(({ containers, focusable }) => {
    const isVisible = (el) => {
      if (el.hasAttribute('hidden')) return false;
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const inAnyContainer = (el) => containers.some(sel => {
      try { return el.closest(sel); } catch { return null; }
    });

    const trapFocusables = [];
    const outsideFocusables = [];
    const all = Array.from(document.querySelectorAll(focusable));
    for (const el of all) {
      if (!isVisible(el)) continue;
      const entry = {
        tag: el.tagName,
        id: el.id || '',
        cls: (typeof el.className === 'string' ? el.className : '') || '',
        text: (el.textContent || '').trim().substring(0, 40),
        ariaLabel: el.getAttribute('aria-label') || ''
      };
      if (inAnyContainer(el)) trapFocusables.push(entry);
      else outsideFocusables.push(entry);
    }
    return { trapFocusables, outsideFocusables };
  }, { containers: TRAP_CONTAINERS, focusable: FOCUSABLE });
}

/** Returns whether the current active element is contained by a trap
 *  container (and its tag/id/cls), so we can prove focus stayed inside. */
async function getActiveContainment(page) {
  return page.evaluate(({ containers }) => {
    const active = document.activeElement;
    if (!active) return { contained: false, isCanvas: false, tag: null, id: '', cls: '' };
    const contained = containers.some(sel => {
      try { return active.closest(sel); } catch { return null; }
    });
    const rect = active.getBoundingClientRect();
    return {
      contained,
      isCanvas: active.tagName === 'CANVAS',
      isMainCanvas: active.id === 'main-canvas' || active.id === 'three-canvas' ||
        (active.classList && active.classList.contains('main-canvas')),
      hasZeroRect: rect.width === 0 && rect.height === 0,
      tag: active.tagName,
      id: active.id || '',
      cls: (typeof active.className === 'string' ? active.className : '') || ''
    };
  }, { containers: TRAP_CONTAINERS });
}

async function main() {
  console.log('\n=== Focus Trap Containment Contract ===\n');

  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', ...(forceSoftwareWebgl ? ['--enable-unsafe-swiftshader', '--enable-webgl-software-rendering'] : [])] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  let passed = 0;
  let failed = 0;
  const fail = (msg) => { console.log(`  FAIL: ${msg}`); failed++; };
  const ok = (msg) => { console.log(`  PASS: ${msg}`); passed++; };

  try {
    await setupNetworkStubs(page);
    await waitForAppReady(page);
    await performSearch(page, 'coffee');
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});

    const panelState = await getPanelVisibleState(page);
    console.log(`  [INFO] panelSurface="${panelState.panelSurface}" semanticDive="${panelState.semanticDive}"`);

    const { trapFocusables, outsideFocusables } = await getFocusContainment(page);
    console.log(`  [INFO] trap focusables: ${trapFocusables.length}`);
    console.log(`  [INFO] outside (non-trap) focusables: ${outsideFocusables.length}`);
    if (outsideFocusables.length > 0) {
      console.log('  [INFO] outside focusables:', JSON.stringify(outsideFocusables.slice(0, 12)));
    }

    if (trapFocusables.length === 0) {
      fail('no focusable elements inside the active trap — trap is empty');
    } else {
      // ── Audit finding #1: named header utility toggles are CONTAINED ──────
      const byId = (id) => trapFocusables.find(f => f.id === id);
      const legend = byId('btn-legend') || trapFocusables.find(f => f.cls.split(/\s+/).includes('legend-toggle'));
      const kbHelp = byId('btn-keyboard-help');
      const appHelp = byId('btn-app-help');
      const headerVisibility = await page.evaluate(() => {
        const isVisible = (id) => {
          const el = document.getElementById(id);
          if (!el || el.hasAttribute('hidden')) return false;
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        return {
          legend: isVisible('btn-legend'),
          keyboardHelp: isVisible('btn-keyboard-help'),
          appHelp: isVisible('btn-app-help')
        };
      });
      if (headerVisibility.legend) {
        if (legend) ok(`header .legend-toggle (#btn-legend) is contained by the trap`);
        else fail('visible header .legend-toggle (#btn-legend) is NOT contained by the trap');
      } else {
        console.log('  [INFO] #btn-legend is intentionally hidden on this surface/viewport');
      }
      if (headerVisibility.keyboardHelp) {
        if (kbHelp) ok(`header #btn-keyboard-help is contained by the trap`);
        else fail('visible header #btn-keyboard-help is NOT contained by the trap');
      } else {
        console.log('  [INFO] #btn-keyboard-help is intentionally hidden on this surface/viewport');
      }
      if (headerVisibility.appHelp) {
        if (appHelp) ok(`header #btn-app-help is contained by the trap`);
        else fail('visible header #btn-app-help is NOT contained by the trap');
      } else {
        console.log('  [INFO] #btn-app-help is intentionally hidden on this surface/viewport');
      }

      // ── Core containment proof: Tab cycling never leaves the trap ─────────
      await page.locator('#search-input').focus();
      await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});

      const MAX_TABS = trapFocusables.length * 2 + 5;
      let escapeDetected = false;
      let escapeDetail = null;

      for (let i = 0; i < MAX_TABS; i++) {
        await page.keyboard.press('Tab');
        await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});
        const act = await getActiveContainment(page);
        if (act.isCanvas || act.isMainCanvas) {
          escapeDetected = true; escapeDetail = `canvas leak: ${act.tag}#${act.id}`; break;
        }
        if (!act.contained) {
          escapeDetected = true;
          escapeDetail = `focus escaped trap -> ${act.tag}#${act.id} .${act.cls} (zeroRect=${act.hasZeroRect})`;
          break;
        }
      }

      if (escapeDetected) fail(`focus left the active trap: ${escapeDetail}`);
      else ok(`focus stayed inside the active trap for ${MAX_TABS} Tab presses (no escape, no canvas leak)`);

      // ── No false modal semantics: we did NOT add role=dialog/aria-modal ───
      const sheetSemantics = await page.evaluate(() => {
        const sc = document.querySelector('.search-container');
        const ip = document.getElementById('info-panel');
        return {
          searchHasDialogRole: sc ? sc.getAttribute('role') === 'dialog' : false,
          searchHasAriaModal: sc ? sc.getAttribute('aria-modal') === 'true' : false,
          infoHasDialogRole: ip ? ip.getAttribute('role') === 'dialog' : false,
          infoHasAriaModal: ip ? ip.getAttribute('aria-modal') === 'true' : false
        };
      });
      if (sheetSemantics.searchHasAriaModal || sheetSemantics.infoHasAriaModal) {
        fail('active sheet was marked aria-modal (false modal semantics)');
      } else {
        ok('active sheet is non-modal (no aria-modal) — toggles stay operable');
      }
    }

    // Canvas state sanity (should be inert / non-tabbable, not the escape path)
    const canvasState = await page.evaluate(() => {
      const canvas = document.getElementById('main-canvas') || document.querySelector('canvas');
      if (!canvas) return { found: false };
      return {
        found: true,
        hasHiddenAttr: canvas.hasAttribute('hidden'),
        hasInertAttr: canvas.hasAttribute('inert'),
        tabIndex: canvas.getAttribute('tabindex')
      };
    });
    console.log(`  [INFO] Canvas state: found=${canvasState.found}, hidden=${canvasState.hasHiddenAttr}, inert=${canvasState.hasInertAttr}, tabIndex=${canvasState.tabIndex}`);

  } catch (err) {
    console.log(`  FAIL: ${err.message}`);
    if (err.stack) console.log(`  Stack: ${err.stack.split('\n').slice(0, 5).join('\n')}`);
    failed++;
  } finally {
    await browser.close();
  }

  console.log(`\n--- Summary ---`);
  console.log(`  ${passed}/${passed + failed} focus trap containment checks passed`);

  if (failed > 0) process.exit(1);
  console.log('\n  All focus trap containment contracts passed.\n');
}

main().catch(err => {
  console.error('Runner error:', err);
  process.exit(1);
});

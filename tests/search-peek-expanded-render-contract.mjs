/**
 * search-peek-expanded-render-contract.mjs
 *
 * Standalone rendered contract test for search peek and expanded modes.
 * Validates DOM visibility, text clipping, and horizontal overflow for each mode.
 *
 * Peek mode:    first result visible, extra results clipped (not hidden), count hidden,
 *               what/meta/context/bar hidden via display:none, no horizontal overflow.
 * Expanded mode: count visible, multiple results visible, meta/context visible, no clipping/overflow.
 * Error state:  retry/dismiss buttons with touch target >= 44px.
 *
 * Usage:
 *   node tests/search-peek-expanded-render-contract.mjs [url]
 *   Default URL: http://127.0.0.1:8812/vector-explorer-polished.html
 */

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, extname } from 'path';

const ROOT = process.cwd();
const headed = process.env.CONTRACT_HEADED === '1' || process.env.PLAYWRIGHT_HEADED === '1' || process.env.PWDEBUG === '1';

// ---------------------------------------------------------------------------
// Inline HTTP server (serves project files, auto-shutdown)
// ---------------------------------------------------------------------------

function startServer(port) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const pathname = new URL(req.url, `http://127.0.0.1:${port}`).pathname;
      const url = pathname === '/' ? '/vector-explorer-polished.html' : pathname;
      const file = join(ROOT, url);
      try {
        const content = readFileSync(file);
        const ct = extname(file) === '.css' ? 'text/css'
          : extname(file) === '.ts' ? 'application/javascript'
          : 'text/html';
        res.writeHead(200, { 'Content-Type': ct });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    server.listen(port, () => resolve(server));
  });
}

// ---------------------------------------------------------------------------
// Deterministic search-results HTML injection
// ---------------------------------------------------------------------------

const SAMPLE_RESULTS_HTML = `
<div id="search-results-count" class="search-results-count" role="status" aria-live="polite" aria-atomic="true">5 shown · 7 found</div>
<div id="search-result-list" class="search-result-list" role="list">
  <div class="search-result-listitem" role="listitem">
    <button class="search-result-item top-result is-anchor" id="search-result-0" data-index="0" data-order="0" type="button" role="button" tabindex="0" aria-label="Focus Alpha Coffee LLC. Anchor.">
      <div class="search-result-row">
        <div class="search-result-rank">Anchor</div>
        <div class="search-result-name">Alpha Coffee LLC</div>
        <div class="search-result-badges"></div>
      </div>
      <div class="search-result-what">Coffee shop in Conroe.</div>
      <div class="search-result-context">Food &amp; Drink · Conroe</div>
      <div class="search-result-meta">
        <div class="search-result-stage">Anchor</div>
        <div class="search-result-strength">Top result</div>
      </div>
      <div class="search-result-bar"><span style="width:100%"></span></div>
    </button>
  </div>
  <div class="search-result-listitem" role="listitem">
    <button class="search-result-item is-secondary" id="search-result-1" data-index="1" data-order="1" type="button" role="button" tabindex="0" aria-label="Focus Coffee Depot. Strong match.">
      <div class="search-result-row">
        <div class="search-result-rank">Result 2</div>
        <div class="search-result-name">Coffee Depot</div>
        <div class="search-result-badges"></div>
      </div>
      <div class="search-result-what">Espresso bar in Montgomery.</div>
      <div class="search-result-context">Food &amp; Drink · Montgomery</div>
      <div class="search-result-meta">
        <div class="search-result-strength">Strong match</div>
      </div>
      <div class="search-result-bar"><span style="width:88%"></span></div>
    </button>
  </div>
  <div class="search-result-listitem" role="listitem">
    <button class="search-result-item is-secondary" id="search-result-2" data-index="2" data-order="2" type="button" role="button" tabindex="0" aria-label="Focus Morning Brew. Good match.">
      <div class="search-result-row">
        <div class="search-result-rank">Result 3</div>
        <div class="search-result-name">Morning Brew</div>
        <div class="search-result-badges"></div>
      </div>
      <div class="search-result-what">Bistro and coffee spot in The Woodlands.</div>
      <div class="search-result-context">Food &amp; Drink · The Woodlands</div>
      <div class="search-result-meta">
        <div class="search-result-strength">Good match</div>
      </div>
      <div class="search-result-bar"><span style="width:72%"></span></div>
    </button>
  </div>
</div>
<button class="search-show-more-btn" type="button" aria-label="Show 2 more search results">Show 2 more results</button>
`;

async function waitForAppSettled(page) {
  await page.waitForFunction(() => {
    const body = document.body;
    const overlay = document.getElementById('loading-overlay');
    return Boolean(document.querySelector('.search-container') && document.querySelector('#search-results'))
      || body?.dataset?.sceneReady === 'true'
      || body?.dataset?.loadingOverlay === 'hidden'
      || overlay?.hidden === true
      || overlay?.classList.contains('hidden');
  }, { timeout: 3000 }).catch(() => {});
}

async function installSearchFixture(page, detail = 'peek') {
  await page.evaluate(({ html, detail }) => {
    document.body.classList.add('is-active');
    document.body.dataset.activeView = 'galaxy';
    document.body.dataset.graphContext = 'search';
    document.body.dataset.panelSurface = 'search';
    document.body.dataset.panelSurfaceDetail = detail;
    document.body.dataset.mobileSearchSheet = detail;

    let container = document.querySelector('.search-container');
    if (!container) {
      container = document.createElement('section');
      container.className = 'search-container glass-medium';
      container.setAttribute('role', 'search');
      document.body.appendChild(container);
    }

    let results = document.querySelector('#search-results');
    if (!results) {
      results = document.createElement('div');
      results.id = 'search-results';
      results.className = 'search-results glass-light';
      results.setAttribute('role', 'region');
      results.setAttribute('aria-label', 'Search results');
      container.appendChild(results);
    } else if (!container.contains(results)) {
      container.appendChild(results);
    }

    if (container && results) {
      results.innerHTML = html;
      results.classList.add('active');
      results.classList.toggle('is-expanded', detail === 'expanded');
      container.classList.add('has-query', 'results-rendered');
      container.classList.toggle('has-expanded-results', detail === 'expanded');
    }
  }, { html: SAMPLE_RESULTS_HTML, detail });
}

// ---------------------------------------------------------------------------
// Peek mode assertions
//
// CSS contract (from css/mobile_premium.css STATE-MACHINE section):
//   peek hides: .search-results-count, .search-result-what,
//               .search-result-meta, .search-result-context,
//               .search-result-bar, .search-result-badges
//               (all via display:none)
//   peek hides: non-first .search-result-listitem so the collapsed sheet
//               exposes one clean anchor row without clipped row slivers
// ---------------------------------------------------------------------------

async function assertPeekMode(page, ctx) {
  const info = await page.evaluate(() => {
    function textClipped(el) {
      if (!el) return false;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return el.scrollWidth > rect.width + 3 || el.scrollHeight > rect.height + 3;
    }

    const results = document.querySelector('#search-results');
    const countEl = document.querySelector('#search-results-count');
    const allItems = Array.from(results?.querySelectorAll('.search-result-item') || []);
    const firstItem = allItems[0] || null;
    const firstRank = firstItem?.querySelector('.search-result-rank');
    const firstName = firstItem?.querySelector('.search-result-name');
    const peekWhat = firstItem?.querySelector('.search-result-what');
    const peekMeta = firstItem?.querySelector('.search-result-meta');
    const peekContext = firstItem?.querySelector('.search-result-context');
    const peekBar = firstItem?.querySelector('.search-result-bar');
    const nonFirst = allItems.slice(1);

    const firstItemDisplay = firstItem ? getComputedStyle(firstItem).display : null;
    const firstItemRect = firstItem?.getBoundingClientRect();
    const resultsStyle = results ? getComputedStyle(results) : null;
    const resultsRect = results?.getBoundingClientRect();
    const firstItemClipped = textClipped(firstRank) || textClipped(firstName);
    const countDisplay = countEl ? getComputedStyle(countEl).display : null;
    const countClipped = textClipped(countEl);

    return {
      bodyClasses: Array.from(document.body.classList),
      panelSurface: document.body.dataset.panelSurface,
      panelSurfaceDetail: document.body.dataset.panelSurfaceDetail,
      resultsPresent: results !== null,
      resultsHeight: resultsRect?.height ?? null,
      resultsComputedHeight: resultsStyle?.height ?? null,
      resultsMinHeight: resultsStyle?.minHeight ?? null,
      resultsMaxHeight: resultsStyle?.maxHeight ?? null,
      resultsFlexBasis: resultsStyle?.flexBasis ?? null,
      firstItemDisplay,
      firstItemHeight: firstItemRect?.height,
      firstItemClipped,
      countDisplay,
      countClipped,
      whatDisplay: peekWhat ? getComputedStyle(peekWhat).display : null,
      metaDisplay: peekMeta ? getComputedStyle(peekMeta).display : null,
      contextDisplay: peekContext ? getComputedStyle(peekContext).display : null,
      barDisplay: peekBar ? getComputedStyle(peekBar).display : null,
      nonFirstDisplays: nonFirst.map(el => getComputedStyle(el).display),
      nonFirstOverflow: nonFirst.map(el => getComputedStyle(el).overflow),
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      totalItems: allItems.length,
    };
  });

  if (info.resultsPresent) ctx.pass('peek', 'dom:search-results');
  else { ctx.fail('peek', 'dom:search-results', 'missing #search-results'); return info; }

  if (info.panelSurface === 'search' && info.panelSurfaceDetail === 'peek') {
    ctx.pass('peek', 'state:panel-surface-detail');
  } else {
    ctx.fail('peek', 'state:panel-surface-detail', `expected search/peek, got ${info.panelSurface || 'missing'}/${info.panelSurfaceDetail || 'missing'}`);
  }

  if (info.resultsHeight >= 71.5) {
    ctx.pass('peek', 'layout:results-height-72px');
  } else {
    ctx.fail(
      'peek',
      'layout:results-height-72px',
      `#search-results.active height ${info.resultsHeight}px; expected >= 72px`
    );
  }

  if (info.resultsMinHeight === '72px' && info.resultsMaxHeight === '72px') {
    ctx.pass('peek', 'layout:results-min-max-height-72px');
  } else {
    ctx.fail(
      'peek',
      'layout:results-min-max-height-72px',
      `computed min/max height ${info.resultsMinHeight}/${info.resultsMaxHeight}; expected 72px/72px`
    );
  }

  if (info.resultsFlexBasis === '72px') {
    ctx.pass('peek', 'layout:results-flex-basis-72px');
  } else {
    ctx.fail(
      'peek',
      'layout:results-flex-basis-72px',
      `computed flex-basis ${info.resultsFlexBasis}; expected 72px`
    );
  }

  if (info.firstItemDisplay !== 'none') ctx.pass('peek', 'visibility:first-result-display-not-none');
  else ctx.fail('peek', 'visibility:first-result-display-not-none', 'first result has display:none');

  if (!info.firstItemClipped) ctx.pass('peek', 'text-clipping:first-result');
  else ctx.fail('peek', 'text-clipping:first-result', 'first result text is clipped');

  // count hidden via display:none
  if (info.countDisplay === 'none') ctx.pass('peek', 'visibility:count-hidden-in-peek');
  else ctx.fail('peek', 'visibility:count-hidden-in-peek', `.search-results-count display="${info.countDisplay}" should be "none"`);

  // what/meta/context/bar hidden via display:none
  if (info.whatDisplay === 'none') ctx.pass('peek', 'visibility:result-what-hidden-in-peek');
  else ctx.fail('peek', 'visibility:result-what-hidden-in-peek', `.search-result-what display="${info.whatDisplay}" should be "none"`);

  if (info.metaDisplay === 'none') ctx.pass('peek', 'visibility:result-meta-hidden-in-peek');
  else ctx.fail('peek', 'visibility:result-meta-hidden-in-peek', `.search-result-meta display="${info.metaDisplay}" should be "none"`);

  if (info.contextDisplay === 'none') ctx.pass('peek', 'visibility:result-context-hidden-in-peek');
  else ctx.fail('peek', 'visibility:result-context-hidden-in-peek', `.search-result-context display="${info.contextDisplay}" should be "none"`);

  if (info.barDisplay === 'none') ctx.pass('peek', 'visibility:result-bar-hidden-in-peek');
  else ctx.fail('peek', 'visibility:result-bar-hidden-in-peek', `.search-result-bar display="${info.barDisplay}" should be "none"`);

  const allNonFirstHidden = info.nonFirstDisplays.every(display => display === 'none');
  if (allNonFirstHidden) ctx.pass('peek', 'visibility:non-first-results-hidden-in-peek', 'non-first items are hidden in collapsed peek mode');
  else {
    const details = info.nonFirstDisplays.map((display, i) => `${display} (overflow: ${info.nonFirstOverflow[i]})`).join(', ');
    ctx.fail('peek', 'visibility:non-first-results-hidden-in-peek', `non-first item displays: [${details}], body classes: [${info.bodyClasses.join(', ')}]`);
  }

  if (!info.overflowX) ctx.pass('peek', 'layout:no-overflow-x');
  else ctx.fail('peek', 'layout:overflow-x', 'horizontal overflow in peek mode');

  return info;
}

// ---------------------------------------------------------------------------
// Expanded mode assertions
// ---------------------------------------------------------------------------

async function assertExpandedMode(page, ctx) {
  const info = await page.evaluate(() => {
    function textClipped(el) {
      if (!el) return false;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return el.scrollWidth > rect.width + 3 || el.scrollHeight > rect.height + 3;
    }

    function isVisible(el) {
      if (!el) return false;
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && el.getBoundingClientRect().height > 0;
    }

    const results = document.querySelector('#search-results');
    const countEl = document.querySelector('#search-results-count');
    const allItems = Array.from(results?.querySelectorAll('.search-result-item') || []);
    const firstItem = allItems[0] || null;
    const peekWhat = firstItem?.querySelector('.search-result-what');
    const peekMeta = firstItem?.querySelector('.search-result-meta');
    const peekContext = firstItem?.querySelector('.search-result-context');
    const peekBar = firstItem?.querySelector('.search-result-bar');
    const visibleItems = allItems.filter(isVisible);

    return {
      resultsPresent: results !== null,
      countDisplay: countEl ? getComputedStyle(countEl).display : null,
      countClipped: textClipped(countEl),
      whatDisplay: peekWhat ? getComputedStyle(peekWhat).display : null,
      whatClipped: textClipped(peekWhat),
      metaDisplay: peekMeta ? getComputedStyle(peekMeta).display : null,
      contextDisplay: peekContext ? getComputedStyle(peekContext).display : null,
      barDisplay: peekBar ? getComputedStyle(peekBar).display : null,
      visibleItemsCount: visibleItems.length,
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      totalItems: allItems.length,
    };
  });

  if (info.resultsPresent) ctx.pass('expanded', 'dom:search-results');
  else { ctx.fail('expanded', 'dom:search-results', 'missing #search-results'); return info; }

  if (info.countDisplay !== 'none') ctx.pass('expanded', 'visibility:count-visible');
  else ctx.fail('expanded', 'visibility:count-visible', `.search-results-count display="${info.countDisplay}" should not be "none"`);

  if (!info.countClipped) ctx.pass('expanded', 'text-clipping:count');
  else ctx.fail('expanded', 'text-clipping:count', 'result count text is clipped');

  if (info.whatDisplay !== 'none') ctx.pass('expanded', 'visibility:result-what-visible');
  else ctx.fail('expanded', 'visibility:result-what-visible', `.search-result-what display="${info.whatDisplay}" should not be "none"`);

  if (!info.whatClipped) ctx.pass('expanded', 'text-clipping:result-what');
  else ctx.fail('expanded', 'text-clipping:result-what', '.search-result-what text is clipped');

  if (info.metaDisplay !== 'none') ctx.pass('expanded', 'visibility:result-meta-visible');
  else ctx.fail('expanded', 'visibility:result-meta-visible', `.search-result-meta display="${info.metaDisplay}" should not be "none"`);

  if (info.contextDisplay !== 'none') ctx.pass('expanded', 'visibility:result-context-visible');
  else ctx.fail('expanded', 'visibility:result-context-visible', `.search-result-context display="${info.contextDisplay}" should not be "none"`);

  if (info.barDisplay !== 'none') ctx.pass('expanded', 'visibility:result-bar-visible');
  else ctx.fail('expanded', 'visibility:result-bar-visible', `.search-result-bar display="${info.barDisplay}" should not be "none"`);

  if (info.visibleItemsCount >= 2) ctx.pass('expanded', 'visibility:multiple-results-visible', `${info.visibleItemsCount} results visible`);
  else ctx.fail('expanded', 'visibility:multiple-results-visible', `only ${info.visibleItemsCount} result(s) visible — expected ≥2`);

  if (!info.overflowX) ctx.pass('expanded', 'layout:no-overflow-x');
  else ctx.fail('expanded', 'layout:overflow-x', 'horizontal overflow in expanded mode');

  return info;
}

// ---------------------------------------------------------------------------
// Error state assertions (degraded/retries)
// Touch targets must be >= 44px
// ---------------------------------------------------------------------------

async function assertErrorState(page, ctx) {
  await page.evaluate(() => {
    document.body.classList.add('is-active');
    document.body.dataset.activeView = 'galaxy';
    document.body.dataset.graphContext = 'search';
    document.body.dataset.panelSurface = 'search';
    document.body.dataset.panelSurfaceDetail = 'expanded';
    document.body.dataset.mobileSearchSheet = 'expanded';

    const results = document.querySelector('#search-results');
    let status = document.getElementById('search-status');
    if (!status) {
      status = document.createElement('div');
      status.id = 'search-status';
      document.body.appendChild(status);
    }

    if (typeof window.applySemanticSearchDegradedState === 'function') {
      window.applySemanticSearchDegradedState(results, status, 'coffee', new Error('Simulated failure'));
    } else {
      results.classList.remove('searching');
      results.classList.add('active');
      results.innerHTML = `
        <div class="search-error-state" role="alert">
          <span class="search-error-kicker">Retry needed</span>
          <p class="search-error-text">We could not finish "<strong>coffee</strong>" just now.</p>
          <div class="search-error-actions">
            <button class="search-error-retry-btn" type="button" aria-label="Retry search for coffee">Retry</button>
            <button class="search-error-dismiss-btn" type="button" aria-label="Clear search and dismiss">Clear</button>
          </div>
        </div>`;
      status.classList.add('active', 'search-status-compact');
      status.textContent = 'Search paused for "coffee". Try again in a moment.';
      const container = document.querySelector('.search-container');
      if (container) container.classList.add('has-query', 'results-rendered', 'has-expanded-results', 'search-degraded');
    }
  });
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});

  const info = await page.evaluate(() => {
    function touchTargetInfo(el) {
      if (!el) return { width: null, height: null, display: null };
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height, display: getComputedStyle(el).display };
    }

    function touchTargetOk(el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width >= 43.5 && r.height >= 43.5;
    }

    const errorState = document.querySelector('.search-error-state');
    const retryBtn = document.querySelector('.search-error-retry-btn');
    const dismissBtn = document.querySelector('.search-error-dismiss-btn');

    return {
      errorStatePresent: errorState !== null,
      errorStateVisible: errorState
        ? getComputedStyle(errorState).display !== 'none' && getComputedStyle(errorState).visibility !== 'hidden'
        : null,
      retryBtnPresent: retryBtn !== null,
      retryBtnInfo: touchTargetInfo(retryBtn),
      retryBtnTouchTarget: touchTargetOk(retryBtn),
      dismissBtnPresent: dismissBtn !== null,
      dismissBtnInfo: touchTargetInfo(dismissBtn),
      dismissBtnTouchTarget: touchTargetOk(dismissBtn),
    };
  });

  if (info.errorStatePresent) ctx.pass('error', 'dom:search-error-state');
  else ctx.fail('error', 'dom:search-error-state', '.search-error-state not found');

  if (info.errorStateVisible) ctx.pass('error', 'visibility:search-error-state');
  else ctx.fail('error', 'visibility:search-error-state', 'search error state is hidden');

  if (info.retryBtnPresent) ctx.pass('error', 'dom:retry-btn');
  else ctx.fail('error', 'dom:retry-btn', '.search-error-retry-btn not found');

  if (info.retryBtnTouchTarget === true) ctx.pass('error', 'touch-target:retry-btn');
  else if (info.retryBtnTouchTarget === false) {
    ctx.fail('error', 'touch-target:retry-btn',
      `retry button (${info.retryBtnInfo.width?.toFixed(1)}×${info.retryBtnInfo.height?.toFixed(1)}px, display=${info.retryBtnInfo.display}) < 44px tall`);
  } else {
    ctx.fail('error', 'touch-target:retry-btn', 'retry button not in DOM');
  }

  if (info.dismissBtnPresent) ctx.pass('error', 'dom:dismiss-btn');
  else ctx.fail('error', 'dom:dismiss-btn', '.search-error-dismiss-btn not found');

  if (info.dismissBtnTouchTarget === true) ctx.pass('error', 'touch-target:dismiss-btn');
  else if (info.dismissBtnTouchTarget === false) {
    ctx.fail('error', 'touch-target:dismiss-btn',
      `dismiss button (${info.dismissBtnInfo.width?.toFixed(1)}×${info.dismissBtnInfo.height?.toFixed(1)}px) < 44px tall`);
  } else {
    ctx.fail('error', 'touch-target:dismiss-btn', 'dismiss button not in DOM');
  }

  return info;
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

async function main() {
  const requestedUrl = process.argv[2] || null;

  if (requestedUrl && !requestedUrl.startsWith('http')) {
    console.error('URL must start with http:// or https://');
    process.exit(1);
  }

  const server = requestedUrl ? null : await startServer(0);
  const localPort = server?.address()?.port;
  const url = requestedUrl || `http://127.0.0.1:${localPort}/vector-explorer-polished.html`;
  if (server) console.log(`Server started on http://127.0.0.1:${localPort}`);

  const browser = await chromium.launch({
    headless: !headed,
    args: headed ? ['--use-gl=angle', '--enable-webgl', '--no-sandbox'] : ['--no-sandbox'],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    javaScriptEnabled: true,
  });
  let passed = 0;
  let failed = 0;
  const failures = [];

  const ctx = {
    pass(surface, check) {
      passed++;
      console.log(`  PASS  ${surface}  ${check}`);
    },
    fail(surface, check, msg) {
      failed++;
      failures.push({ surface, check, msg });
      console.log(`  FAIL  ${surface}  ${check}  — ${msg}`);
    },
  };

  try {
    const page = await context.newPage();

    console.log(`\n=== Search Peek/Expanded Render Contract ===\n`);
    console.log(`URL: ${url}`);
    console.log(`Viewport: 390×844 mobile\n`);

    console.log('[1/4] Loading app...');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('load', { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    await waitForAppSettled(page);

    console.log('[2/4] Injecting deterministic search results DOM...');
    await installSearchFixture(page, 'peek');
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});

    const itemCount = await page.evaluate(() =>
      document.querySelectorAll('.search-result-item').length
    );
    console.log(`Injected ${itemCount} search result items.\n`);

    if (itemCount === 0) {
      console.log('ERROR: Could not inject search results — .search-container or #search-results not found.');
      failed++;
    } else {
      console.log('[3/4] Testing PEEK mode...');
      await installSearchFixture(page, 'peek');
      await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});
      await assertPeekMode(page, ctx);
      console.log('');

      console.log('[4/4] Testing EXPANDED mode...');
      await installSearchFixture(page, 'expanded');
      await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});
      await assertExpandedMode(page, ctx);
      console.log('');

      console.log('[BONUS] Testing ERROR state...');
      await assertErrorState(page, ctx);
      console.log('');
    }

  } catch (err) {
    console.error('Test runner error:', err.message);
    failed++;
  } finally {
    await context.close();
    await browser.close();
    if (server) server.close();
  }

  console.log('=== Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failures.length > 0) {
    console.log('\nFailure details:');
    failures.forEach(({ surface, check, msg }) => {
      console.log(`  ${surface} / ${check}: ${msg}`);
    });
  }
  console.log('');

  if (failed > 0) {
    console.log('search-peek-expanded-render-contract FAILED');
    process.exit(1);
  } else {
    console.log('search-peek-expanded-render-contract passed');
    process.exit(0);
  }
}

main();

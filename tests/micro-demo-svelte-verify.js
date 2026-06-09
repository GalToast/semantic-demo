#!/usr/bin/env node
/**
 * Micro-demo Svelte Verification
 *
 * Tests the demo choreography against the Svelte dev server (port 5173).
 * Monitors body[data-demo-phase] attribute for state transitions.
 *
 * Run: node tests/micro-demo-svelte-verify.js
 */

import { chromium } from 'playwright';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:5173';
const STORAGE_KEY = 'moco_mycelium_demo_v1';
const SESSION_KEY = 'moco_mycelium_demo_session_v1';

const TIMING = {
  GLIDING_MS: 1400,
  CARD_VISIBLE_MS: 1800,
  PULLBACK_MS: 1200,
  RETURNING_MS: 1000,
};

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`); passed++; }
  else      { console.log(`  ✗ ${msg}`); failed++; }
}

/** Navigate to app, then clear storage. Must navigate first so storage is accessible. */
async function prepFresh(page, params = '') {
  await page.goto(`${BASE}/${params}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ s, k }) => {
    try { localStorage.removeItem(s); } catch (_e) { /* storage may be unavailable */ }
    try { localStorage.removeItem(k); } catch (_e) { /* storage may be unavailable */ }
    try { sessionStorage.clear(); } catch (_e) { /* storage may be unavailable */ }
  }, { s: STORAGE_KEY, k: SESSION_KEY });
}

async function run() {
  console.log('\n🔬 Micro-demo Svelte Verification');
  console.log(`   Base: ${BASE}\n`);

  const browser = await chromium.launch({
    headless: false,
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox']
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(30000);

  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  try {
    // ── T1: App loads and Svelte mounts ──────────────────────────────────
    console.log('Test 1: Svelte app loads and mounts');
    await prepFresh(page);
    const r = await page.goto(`${BASE}/?demo=force`, { waitUntil: 'domcontentloaded' });
    assert(r && r.status() === 200, `HTTP ${r?.status()}`);
    await page.waitForFunction(() => document.getElementById('app')?.children.length > 0, { timeout: 10000 });
    assert(true, '#app has children (Svelte mounted)');

    // ── T2: Demo starts with demo=force ──────────────────────────────────
    console.log('\nTest 2: Demo starts on first visit (demo=force)');
    await prepFresh(page);
    await page.goto(`${BASE}/?demo=force`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.body.dataset.demoPhase === 'GLIDING',
      { timeout: 15000 }
    );
    assert(true, 'Entered GLIDING phase');

    // ── T3: Full state machine trace ─────────────────────────────────────
    console.log('\nTest 3: State machine transitions (full trace)');
    await page.evaluate(() => {
      window.__trace = [];
      window.__t0 = performance.now();
      new MutationObserver(ms => {
        for (const m of ms) {
          if (m.attributeName === 'data-demo-phase') {
            window.__trace.push({
              phase: document.body.dataset.demoPhase,
              t: Math.round(performance.now() - window.__t0)
            });
          }
        }
      }).observe(document.body, { attributes: true, attributeFilter: ['data-demo-phase'] });
    });

    await page.waitForFunction(
      () => document.body.dataset.demoPhase === 'COMPLETE',
      { timeout: 30000 }
    );

    const trace = await page.evaluate(() => window.__trace);
    console.log('   Trace:');
    for (const e of trace) console.log(`     ${e.phase} @ ${e.t}ms`);

    const phases = trace.map(t => t.phase);
    for (const p of ['GLIDING','ARRIVED','CARD_VISIBLE','PULLBACK','WIDE_VIEW','RETURNING','COMPLETE']) {
      assert(phases.includes(p), `Phase ${p} appeared`);
    }
    assert(!phases.includes('CANCELLED'), 'No CANCELLED during normal run');

    // ── T4: Timing ───────────────────────────────────────────────────────
    console.log('\nTest 4: Timing verification');
    const tOf = ph => { const e = trace.find(t => t.phase === ph); return e ? e.t : null; };
    const tGliding = tOf('GLIDING');
    const tArrived = tOf('ARRIVED');
    const tCardVis = tOf('CARD_VISIBLE');
    const tPullback = tOf('PULLBACK');
    const tWideView = tOf('WIDE_VIEW');
    const tReturning = tOf('RETURNING');
    const tComplete = tOf('COMPLETE');

    if (tGliding != null && tArrived != null) {
      const d = tArrived - tGliding;
      assert(Math.abs(d - TIMING.GLIDING_MS) < 300, `GLIDING: ${d}ms (target ${TIMING.GLIDING_MS}ms ±300)`);
    }
    if (tCardVis != null && tPullback != null) {
      const d = tPullback - tCardVis;
      assert(Math.abs(d - TIMING.CARD_VISIBLE_MS) < 300, `CARD_VISIBLE: ${d}ms (target ${TIMING.CARD_VISIBLE_MS}ms ±300)`);
    }
    if (tPullback != null && tWideView != null) {
      const d = tWideView - tPullback;
      assert(Math.abs(d - TIMING.PULLBACK_MS) < 300, `PULLBACK: ${d}ms (target ${TIMING.PULLBACK_MS}ms ±300)`);
    }
    if (tReturning != null && tComplete != null) {
      const d = tComplete - tReturning;
      assert(Math.abs(d - TIMING.RETURNING_MS) < 300, `RETURNING: ${d}ms (target ${TIMING.RETURNING_MS}ms ±300)`);
    }

    // ── T5: localStorage set after completion ────────────────────────────
    console.log('\nTest 5: Storage after completion');
    const stored = await page.evaluate(() => localStorage.getItem(STORAGE_KEY));
    assert(stored !== null, `localStorage ${STORAGE_KEY} set`);
    const sess = await page.evaluate(() => sessionStorage.getItem(SESSION_KEY));
    assert(sess !== null, `sessionStorage ${SESSION_KEY} set`);

    // ── T6: Seen guard blocks repeat ─────────────────────────────────────
    console.log('\nTest 6: Seen guard blocks repeat visit');
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const ph = await page.evaluate(() => document.body.dataset.demoPhase);
    assert(ph === 'IDLE', `Repeat visit stays IDLE (phase: ${ph})`);

    // ── T7: nodemo param blocks ──────────────────────────────────────────
    console.log('\nTest 7: nodemo param blocks demo');
    await prepFresh(page);
    await page.goto(`${BASE}/?nodemo=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const ph2 = await page.evaluate(() => document.body.dataset.demoPhase);
    assert(ph2 === 'IDLE', `nodemo blocks (phase: ${ph2})`);

    // ── T8: Cancel stops demo ────────────────────────────────────────────
    console.log('\nTest 8: Cancel stops demo');
    await prepFresh(page);
    await page.goto(`${BASE}/?demo=force`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.body.dataset.demoPhase === 'GLIDING',
      { timeout: 15000 }
    );
    // Click the dismiss button
    await page.evaluate(() => {
      const btn = document.querySelector('.demo-dismiss');
      if (btn) btn.click();
    });
    await page.waitForTimeout(600);
    const ph3 = await page.evaluate(() => document.body.dataset.demoPhase);
    assert(ph3 === 'CANCELLED' || ph3 === 'IDLE', `Cancel works (phase: ${ph3})`);

    // ── T9: No critical console errors ───────────────────────────────────
    console.log('\nTest 9: No critical console errors');
    const crit = errs.filter(e => e.includes('TypeError') || e.includes('ReferenceError') || e.includes('SyntaxError'));
    assert(crit.length === 0, `No JS runtime errors (${crit.length} found)`);

  } catch (err) {
    console.error(`\n  Fatal: ${err.message}`);
    failed++;
  } finally {
    await browser.close().catch(() => {});
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'─'.repeat(50)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });

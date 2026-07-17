/**
 * W53 Mobile Dynamic-Surface Re-Capture Script
 *
 * Captures the REAL mobile dynamic surfaces (M2-search, M3-focus, M4-map, M5-filters)
 * that were obscured in the W53 visual audit by the first-visit help dialog overlay
 * on the placeholder2d render-kind.
 *
 * ROOT CAUSE (per W53 F0-b):
 *   - Without `window.__PLAYWRIGHT__ = true` injected BEFORE page.goto(),
 *     the app boots into `render-kind-placeholder2d` (2D placeholder).
 *   - Deep-links like `?q=coffee` DO set `body.dataset.panelSurface='focus-search'`
 *     even on placeholder2d, but the dynamic panels (`#search-results`,
 *     `#search-result-list`, `#search-input`) render at 0×0 with
 *     `pointer-events:none` (collapsed under the placeholder).
 *   - The auto-opened `dialog.help-dialog[open]` (351×392, centered, aria-live)
 *     sits on top, obscuring everything.
 *   - The `__PLAYWRIGHT__` flag (set via `context.addInitScript()`) triggers
 *     the eager-preload path in `src/main.ts` → `setRenderKind('webgl')`
 *     BEFORE mount, so the WebGL canvas mounts and the dynamic surfaces
 *     render at full size. The help dialog still auto-opens on first visit,
 *     so we MUST dismiss it AFTER the splash CTA click.
 *
 * GATE-THROUGH + HELP-DIALOG DISMISSAL + REACTIVE-TRIGGER FLOW:
 *   1. Launch with `context.addInitScript(() => { window.__PLAYWRIGHT__ = true })`
 *      — this flips render-kind to 'webgl' at boot (bypasses placeholder2d).
 *   2. `page.goto('?q=coffee&nodemo=1')` — deep-link activates focus-search.
 *   3. Click splash CTA (`[data-testid="splash-cta"]` or `[data-testid="placeholder-cta"]`)
 *      via `page.evaluate(...dispatchEvent...)` to fire `engineReady.signalReady()`.
 *   4. Wait for surface-settled signal.
 *   5. Dismiss help dialog:
 *        await page.evaluate(() => {
 *          const d = document.querySelector('dialog.help-dialog[open]');
 *          if (d) { if (typeof d.close === 'function') d.close(); else d.removeAttribute('open'); }
 *        });
 *        await page.keyboard.press('Escape');
 *        await page.waitForTimeout(300);
 *   6. Trigger each dynamic surface:
 *      - M2-search-coffee: deep-link `?q=coffee` already populates results after help-dismissal.
 *        Also type into `#search-input` as a fallback trigger.
 *      - M3-focus: `await page.evaluate(() => window.__navActions__?.focusOnNode(519))`
 *        OR `document.body.dataset.mobileSearchSheet = 'peek'` to surface bottom-sheet.
 *      - M4-map: navigate to `?view=map&nodemo=1` (deep-link) then dismiss overlays.
 *      - M5-filters: click filters chip (`button[name*="filter" i]`) to open sheet.
 *   7. Screenshot at 390×844 with `deviceScaleFactor: 2` (780×1688 physical pixels).
 *   8. Collect DOM metrics (overflow, low-alpha, dup-ids, blank-canvas) matching
 *      `tmp/w53-visual-capture.mjs`'s `domMetrics()` schema.
 *
 * OUTPUT:
 *   - tmp/w53-recapture/<surface>-dynamic.png (4 surfaces)
 *   - tmp/w53-recapture/metrics.json (array of surface records with same schema as w53-capture)
 *
 * RUN: `node tmp/w53-mobile-recapture.mjs` (requires Vite dev server on :5173)
 */

import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const BASE = 'http://127.0.0.1:5173/'
const u = (q) => BASE + (q || '')
const OUT = 'tmp/w53-recapture'

const mobileViewport = { width: 390, height: 844 }
const deviceScaleFactor = 2

// ─────────────────────────────────────────────────────────────────────────────
// DOM metrics collector — matches tmp/w53-visual-capture.mjs domMetrics() schema
// ─────────────────────────────────────────────────────────────────────────────
async function domMetrics(page) {
  return page.evaluate(() => {
    const de = document.documentElement
    const out = {
      scrollW: de.scrollWidth,
      clientW: de.clientWidth,
      innerW: window.innerWidth,
      hScroll: de.scrollWidth > window.innerWidth + 1,
      scrollH: de.scrollHeight,
      clientH: de.clientHeight,
      vScrollPage: de.scrollHeight > window.innerHeight + 1,
      fixedFull: [],
      lowAlpha: [],
      blankCanvas: null,
      dupIds: [],
      focusInputVisible: null,
    }

    // Fixed full-width overlays (potential click-eating / scroll-lock layers)
    let n = 0
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el)
      if (cs.position !== 'fixed') continue
      const r = el.getBoundingClientRect()
      if (r.width >= window.innerWidth - 2 && r.height > 0) {
        out.fixedFull.push({
          tag: el.tagName,
          id: el.id || '',
          cls: (el.className?.toString?.() || '').slice(0, 50),
          z: cs.zIndex,
          pe: cs.pointerEvents,
          op: cs.opacity,
          w: Math.round(r.width),
          h: Math.round(r.height),
          top: Math.round(r.top),
          left: Math.round(r.left),
        })
        if (++n >= 8) break
      }
    }

    // Low-alpha leaf text (<0.55) — likely low-contrast on dark
    let m = 0
    for (const el of document.querySelectorAll('h1,h2,h3,h4,p,span,a,button,label,li')) {
      if (el.children.length) continue
      const t = el.textContent?.trim()
      if (!t) continue
      const cs = getComputedStyle(el)
      const mt = /rgba?\(([^)]+)\)/.exec(cs.color)
      if (!mt) continue
      const p = mt[1].split(',').map((s) => s.trim())
      const a = p.length > 3 ? parseFloat(p[3]) : 1
      if (a > 0 && a < 0.55) {
        out.lowAlpha.push({ t: t.slice(0, 32), color: cs.color, a })
        if (++m >= 10) break
      }
    }

    // Canvas blank check (mobile WebGL scenes)
    const cv = document.querySelector('canvas')
    if (cv && cv.width > 0) {
      try {
        const ctx = cv.getContext('2d') || cv.getContext('webgl', { preserveDrawingBuffer: true })
        if (ctx && ctx.getImageData) {
          const { data } = ctx.getImageData(0, 0, Math.min(64, cv.width), Math.min(64, cv.height))
          let nonblank = 0
          for (let i = 3; i < data.length; i += 4) if (data[i] > 10) nonblank++
          out.blankCanvas = { sampledPx: Math.min(64, cv.width) * Math.min(64, cv.height), nonblank }
        } else if (cv.getContext) {
          out.blankCanvas = { note: 'webgl/no 2d ctx for readback' }
        }
      } catch (e) {
        out.blankCanvas = { err: String(e).slice(0, 80) }
      }
    } else {
      out.blankCanvas = { note: 'no canvas (likely placeholder2d mobile path)' }
    }

    // Duplicate IDs
    const seen = {}
    for (const el of document.querySelectorAll('[id]')) {
      const id = el.id
      ;(seen[id] = seen[id] || []).push(el.tagName)
      if (seen[id].length === 2) out.dupIds.push({ id, tags: seen[id] })
    }

    // Search input visibility (former "not visible" failure surface)
    const si = document.querySelector('#search-input')
    if (si) {
      const cs = getComputedStyle(si)
      const r = si.getBoundingClientRect()
      out.focusInputVisible = {
        display: cs.display,
        vis: cs.visibility,
        op: cs.opacity,
        w: Math.round(r.width),
        h: Math.round(r.height),
        top: Math.round(r.top),
        rectArea: r.width * r.height,
      }
    }

    return out
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
async function settle(page) {
  try {
    await page.waitForLoadState('networkidle', { timeout: 12000 })
  } catch {}
  await page.waitForTimeout(900)
}

async function waitForSurfaceSettled(page, timeout = 3000) {
  const already = await page
    .evaluate(() => document.body?.dataset?.surfaceSettled !== undefined)
    .catch(() => false)
  if (already) return true
  try {
    await page.waitForFunction(() => document.body?.dataset?.surfaceSettled !== undefined, { timeout })
    return true
  } catch {
    return false
  }
}

async function clickSplashCta(page) {
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="splash-cta"], [data-testid="placeholder-cta"]')
    if (!el) return
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  })
  // Wait for splash to dismiss and surface to settle
  await page
    .waitForFunction(
      () => {
        const cta = document.querySelector('[data-testid="splash-cta"]')
        return !cta || document.body.dataset.surfaceSettled === 'true'
      },
      null,
      { timeout: 5000 }
    )
    .catch(() => {})
}

async function dismissHelpDialog(page) {
  // The auto-opened help dialog (W47 first-visit gate) obscures the dynamic surfaces.
  // Close it via native .close() if available, else remove open attribute.
  await page.evaluate(() => {
    const d = document.querySelector('dialog.help-dialog[open]')
    if (d) {
      if (typeof d.close === 'function') d.close()
      else d.removeAttribute('open')
    }
  })
  // Also press Escape as a belt-and-suspenders (some dialogs listen for it)
  await page.keyboard.press('Escape')
  // Wait for dialog to actually close
  await page
    .waitForFunction(
      () => {
        const d = document.querySelector('dialog.help-dialog')
        return !d || !d.open
      },
      null,
      { timeout: 5000 }
    )
    .catch(() => {})
  await page.waitForTimeout(300)
}

async function tryWait(page, selector, ms = 8000) {
  if (!selector) return
  try {
    await page.waitForSelector(selector, { state: 'attached', timeout: ms })
  } catch {}
  await page.waitForTimeout(500)
}

async function openFiltersSheet(page) {
  try {
    const btn = page.getByRole('button', { name: /filter/i }).first()
    if (await btn.isVisible({ timeout: 1200 })) {
      await btn.click({ timeout: 3000 })
      await page.waitForTimeout(700)
    }
  } catch {}
}

async function triggerFocusSurface(page, index = 519) {
  // Use the nav bridge to focus a node, which surfaces the focus bottom-sheet on mobile.
  await page.waitForFunction(() => !!window.__navActions__?.focusOnNode, { timeout: 5000 }).catch(() => {})
  await page.evaluate((idx) => {
    if (window.__navActions__?.focusOnNode) window.__navActions__.focusOnNode(idx)
    // Also set the dataset flag that the mobile sheet watches
    document.body.dataset.mobileSearchSheet = 'peek'
  }, index)
  await page.waitForTimeout(700)
}

async function triggerSearchInput(page, query = 'coffee') {
  // Type into search input as a fallback trigger for search results
  try {
    await page.waitForSelector('#search-input', { state: 'visible', timeout: 10000 })
    await page.locator('#search-input').first().fill(query)
    await page.waitForFunction(
      (q) => {
        const el = document.querySelector('#search-input')
        return !!el && el.value === q
      },
      query,
      { timeout: 5000 }
    ).catch(() => {})
    await page.waitForTimeout(700)
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Surface definitions — 4 dynamic mobile surfaces
// ─────────────────────────────────────────────────────────────────────────────
const surfaces = [
  {
    id: 'M2-search-coffee-dynamic',
    url: u('?q=coffee&nodemo=1'),
    wait: '#search-result-list li, #search-results-count',
    // Trigger: deep-link ?q=coffee already populates; help-dismissal unblocks it.
    // Also type into search input as a reactive trigger.
    trigger: async (page) => {
      await triggerSearchInput(page, 'coffee')
    },
  },
  {
    id: 'M3-focus-dynamic',
    url: u('?record=519&nodemo=1'),
    wait: '#selected-details, [data-focus], .focus-card',
    // Trigger: focusOnNode bridge action + mobileSearchSheet='peek' dataset
    trigger: async (page) => {
      await triggerFocusSurface(page, 519)
    },
  },
  {
    id: 'M4-map-dynamic',
    url: u('?view=map&nodemo=1'),
    wait: '.leaflet-container, #map, .maplibregl-map',
    // Trigger: deep-link ?view=map loads map; just dismiss overlays.
    trigger: async (page) => {
      await page.waitForTimeout(1000)
    },
  },
  {
    id: 'M5-filters-dynamic',
    url: u('?q=coffee&nodemo=1'),
    wait: '#search-result-list li',
    // Trigger: open filters chip to reveal the filters bottom-sheet
    trigger: async (page) => {
      await openFiltersSheet(page)
    },
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Main capture loop
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--disable-dev-shm-usage',
    ],
  })

  await mkdir(OUT, { recursive: true })
  const report = []

  for (const s of surfaces) {
    const ctx = await browser.newContext({
      viewport: mobileViewport,
      deviceScaleFactor,
      isMobile: true,
      hasTouch: true,
    })

    // CRITICAL: Inject __PLAYWRIGHT__ = true BEFORE page.goto()
    // This triggers the eager-preload path in src/main.ts:
    //   if (window.__PLAYWRIGHT__) { setRenderKind('webgl'); engineReady.signalReady() }
    // Without this, the app boots into placeholder2d render-kind and the dynamic
    // mobile surfaces collapse to 0×0 under the help-dialog overlay (F0-b root cause).
    await ctx.addInitScript(() => {
      window.__PLAYWRIGHT__ = true
    })

    const page = await ctx.newPage()
    const consoleMsgs = []
    const pageErrors = []
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning')
        consoleMsgs.push(`[${m.type()}] ${m.text().slice(0, 160)}`)
    })
    page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)))

    const rec = { id: s.id, url: s.url, vp: mobileViewport, ok: false, errors: pageErrors, console: consoleMsgs, metrics: null, shot: null }

    try {
      await page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await settle(page)

      // 1. Click splash CTA to fire engineReady (dismisses placeholder gate)
      await clickSplashCta(page)

      // 2. Dismiss the first-visit help dialog (auto-opened on first visit, W47)
      await dismissHelpDialog(page)

      // 3. Wait for the surface-specific sentinel
      await tryWait(page, s.wait)

      // 4. Trigger the reactive surface (search results, focus sheet, map, filters)
      if (s.trigger) await s.trigger(page)

      // 5. Final settle before capture
      await page.waitForTimeout(700)

      // 6. Collect DOM metrics
      rec.metrics = await domMetrics(page)

      // 7. Screenshot at 2x deviceScaleFactor (780×1688 physical)
      const shotPath = `${OUT}/${s.id}.png`
      await page.screenshot({ path: shotPath, type: 'png', fullPage: false })
      rec.shot = shotPath
      rec.ok = true
      console.log(`OK   ${s.id}`)
    } catch (e) {
      rec.errorMsg = String(e).slice(0, 300)
      console.log(`FAIL ${s.id}: ${rec.errorMsg}`)
    } finally {
      report.push(rec)
      await ctx.close().catch(() => {})
    }
  }

  await browser.close()
  await writeFile(`${OUT}/metrics.json`, JSON.stringify(report, null, 2))
  const ok = report.filter((r) => r.ok).length
  console.log(`\nCaptured ${ok}/${report.length} surfaces -> ${OUT}/`)
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
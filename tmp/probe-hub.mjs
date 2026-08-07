/**
 * probe-hub.mjs — persistent probe runner. Binds on :8911, holds ONE Playwright
 * browser (+ per-viewport pages) alive so every /op dispatch skips the
 * ~60-90s cold boot (Chromium launch + app splash + engine warm). Ops are
 * registered small async functions that run inside a warm page. Start once
 * (background), then any turn gets probe results in ~1-3s.
 *
 *   GET /health            → booted state, page count, uptime
 *   GET /ops               → registered op names
 *   POST /op               → body: { op, size: 'desktop'|'mobile', args: {} }
 *   POST /reset            → close all pages (warm restarts lazily)
 *
 * Usage:
 *   node tmp/probe-hub.mjs [appUrl] [port]
 *   curl -s -X POST localhost:8911/op -H 'content-type: application/json' \
 *        -d '{"op":"searchNames","q":"coffee"}'
 */
import http from 'node:http'
import { chromium } from '@playwright/test'

const APP_URL = process.argv[2] || 'http://localhost:5174'
const PORT = Number(process.argv[3] || 8911)

const OPS = {
  /** Tab through the page until the active element matches a /regex/ on its
   *  className or id, or maxTabs reached. Returns per-tab focus state. */
  async tabFocus(page, { match = 'dive-btn|inside-btn|action-btn', maxTabs = 20 } = {}) {
    const re = new RegExp(match)
    const out = []
    for (let i = 0; i < maxTabs; i++) {
      const s = await page.evaluate(() => {
        const el = document.activeElement
        if (!el) return null
        const cs = getComputedStyle(el)
        return { tag: el.tagName, cls: String(el.className).slice(0, 60), id: el.id, outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, outlineOffset: cs.outlineOffset, focusVisible: el.matches(':focus-visible'), boxShadow: cs.boxShadow.slice(0, 60) }
      })
      out.push(s)
      if (s && re.test(s.cls || '')) return { found: true, tab: i, out }
      await page.keyboard.press('Tab')
      await page.waitForTimeout(60)
    }
    return { found: false, out }
  },
  /** Navigate the warm page to a deep-link and wait for engine readiness. */
  async navigate(page, { url, waitSel, settleMs = 1800 }) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
    await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 25000, polling: 200 }).catch(() => {})
    if (waitSel) await page.waitForSelector(waitSel, { timeout: 20000 }).catch(() => {})
    await page.waitForTimeout(settleMs)
    return page.evaluate(() => ({
      href: location.href,
      surface: document.body.dataset.panelSurface ?? null,
      btnPrev: !!document.querySelector('#btn-prev-node')
    }))
  },

  /** Any-page evaluate bridge: args = { code } → run as page.evaluate(code).
   *  The escape hatch that makes the hub the ONLY probe surface — never spin a
   *  cold browser for a one-off DOM question again. */
  async eval(page, { code }) {
    const src = String(code || '').trim()
    // Accept BOTH a bare function-expression (called with no args) and a
    // full IIFE string `(…expr…)()` — never double-wrap the latter.
    const isIife = /^\([\s\S]*\)\s*\(\s*\)\s*$/.test(src)
    const fn = isIife
      ? new Function(`return (${src})`)
      : new Function(`return (${src})()`)
    const out = await page.evaluate(fn).catch((e) => ({ __evalErr: String(e?.message || e) }))
    return { result: out }
  },
  /** Search for q and return the top N rendered names (what the user sees).
   *  Deterministic: navigates the warm page via the deep-link (?q=) which is the
   *  proven render path — synthetic typing clears the panel and races the app. */
  async searchNames(page, { q = 'coffee', n = 6 } = {}) {
    const url = new URL(page.url())
    url.searchParams.set('q', q)
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
    await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 25000, polling: 200 }).catch(() => {})
    await page.waitForSelector('.search-result-listitem', { timeout: 20000 }).catch(() => {})
    const res = await page.evaluate((n) => {
      const els = [...document.querySelectorAll('.search-result-listitem')].slice(0, n)
      const r = els.map((el) => el.querySelector('.search-result-name')?.textContent.replace(/\s+/g, ' ').trim() ?? null)
      return { count: els.length, names: r, surface: document.body.dataset.panelSurface, hasResults: !!document.querySelector('.search-result-listitem') }
    }, n)
    return { res }
  },

  async debugStep(page, { step = 'fill', q = 'coffee' } = {}) {
    if (step === 'count') {
      const input = page.locator('#search-input, input[type="search"]').first()
      return { count: await input.count(), visible: await input.isVisible().catch(() => false) }
    }
    const setOk = await page.evaluate((query) => {
      const i = document.querySelector('#search-input, input[type="search"]')
      if (!i) return false
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(i, query)
      i.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
      return i.value
    }, q).catch((e) => `ERR ${e?.message}`)
    await page.waitForTimeout(1500)
    if (step === 'enter') { await page.keyboard.press('Enter').catch(() => 'enter-err') }
    await page.waitForTimeout(1500)
    return page.evaluate(() => ({
      value: document.querySelector('#search-input, input[type="search"]')?.value ?? null,
      hasResults: !!document.querySelector('.search-result-listitem'),
      surface: document.body.dataset.panelSurface
    })).catch((e) => ({ readErr: String(e?.message) }))
  },

  /** Read the raw URL/query state + surface without interaction. */
  async route(page) {
    return page.evaluate(() => ({
      href: location.href,
      surface: document.body.dataset.panelSurface ?? null,
      hasInput: !!document.querySelector('#search-input, input[type="search"]'),
      inputValue: document.querySelector('#search-input, input[type="search"]')?.value ?? null,
      hasResults: !!document.querySelector('.search-result-listitem')
    }))
  },

  /** One step at a time — debug which interaction stalls. step: 'fill'|'enter'|'wait'|'read'. */
  /** Battery sweep of the current surface: clipping, dead interactives, off-screen, overlapped hit targets.
   *  Returns arrays + counts — cheap enough to run per-surface. */
  async sweep(page) {
    return page.evaluate(() => {
      const vw = innerWidth
      const out = { hitless: [], overflow: 0, unlabeled: [], surface: document.body.dataset.panelSurface ?? null }
      const all = document.querySelectorAll('*')
      for (const el of all) {
        // skip inert/empty/hidden primitives
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'CANVAS' || el.tagName === 'SVG') continue
        if (!(el instanceof HTMLElement)) continue
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue
        const rect = el.getBoundingClientRect()
        // Unrendered-but-in-DOM elements (0×0 boxes from off-canvas containers)
        // are not on any visual surface — skip them wholesale (phantom class).
        if (rect.width < 1 || rect.height < 1) continue
        // 1) horizontal overflow beyond viewport (right edge only; left-off-canvas is common by design)
        if (rect.right > vw + 2) {
          out.overflow++
        }
        // 2) clipped text: scrollWidth > clientWidth with nowrap/ellipsis
        if (cs.whiteSpace === 'nowrap' && el.scrollWidth > el.clientWidth + 2 && (cs.textOverflow === 'ellipsis' || cs.overflowX === 'hidden')) {
          out.hitless.push({ kind: 'clip', tag: el.tagName, txt: (el.textContent || '').trim().slice(0, 42), sw: el.scrollWidth, cw: el.clientWidth, cls: String(el.className).slice(0, 30) })
        }
        // 3) interactive elements that receive no pointer events (dead click targets)
        const interactive = el.matches('a, button, input, select, [role="button"], [role="link"], [tabindex]')
        if (interactive && (cs.pointerEvents === 'none' || el.hasAttribute('disabled'))) {
          out.hitless.push({ kind: 'dead', tag: el.tagName, cls: String(el.className).slice(0, 30), txt: (el.textContent || '').trim().slice(0, 30) })
        }
        // 4) interactive with no accessible label (visible text + sr-only text counts)
        if (interactive && (cs.pointerEvents !== 'none') && !el.hasAttribute('disabled')) {
          const txt = (el.textContent || '').trim().replace(/\s+/g, ' ')
          // clientWidth is 0 for inline boxes by spec — use bbox (rect) instead
          const hasVisibleTxt = txt.length > 0 && rect.width > 0
          const hasSrChild = !!el.querySelector('.sr-only, [class*="sr-only"]')
          const labelled = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('aria-labelledby')
          if (!labelled && !hasVisibleTxt && !hasSrChild) out.unlabeled.push({ kind: 'unlabeled', tag: el.tagName, cls: String(el.className).slice(0, 30), txt: txt.slice(0, 24) })
        }
      }
      return out
    })
  },

  /** Current app surface + viewport geometry + bool flags, no interaction. */
  async state(page) {
    return page.evaluate(() => ({
      surface: document.body.dataset.panelSurface ?? document.body.dataset.surface ?? null,
      canvas: (() => {
        const c = document.querySelector('canvas')
        if (!c) return null
        const b = c.getBoundingClientRect()
        return { w: c.width, h: c.height, rectW: Math.round(b.width), rectH: Math.round(b.height) }
      })(),
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      scrollEscapeX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      hasResults: !!document.querySelector('.search-result-listitem'),
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      vw: innerWidth,
      vh: innerHeight
    }))
  },

  /** Read computed animation on one host (reduced-motion gate truth). */
  async motionHost(page, { selector }) {
    return page.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (!el) return { present: false, sel }
      const cs = getComputedStyle(el)
      return {
        present: true, sel,
        animationName: cs.animationName,
        animationDuration: cs.animationDuration,
        running: cs.animationName !== 'none' && parseFloat(String(cs.animationDuration).replace('s', '')) > 0
      }
    }, selector)
  }
}

const state = { browser: null, pages: {}, startMs: Date.now(), ops: OPS }

async function bootPage(size) {
  const isMobile = size === 'mobile'
  const ctx = await state.browser.newContext({
    viewport: isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    // Kill animation churn on the probe page → every page.evaluate is cheaper
    // (the app's WebGL + CSS loops otherwise eat the headless main thread).
    reducedMotion: 'reduce'
  })
  const page = await ctx.newPage()
  const bootUrl = isMobile ? `${APP_URL}?nodemo=1` : `${APP_URL}?nodemo=1&q=coffee`
  await page.goto(bootUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
  if (!isMobile) {
    // Deep-link q=coffee → engine-ready immediately; wait for the portal to be
    // functional, not for pre-rendered results (they need interactive search).
    await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 25000, polling: 200 }).catch(() => {})
  } else {
    const cta = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
    await cta.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {})
    await cta.click().catch(() => {})
    await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 25000, polling: 200 }).catch(() => {})
  }
  state.pages[size] = page
  console.log(`[hub] booted ${size}`)
}

async function warm() {
  if (!state.browser) state.browser = await chromium.launch({ headless: true })
  if (!state.pages.desktop) await bootPage('desktop')
  if (!state.pages.mobile) await bootPage('mobile')
  console.log('[hub] warmed')
}

const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const send = (code, obj) => { res.statusCode = code; res.end(JSON.stringify(obj)) }

  if (req.method === 'GET' && url.pathname === '/health') {
    return send(200, { ok: true, booted: !!state.browser, pages: Object.keys(state.pages), uptimeMs: Date.now() - state.startMs })
  }
  if (req.method === 'GET' && url.pathname === '/ops') {
    return send(200, { ops: Object.keys(state.ops), count: Object.keys(state.ops).length })
  }
  if (req.method === 'POST' && url.pathname === '/op') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      ;(async () => {
        try {
          const { op, size = 'desktop', args = {} } = JSON.parse(body || '{}')
          const fn = state.ops[op]
          if (!fn) return send(404, { ok: false, error: `no op ${op}` })
          const page = state.pages[size]
          if (!page) return send(503, { ok: false, error: `page ${size} not ready` })
          const t0 = Date.now()
          // Hard cap per op so a stuck op can never wedge the hub (the exact
          // failure mode the user complained about).
          const data = await Promise.race([
            fn(page, args),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`op ${op} timed out after 25s`)), 25000))
          ])
          send(200, { ok: true, op, size, ms: Date.now() - t0, data })
        } catch (e) { console.error(`[hub] op error:`, e?.message); send(500, { ok: false, error: String(e?.message || e) }) }
      })()
    })
    return
  }
  if (req.method === 'POST' && url.pathname === '/reset') {
    ;(async () => {
      try {
        await Promise.all(Object.values(state.pages).map((p) => p.context().close().catch(() => {})))
        state.pages = {}
        send(200, { ok: true, closedPages: true })
      } catch (e) { send(500, { ok: false, error: String(e?.message || e) }) }
    })()
    return
  }
  send(404, { ok: false, error: `no route ${url.pathname}` })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[hub] probe-hub on :${PORT} app=${APP_URL}`)
  warm().catch((e) => console.error('[hub] warm failed:', e?.message))
})
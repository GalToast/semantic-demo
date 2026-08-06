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
  /** Search for q and return the top N rendered names (what the user sees). */
  async searchNames(page, { q = 'coffee', n = 6 } = {}) {
    const input = page.locator('#search-input, input[type="search"]').first()
    await input.fill('')
    await input.fill(q)
    await input.press('Enter')
    // Wait for the panel to actually render items (up to 15s)
    await page.waitForSelector('.search-result-listitem', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(500)
    const res = await page.evaluate((n) => {
      const els = [...document.querySelectorAll('.search-result-listitem')].slice(0, n)
      const r = els.map((el) => el.querySelector('.search-result-name')?.textContent.replace(/\s+/g, ' ').trim() ?? null)
      return { count: els.length, names: r, surface: document.body.dataset.panelSurface }
    }, n)
    return { res }
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
    reducedMotion: 'no-preference'
  })
  const page = await ctx.newPage()
  const bootUrl = isMobile ? `${APP_URL}?nodemo=1` : `${APP_URL}?nodemo=1&q=coffee`
  await page.goto(bootUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
  if (!isMobile) {
    await page.waitForSelector('.search-result-listitem', { timeout: 30000 }).catch(() => {})
  } else {
    const cta = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
    await cta.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {})
    await cta.click().catch(() => {})
  }
  await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 25000, polling: 200 }).catch(() => {})
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
          const data = await fn(page, args)
          send(200, { ok: true, op, size, ms: Date.now() - t0, data })
        } catch (e) { send(500, { ok: false, error: String(e?.message || e) }) }
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
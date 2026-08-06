/* audit-dive-probe.mjs — Worker B semantic-dive surface audit (read-only).
 * Reaches the dive surface, runs the DOM battery, writes JSONL evidence.
 * Battery items: h-overflow, clipped nowrap text, interactive h<42, no name.
 * Bonus: keyboard :focus-visible on dive + 44px CTA hit area at 390x844.
 * Every awaited op runs under a hard timeout; heartbeats per stage.
 */
import fs from 'node:fs'
import { chromium } from '@playwright/test'

const URL = process.env.AUDIT_URL || 'http://localhost:5174'
const OUT = `tmp/audit-dive-${new Date().toISOString().slice(0, 10)}.jsonl`
fs.writeFileSync(OUT, '')
const write = (o) => fs.appendFileSync(OUT, JSON.stringify({ ts: new Date().toISOString(), ...o }) + '\n')
const beat = (label) => write({ kind: 'beat', label, at: Date.now() })

function bounded(fn, ms, name) {
  let timer
  const p = typeof fn === 'function' ? fn() : fn
  const t = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms in ${name}`)), ms) })
  return Promise.race([p, t]).finally(() => clearTimeout(timer))
}

const safeSnap = async (page, label) => {
  try { return await bounded(state(page, label), 10000, 'state-snap') } catch (e) { write({ kind: 'snap-fail', label, error: e.message.slice(0, 120) }); return null }
}
const state = async (page, label) => page.evaluate((label) => {
  const q = (s) => document.querySelector(s)
  const box = (el) => el ? (() => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) } })() : null
  const btn = q('.focus-stage-dive-btn') || q('#btn-focus-dive')
  return {
    label,
    panelSurface: document.body.dataset.panelSurface || null,
    semanticDive: document.body.dataset.semanticDive || null,
    journeyPhase: document.body.dataset.journeyPhase || null,
    hasCompassDiveSurfaceEl: !!q('.compass-dive-surface'),
    diveBtn: box(btn), diveBtnHidden: btn ? btn.hidden : null, diveBtnDisabled: btn ? btn.disabled : null,
    insideControls: ['#btn-inside-map', '#btn-inside-county', '#btn-inside-next'].map((s) => { const e = q(s); return e ? { id: s, hidden: e.hidden, box: box(e) } : null }).filter(Boolean),
    focusCard: !!q('.focus-stage-card'),
    points: window.__APP_STATE__?.points?.length ?? 0
  }
}, label)

// ── reach phase ────────────────────────────────────────────────────────────
beat('launch')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (m) => { if (m.type() === 'error') write({ kind: 'console-error', text: m.text().slice(0, 200) }) })
page.on('pageerror', (e) => write({ kind: 'pageerror', text: String(e).slice(0, 200) }))

let surface = null
let reachMode = 'deep-link'
try {
  await bounded(page.goto(`${URL}?nodemo=1&q=coffee&record=519`, { waitUntil: 'domcontentloaded', timeout: 20000 }), 25000, 'goto')
  beat('goto-ok')
  await bounded(page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 25000, polling: 200 }), 30000, 'webgl-gate').catch(() => {})
  await page.waitForTimeout(4000) // let any post-boot reload settle
  write(await safeSnap(page, 'after-deeplink'))
} catch (e) {
  write({ kind: 'reach-fail', mode: reachMode, error: e.message })
  beat('reach-fail-deeplink')
}

// If deep-link didn't land on a focus card, fall back: splash + search.
await page.waitForTimeout(1500)
const getSurface = async () => {
  try { return await bounded(page.evaluate(() => document.body.dataset.panelSurface || ''), 6000, 'surface-read') } catch { return '' }
}
let s1 = await getSurface()
if (!['focus', 'focus-search', 'semantic-dive'].includes(s1)) {
  reachMode = 'search'
  beat('fallback-search')
  try {
    const cta = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
    await bounded(cta.waitFor({ state: 'visible', timeout: 20000 }), 25000, 'splash-cta')
    await bounded(cta.click(), 5000, 'cta-click')
    await bounded(page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 25000, polling: 200 }), 30000, 'webgl-gate-2')
    await page.evaluate(() => { const i = document.querySelector('input[type="search"], #search-input'); if (i) i.focus() })
    await page.keyboard.type('coffee', { delay: 10 })
    await page.keyboard.press('Enter')
    await page.waitForTimeout(2000)
    const res = page.locator('.search-result-listitem, .search-result-row').first()
    if (await res.count().catch(() => 0) > 0) { await res.click(); await page.waitForTimeout(1800) }
    write(await safeSnap(page, 'after-search'))
  } catch (e) { write({ kind: 'reach-fail', mode: 'search', error: e.message }) }
}

// ── dive click ─────────────────────────────────────────────────────────────
let s2 = await getSurface()
if (s2 !== 'semantic-dive') {
  beat('attempt-dive-click')
  const clicked = await page.evaluate(() => {
    const d = document.querySelector('.focus-stage-dive-btn') || document.querySelector('#btn-focus-dive')
    if (!d) return 'no-btn'
    if (d.hidden || d.disabled) return `btn-state:hidden=${d.hidden},disabled=${d.disabled}`
    d.click(); return 'clicked'
  })
  write({ kind: 'dive-click', result: clicked })
  await page.waitForTimeout(2500)
  write(await safeSnap(page, 'after-dive-click'))
}
surface = await getSurface()
beat(`surface=${surface}`)

// ── battery on semantic-dive (or nearest reachable) ────────────────────────
const battery = async (p, label) => p.evaluate((label) => {
  const out = { surface: document.body.dataset.panelSurface, semanticDive: document.body.dataset.semanticDive, label, total: 0, overflow: [], clipped: [], shortInteractive: [], noName: [] }
  const vw = window.innerWidth
  const isVisible = (el) => {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'CANVAS' || el.tagName === 'SVG') return false
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') return false
    if (parseFloat(cs.opacity) === 0) return false
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) return false
    return true
  }
  const onScreen = (r) => r.right > 0 && r.left < vw && r.bottom > 0 && r.top < window.innerHeight
  const isInteractive = (el) => el.matches('button, a, input, select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])')
  const ancestorOverflowHidden = (el) => {
    let n = el.parentElement; let found = null
    while (n && n !== document.body) {
      const cs = getComputedStyle(n)
      if (cs.overflowX === 'hidden' || cs.overflow === 'hidden' || cs.overflowX === 'clip' || cs.overflow === 'clip') { found = n; break }
      n = n.parentElement
    }
    return found ? { tag: found.tagName, cls: String(found.className).slice(0, 60) } : null
  }
  const knownFP = (el) => {
    const c = String(el.className)
    return /sr-only|search-result-name|selected-relationship-label|focus-stage-neighbor-name|focus-pocket-a11y/.test(c)
  }
  const rec = (el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return {
      tag: el.tagName, cls: String(el.className).slice(0, 80), id: el.id || null,
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
      aria: el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('aria-labelledby') || null,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) },
      onScreen: onScreen(r),
      ancestorOverflowHidden: ancestorOverflowHidden(el)
    }
  }
  const els = [...document.querySelectorAll('body *')].filter(isVisible)
  out.total = els.length
  for (const el of els) {
    const r = el.getBoundingClientRect()
    if (!onScreen(r)) continue
    if (r.right > vw + 2) {
      const recd = rec(el)
      if (!knownFP(el)) out.overflow.push({ ...recd, overflowBy: Math.round(r.right - vw) })
    }
    const cs = getComputedStyle(el)
    if (cs.whiteSpace === 'nowrap' && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
      const recd = rec(el)
      if (!knownFP(el)) out.clipped.push({ ...recd, sw: el.scrollWidth, cw: el.clientWidth })
    }
    if (isInteractive(el) && r.height > 0 && r.height < 42) {
      out.shortInteractive.push(rec(el))
    }
    if (isInteractive(el) && !el.disabled) {
      const hasVisibleText = (el.textContent || '').trim().length > 0
      const ariaName = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('aria-labelledby')
      if (!hasVisibleText && !ariaName) out.noName.push(rec(el))
    }
  }
  return out
}, label)

let batteryResult = null
if (surface === 'semantic-dive') {
  beat('battery-on-dive')
  batteryResult = await bounded(battery(page, 'semantic-dive'), 20000, 'battery')
} else {
  beat(`battery-on-nearest=${surface || 'unknown'}`)
  batteryResult = await bounded(battery(page, `nearest-${surface || 'unknown'}`), 20000, 'battery')
}
write({ kind: 'battery-summary', total: batteryResult.total, overflow: batteryResult.overflow.length, clipped: batteryResult.clipped.length, shortInteractive: batteryResult.shortInteractive.length, noName: batteryResult.noName.length })
for (const [k, v] of [['overflow', batteryResult.overflow], ['clipped', batteryResult.clipped], ['shortInteractive', batteryResult.shortInteractive], ['noName', batteryResult.noName]]) {
  for (const item of v) write({ kind: 'finding', battery: k, ...item })
}

// ── bonus: keyboard focus-visible + mobile 44px CTA ────────────────────────
beat('bonus-start')
const a11y = {}
try {
  await bounded(page.evaluate(() => document.querySelector('#btn-focus-dive, .focus-stage-dive-btn')?.focus()), 5000, 'focus-dive')
  await page.waitForTimeout(300)
  a11y.diveFocusVisible = await page.evaluate(() => {
    const d = document.querySelector('#btn-focus-dive') || document.querySelector('.focus-stage-dive-btn')
    if (!d) return 'no-btn'
    return { isFocused: document.activeElement === d, matchesFocusVisible: d.matches(':focus-visible') }
  })
  a11y.focusVisibleEls = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.focus-visible')]
    return els.map((e) => ({ tag: e.tagName, cls: String(e.className).slice(0, 60), box: (() => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) } })() })).slice(0, 8)
  })
  write({ kind: 'a11y-dive', ...a11y })
} catch (e) { write({ kind: 'a11y-fail', error: e.message }) }

try {
  const mp = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await bounded(mp.goto(`${URL}?nodemo=1&q=coffee&record=519`, { waitUntil: 'domcontentloaded', timeout: 20000 }), 25000, 'mobile-goto')
  await bounded(mp.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 25000, polling: 200 }), 30000, 'mobile-gate')
  await mp.waitForTimeout(2500)
  const mclick = await mp.evaluate(() => {
    const d = document.querySelector('.focus-stage-dive-btn') || document.querySelector('#btn-focus-dive')
    if (!d) return 'no-btn'
    if (d.hidden || d.disabled) return `hidden=${d.hidden},disabled=${d.disabled}`
    d.click(); return 'clicked'
  })
  write({ kind: 'mobile-dive-click', result: mclick })
  await mp.waitForTimeout(2200)
  const mres = await mp.evaluate(() => {
    const q = (s) => document.querySelector(s)
    const btn = q('#btn-focus-dive') || q('.focus-stage-dive-btn')
    const primary = q('.compass-primary-action, [data-compass-primary]') || btn
    const box = (el) => el ? (() => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } })() : null
    return {
      panelSurface: document.body.dataset.panelSurface,
      semanticDive: document.body.dataset.semanticDive,
      ctaBox: box(btn),
      ctaText: (btn?.textContent || '').trim().slice(0, 40),
      primaryBox: box(primary),
      viewport: { w: innerWidth, h: innerHeight }
    }
  })
  write({ kind: 'a11y-mobile', ...mres })
  await mp.close()
} catch (e) { write({ kind: 'mobile-fail', error: e.message }) }

write({ kind: 'done', verdict: 'see REPORT' })
await browser.close()
console.log('PROBE DONE — evidence:', OUT)
console.log('battery summary:', JSON.stringify({ total: batteryResult.total, overflow: batteryResult.overflow.length, clipped: batteryResult.clipped.length, shortInteractive: batteryResult.shortInteractive.length, noName: batteryResult.noName.length }))

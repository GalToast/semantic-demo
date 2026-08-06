/* audit-dive-bonus.mjs — refine a11y checks after the main battery:
 * 1) desktop: focus a VISIBLE dive-surface control, check :focus-visible + .focus-visible class
 * 2) mobile 390x844: list visible interactive elements + boxes on the dive surface
 */
import fs from 'node:fs'
import { chromium } from '@playwright/test'

const URL = process.env.AUDIT_URL || 'http://localhost:5174'
const OUT = `tmp/audit-dive-bonus-${new Date().toISOString().slice(0, 10)}.jsonl`
fs.writeFileSync(OUT, '')
const write = (o) => fs.appendFileSync(OUT, JSON.stringify({ ts: new Date().toISOString(), ...o }) + '\n')

function bounded(fn, ms, name) {
  let timer
  const p = typeof fn === 'function' ? fn() : fn
  const t = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms ${name}`)), ms) })
  return Promise.race([p, t]).finally(() => clearTimeout(timer))
}

const browser = await chromium.launch({ headless: true })

// ── desktop focus-visible ──
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await bounded(page.goto(`${URL}?nodemo=1&q=coffee&record=519`, { waitUntil: 'domcontentloaded', timeout: 20000 }), 25000, 'goto')
await bounded(page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 25000, polling: 200 }), 30000, 'gate').catch(() => {})
await page.waitForTimeout(4500)
await page.evaluate(() => { const d = document.querySelector('#btn-focus-dive'); if (d) d.click() })
await page.waitForTimeout(2500)
const fv = await page.evaluate(() => {
  // what's actually visible on the dive surface
  const vis = [...document.querySelectorAll('#btn-inside-map, #btn-inside-county, #btn-inside-next, #btn-focus-dive, .focus-stage-inside-status, .inside-controls, .compass-primary-action')]
    .map((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { sel: e.id ? '#' + e.id : e.className, text: (e.textContent || '').trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height), disp: cs.display, vis: cs.visibility, hidden: e.hidden } })
  return { surface: document.body.dataset.panelSurface, vis }
})
write({ kind: 'dive-visible-controls', ...fv })
// focus the first visible interactive dive control and check :focus-visible
const foc = await page.evaluate(() => {
  const targets = ['#btn-inside-next', '#btn-inside-map', '#btn-inside-county', '#btn-focus-dive']
  for (const s of targets) {
    const e = document.querySelector(s)
    if (!e) continue
    const r = e.getBoundingClientRect()
    if (r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden') {
      e.focus()
      return { focused: s, isActive: document.activeElement === e, mfv: e.matches(':focus-visible'), fvClass: document.querySelectorAll('.focus-visible').length }
    }
  }
  return { focused: null }
})
write({ kind: 'dive-focus-visible', ...foc })
// tab through to prove a focus-visible indicator renders
const tab = await page.evaluate(() => {
  const before = document.activeElement?.className || ''
  const first = document.querySelector('#btn-inside-next, #btn-inside-map, #btn-inside-county')
  first?.focus()
  const styles = first ? getComputedStyle(first) : null
  return {
    outlineStyle: styles?.outlineStyle, outlineWidth: styles?.outlineWidth, outlineColor: styles?.outlineColor,
    boxShadow: styles?.boxShadow, hasFocusVisibleClass: !!document.querySelector('.focus-visible')
  }
})
write({ kind: 'dive-focus-style', ...tab })
await page.close()

// ── mobile 390x844 CTA hit area ──
const mp = await browser.newPage({ viewport: { width: 390, height: 844 } })
await bounded(mp.goto(`${URL}?nodemo=1&q=coffee&record=519`, { waitUntil: 'domcontentloaded', timeout: 20000 }), 25000, 'm-goto')
await bounded(mp.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 25000, polling: 200 }), 30000, 'm-gate').catch(() => {})
await mp.waitForTimeout(4500)
const pre = await mp.evaluate(() => {
  const vis = [...document.querySelectorAll('button, [role="button"], a')].filter((e) => {
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e)
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0
  }).map((e) => { const r = e.getBoundingClientRect(); return { sel: e.id ? '#' + e.id : e.className.slice(0, 50), text: (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 36), w: Math.round(r.width), h: Math.round(r.height) } })
  return { surface: document.body.dataset.panelSurface, buttons: vis.slice(0, 16) }
})
write({ kind: 'mobile-pre-dive-buttons', ...pre })
const mclick = await mp.evaluate(() => { const d = document.querySelector('#btn-focus-dive'); if (d) { d.click(); return true } return false })
await mp.waitForTimeout(2800)
const post = await mp.evaluate(() => {
  const vis = [...document.querySelectorAll('button, [role="button"], a')].filter((e) => {
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e)
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0
  }).map((e) => { const r = e.getBoundingClientRect(); return { sel: e.id ? '#' + e.id : e.className.slice(0, 50), text: (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 36), w: Math.round(r.width), h: Math.round(r.height) } })
  return { surface: document.body.dataset.panelSurface, semanticDive: document.body.dataset.semanticDive, buttons: vis.slice(0, 16) }
})
write({ kind: 'mobile-post-dive-buttons', clicked: mclick, ...post })
await mp.close()
await browser.close()
console.log('BONUS DONE — evidence:', OUT)

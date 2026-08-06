/** rail-chain-probe.mjs — reach semantic-dive (Worker A's proven path), then dump
 *  the neighbor-pill ancestor chain widths + the button geometry. Evidence: JSONL. */
import fs from 'node:fs'
import { chromium } from '@playwright/test'

const URL = process.argv[2] || 'http://localhost:5174'
const OUT = 'tmp/rail-chain.jsonl'
fs.writeFileSync(OUT, '')
const write = (o) => fs.appendFileSync(OUT, JSON.stringify({ ts: new Date().toISOString(), ...o }) + '\n')
const bounded = (fn, ms, name) => {
  const t = new Promise((_, rej) => { setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms in ${name}`)), ms) })
  return Promise.race([typeof fn === 'function' ? fn() : fn, t])
}
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
const goto = (u) => page.goto(u, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {})
await goto(`${URL}?nodemo=1&q=coffee`)
await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 25000, polling: 200 }).catch(() => {})
await page.waitForSelector('.search-result-listitem', { timeout: 20000 }).catch(() => {})
await page.locator('.search-result-listitem').first().click({ timeout: 8000 }).catch(() => {})
await page.waitForTimeout(1800)
// inside chip
const chip = page.locator('.mode-chip[data-mode="inside"]')
const bb = await chip.boundingBox().catch(() => null)
if (bb && bb.width > 4) { await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2).catch(() => {}) }
await page.waitForTimeout(3000)
const surface = await page.evaluate(() => document.body.dataset.panelSurface)
write({ kind: 'surface', surface })
// dump chain for first neighbor-main
const dump = await page.evaluate(() => {
  const btn = document.querySelector('.focus-stage-neighbor-main')
  if (!btn) return { none: true, surface: document.body.dataset.panelSurface }
  const chain = []
  let cur = btn
  while (cur && chain.length < 8) {
    const r = cur.getBoundingClientRect()
    const cs = getComputedStyle(cur)
    chain.push({
      tag: cur.tagName.toLowerCase(),
      cls: String(cur.className || cur.id).slice(0, 56),
      w: Math.round(r.width), h: Math.round(r.height),
      display: cs.display, flex: cs.flex, minW: cs.minWidth, maxW: cs.maxWidth,
      ov: cs.overflow, position: cs.position
    })
    cur = cur.parentElement
  }
  const r = btn.getBoundingClientRect()
  const cs = getComputedStyle(btn)
  return { btnW: Math.round(r.width), btnH: Math.round(r.height), count: document.querySelectorAll('.focus-stage-neighbor-main').length, chain, surface: document.body.dataset.panelSurface }
})
write({ kind: 'chain', ...dump })
console.log('SURFACE:', surface)
console.log(JSON.stringify(dump, null, 1))
await b.close()
/** dive-slots.mjs — reach semantic-dive, dump .focus-stage-journey grid children slots at dive. */
import fs from 'node:fs'
import { chromium } from '@playwright/test'
const URL = process.argv[2] || 'http://localhost:5174'
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
const goto = (u) => page.goto(u, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {})
await goto(`${URL}?nodemo=1&q=coffee`)
await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 25000, polling: 200 }).catch(() => {})
await page.waitForSelector('.search-result-listitem', { timeout: 20000 }).catch(() => {})
await page.locator('.search-result-listitem').first().click({ timeout: 8000 }).catch(() => {})
await page.waitForTimeout(1800)
const chip = page.locator('.mode-chip[data-mode="inside"]')
const bb = await chip.boundingBox().catch(() => null)
if (bb && bb.width > 4) { await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2).catch(() => {}) }
await page.waitForTimeout(3000)
const dump = await page.evaluate(() => {
  const j = document.querySelector('.focus-stage-journey')
  if (!j) return { none: true, surface: document.body.dataset.panelSurface }
  const slots = []
  let i = 0
  for (const child of j.children) {
    const cs = getComputedStyle(child)
    const r = child.getBoundingClientRect()
    slots.push({ i: i++, tag: child.tagName.toLowerCase(), cls: String(child.className || child.id).slice(0, 64), w: Math.round(r.width), h: Math.round(r.height), gridCol: cs.gridColumnStart + '/' + cs.gridColumnEnd, gridRow: cs.gridRowStart + '/' + cs.gridRowEnd, display: cs.display })
  }
  const rail = document.querySelector('.focus-stage-neighbors')
  return {
    surface: document.body.dataset.panelSurface,
    journeyW: Math.round(j.getBoundingClientRect().width),
    cols: getComputedStyle(j).gridTemplateColumns,
    slots,
    rail: rail ? { active: rail.className.includes('active'), w: Math.round(rail.getBoundingClientRect().width), gridCol: getComputedStyle(rail).gridColumnStart + '/' + getComputedStyle(rail).gridColumnEnd, railChildCount: rail.children.length } : null
  }
})
console.log('DIVE_SLOTS_BEGIN')
console.log(JSON.stringify(dump, null, 1))
console.log('DIVE_SLOTS_END')
await b.close()
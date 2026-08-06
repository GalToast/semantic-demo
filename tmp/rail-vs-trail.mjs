/** rail-vs-trail.mjs — when BOTH .focus-stage-neighbors.active and TrailControls
 *  render inside .focus-stage-journey, dump their grid placement to check
 *  whether rail grid-column:1/-1 would overlap the trail buttons. */
import { chromium } from '@playwright/test'
const URL = process.argv[2] || 'http://localhost:5174'
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
const goto = (u) => page.goto(u, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {})
await goto(`${URL}?nodemo=1&q=coffee`)
await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 25000, polling: 200 }).catch(() => {})
await page.waitForSelector('.search-result-listitem', { timeout: 20000 }).catch(() => {})
await page.locator('.search-result-listitem').first().click({ timeout: 8000 }).catch(() => {})
await page.waitForTimeout(2000)
// STATE 1: plain focus (rail maybe active, trail probably not)
const s1 = await page.evaluate(() => {
  const j = document.querySelector('.focus-stage-journey')
  if (!j) return null
  return {
    surface: document.body.dataset.panelSurface,
    cols: getComputedStyle(j).gridTemplateColumns,
    kids: [...j.children].map(c => ({ cls: String(c.className || c.id).slice(0, 60), display: getComputedStyle(c).display, w: Math.round(c.getBoundingClientRect().width), gridCol: getComputedStyle(c).gridColumnStart + '/' + getComputedStyle(c).gridColumnEnd }))
  }
})
console.log('STATE1(focus): ' + JSON.stringify(s1, null, 1))
// STATE 2: try to enter trail mode (Next stop path) to force chromeHasTrail
await page.keyboard.press('Tab').catch(()=>{}) // land somewhere
await page.waitForTimeout(400)
const nextBtn = page.locator('.focus-stage-inside-btn, #btn-inside-next, .trail-btn:not([aria-disabled="true"]), #btn-next-node').first()
if (await nextBtn.count().catch(()=>0)) { await nextBtn.click({ timeout: 5000, force: true }).catch(() => {}) }
await page.waitForTimeout(2500)
const s2 = await page.evaluate(() => {
  const j = document.querySelector('.focus-stage-journey')
  if (!j) return null
  return {
    surface: document.body.dataset.panelSurface,
    mode: window.__APP_STATE__?.navState?.mode ?? null,
    trailDepth: window.__APP_STATE__?.navState?.trailDepth ?? null,
    cols: getComputedStyle(j).gridTemplateColumns,
    railActive: !!document.querySelector('.focus-stage-neighbors.active'),
    trailCntl: !!document.querySelector('.trail-controls'),
    kids: [...j.children].map(c => {
      const r = c.getBoundingClientRect()
      return { cls: String(c.className || c.id).slice(0, 60), w: Math.round(r.width), h: Math.round(r.height), gridCol: getComputedStyle(c).gridColumnStart + '/' + getComputedStyle(c).gridColumnEnd, display: getComputedStyle(c).display }
    })
  }
})
console.log('STATE2(trail?): ' + JSON.stringify(s2, null, 1))
await b.close()
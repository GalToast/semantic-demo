// mobile-emptyband-verify.mjs — measure the mobile idle info-panel dead band
// at 390x844 on the CURRENT (fixed) build. Expect panel shrinks vs 320px.
import { chromium } from '@playwright/test'
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
await page.goto('http://127.0.0.1:8795/dist/svelte/index.html?nodemo=1', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(()=>{})
const cta = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
await cta.waitFor({ state: 'visible', timeout: 60000 }).catch(()=>{})
await cta.click().catch(()=>{})
await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 20000, polling: 100 }).catch(()=>{})
await page.waitForTimeout(1500)
const r = await page.evaluate(() => {
  const panel = document.querySelector('aside#info-panel')
  if (!panel) return { miss: true, surface: document.body.dataset.panelSurface }
  const pr = panel.getBoundingClientRect()
  const content = document.querySelector('#info-panel-content')
  const cr = content ? content.getBoundingClientRect() : null
  const cs = getComputedStyle(panel)
  return {
    surface: document.body.dataset.panelSurface,
    vw: innerWidth, vh: innerHeight,
    panelH: Math.round(pr.height), panelBottom: Math.round(pr.bottom),
    contentBottom: cr ? Math.round(cr.bottom) : null,
    deadBand: cr ? Math.round(pr.bottom - cr.bottom) : null,
    heightRule: cs.height, minHeight: cs.minHeight,
    compact: document.body.dataset.compact
  }
})
console.log('MOBILE_BAND_START')
console.log(JSON.stringify(r, null, 1))
console.log('MOBILE_BAND_END')
await b.close()
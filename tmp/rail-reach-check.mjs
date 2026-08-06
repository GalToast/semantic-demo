import { chromium } from '@playwright/test'
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(`http://127.0.0.1:8795/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(()=>{})
const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
await explore.waitFor({ state: 'visible', timeout: 60000 }).catch(()=>{})
await explore.click().catch(()=>{})
await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 20000, polling: 100 }).catch(()=>{})
// same focus helper path as the journey test
await page.evaluate(() => {
  if (typeof window.__publishCameraNodeFocused__ === 'function') { window.__publishCameraNodeFocused__(0); return true }
  const a = window.__navActions__; return a && typeof a.focusOnNode === 'function' ? a.focusOnNode(0) : false
})
await page.waitForFunction(() => { const d = document.querySelector('dialog.help-dialog'); return !d || !d.open }, null, { timeout: 8000, polling: 100 }).catch(()=>{})
const chip = page.locator('#mode-chips [data-mode="inside"]')
await chip.waitFor({ state: 'attached', timeout: 20000 }).catch(()=>{})
await chip.click().catch(()=>{})
await page.waitForFunction(() => document.body.classList.contains('surface-semantic-dive'), null, { timeout: 8000, polling: 100 }).catch(()=>{})
await page.waitForTimeout(1500)
const r = await page.evaluate(() => ({
  surface: document.body.classList.contains('surface-semantic-dive'),
  railBtns: document.querySelectorAll('.focus-stage-neighbors.active .focus-stage-neighbor-main').length,
  anyBtns: document.querySelectorAll('.focus-stage-neighbor-main').length,
  railActive: !!document.querySelector('.focus-stage-neighbors.active'),
  pocket: !!document.querySelector('#focus-pocket')
}))
console.log(JSON.stringify(r, null, 1))
await b.close()
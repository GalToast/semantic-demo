import { chromium } from '@playwright/test'
const URL = process.argv[2] || 'http://localhost:5174'
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto(`${URL}?nodemo=1`, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(()=>{})
await page.waitForTimeout(2200)
// dismiss the first-visit help dialog if open
const closeBtn = page.locator('dialog.help-dialog button, dialog.help-dialog [aria-label*="close"], dialog.help-dialog [aria-label*="Close"]').first()
if (await closeBtn.count().catch(()=>0)) { await closeBtn.click().catch(()=>{}); await page.waitForTimeout(400) }
// click splash
const cta = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
await cta.waitFor({ state: 'visible', timeout: 30000 }).catch(()=>{})
await cta.click().catch(()=>{})
await page.waitForTimeout(3800)
// close any dialog again
await page.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => { try { d.close() } catch {} }) })
await page.waitForTimeout(300)
const legend = page.locator('.legend-item').first()
const box = await legend.boundingBox().catch(()=>null)
console.log('legend box after dialog close:', JSON.stringify(box))
if (box && box.x >= 0) {
  await page.mouse.move(box.x + box.width/2, box.y + box.height/2, { steps: 4 })
  await page.waitForTimeout(400)
  const s = await legend.evaluate((el) => { const cs = getComputedStyle(el); return cs.transform + ' | ' + cs.backgroundColor + ' | ' + cs.borderColor }) 
  console.log('hovered state:', s)
}
await b.close()

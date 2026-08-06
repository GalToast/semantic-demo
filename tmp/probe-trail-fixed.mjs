import { chromium } from '@playwright/test'
const b = await chromium.launch({ headless: true })
const results = []
for (const vp of [{ w: 1440, h: 900 }, { w: 390, h: 844 }]) {
  const page = await b.newPage({ viewport: { width: vp.w, height: vp.h } })
  await page.goto(`http://localhost:5174?nodemo=1&q=coffee&record=519`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(()=>{})
  await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 25000, polling: 200 }).catch(()=>{})
  await page.waitForTimeout(3800)
  const g = await page.evaluate(() => {
    const out = { vp: `${innerWidth}x${innerHeight}`, btns: [], trayW: null, docEscapeX: document.documentElement.scrollWidth - document.documentElement.clientWidth }
    const tray = document.querySelector('.trail-controls')
    if (tray) out.trayW = Math.round(tray.getBoundingClientRect().width)
    for (const el of document.querySelectorAll('.trail-btn')) {
      const cs = getComputedStyle(el)
      out.btns.push({
        id: el.id, txt: (el.textContent||'').replace(/\s+/g,' ').trim(),
        w: Math.round(el.getBoundingClientRect().width),
        sw: el.scrollWidth, cw: el.clientWidth,
        clipped: el.scrollWidth > el.clientWidth + 2,
        onScreen: el.getBoundingClientRect().right <= innerWidth + 1 && el.getBoundingClientRect().left >= -1
      })
    }
    return out
  })
  results.push(g)
  await page.close()
}
console.log(JSON.stringify(results, null, 1))
await b.close()
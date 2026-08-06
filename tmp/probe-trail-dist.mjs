import { chromium } from '@playwright/test'
const URL = process.argv[2] || 'http://127.0.0.1:8795'
const b = await chromium.launch({ headless: true })
const results = []
for (const vp of [{ w: 1440, h: 900 }, { w: 390, h: 844 }]) {
  const page = await b.newPage({ viewport: { width: vp.w, height: vp.h }, reducedMotion: 'reduce' })
  await page.goto(`${URL}/?nodemo=1&q=coffee&record=519`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(()=>{})
  await page.waitForTimeout(4500)
  const g = await page.evaluate(() => {
    const out = { vp: `${innerWidth}x${innerHeight}`, btns: [], docEscapeX: document.documentElement.scrollWidth - document.documentElement.clientWidth }
    for (const el of document.querySelectorAll('.trail-btn')) {
      const cs = getComputedStyle(el)
      out.btns.push({
        id: el.id, txt: (el.textContent||'').replace(/\s+/g,' ').trim(),
        w: Math.round(el.getBoundingClientRect().width),
        sw: el.scrollWidth, cw: el.clientWidth,
        clipped: el.scrollWidth > el.clientWidth + 2,
        ov: cs.overflow, ow: cs.width.slice(0, 12)
      })
    }
    return out
  })
  results.push(g)
  await page.close()
}
console.log(JSON.stringify(results, null, 1))
await b.close()

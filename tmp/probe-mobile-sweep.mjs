/* probe-mobile-sweep.mjs — walk every surface at 390x844, report any element
 * that paints off-viewport (right > innerWidth) or is clipped (scrollWidth>clientWidth).
 * Surface paths: idle -> search (with results) -> focus (selected) -> dive (inside)
 *              -> trail -> map -> focus-search. */
import { chromium } from '@playwright/test'

const URL = process.argv[2] || 'http://localhost:5174'
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 390, height: 844 } })
const results = {}

async function scan(label) {
  await page.waitForTimeout(400)
  const r = await page.evaluate(() => {
    const viewport = window.innerWidth
    const off = []
    const clip = []
    for (const el of document.querySelectorAll('button, a, input, select, h1, h2, h3, span, div')) {
      const b = el.getBoundingClientRect()
      if (b.width < 2 || b.height < 2) continue
      if (el.offsetParent === null) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none') continue
      if (b.right > viewport + 1 && b.width > 20) {
        off.push({ tag: el.tagName, cls: String(el.className).slice(0, 40), x: Math.round(b.x), right: Math.round(b.right), w: Math.round(b.width), txt: (el.textContent || '').trim().slice(0, 22) })
      }
      // text clipping: element scrollWidth notably > clientWidth while content overflows
      if (el.scrollWidth > el.clientWidth + 4 && el.clientWidth > 0 && /overflow/.test(cs.overflow + cs.overflowX)) {
        clip.push({ tag: el.tagName, cls: String(el.className).slice(0, 40), sw: el.scrollWidth, cw: el.clientWidth, txt: (el.textContent || '').trim().slice(0, 30) })
      }
    }
    return { surface: document.body.dataset.panelSurface, mode: document.body.dataset.mode, viewport, off: off.slice(0, 12), clip: clip.slice(0, 8) }
  })
  results[label] = r
  const out = r.off.length + r.clip.length
  console.log(`[${label}] surface=${r.surface} mode=${r.mode} offenders=${r.off.length} clipped=${r.clip.length}`)
  if (out > 0) { console.log(JSON.stringify({ off: r.off, clip: r.clip }, null, 1)) }
}

// 1. boot: pass splash gate + enter 3D scene
await page.goto(`${URL}?nodemo=1`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
await page.waitForTimeout(2500)
const cta = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
await cta.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {})
await cta.click().catch(() => {})
await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 25000, polling: 200 }).catch(() => {})
await page.waitForTimeout(1200)
await scan('boot-3d')

// 2. search with results (open search, type query)
await page.evaluate(() => { const i = document.querySelector('input[type="search"], #search-input'); if (i) i.focus() })
await page.keyboard.type('coffee', { delay: 25 }).catch(() => {})
await page.keyboard.press('Enter').catch(() => {})
await page.waitForTimeout(1800)
await scan('search-results')

// 3. click first result -> focus surface
const res = page.locator('.search-result-listitem, .search-result-row, .search-result-item').first()
if (await res.count().catch(() => 0) > 0) { await res.click().catch(() => {}); await page.waitForTimeout(2000) }
await scan('focus-card')

// 4. dive inside (semantic-dive)
await page.evaluate(() => { const d = document.querySelector('.focus-stage-dive-btn, #btn-focus-dive'); if (d && !d.hidden) d.click() }).catch(() => {})
await page.waitForTimeout(1500)
await scan('inside-dive')

// 5. map surface
await page.evaluate(() => { const m = document.querySelector('#btn-inside-map, [data-journey-action="open-map"]'); if (m) m.click() }).catch(() => {})
await page.waitForTimeout(1500)
await scan('map')

// 6. trail (via focus next)
await page.evaluate(() => { const n = document.querySelector('#btn-inside-next, [data-journey-action="next-stop"]'); if (n) n.click() }).catch(() => {})
await page.waitForTimeout(1500)
await scan('trail')

// 7. help dialog if present
await page.evaluate(() => { const h = document.querySelector('#btn-app-help'); if (h) h.click() }).catch(() => {})
await page.waitForTimeout(900)
await scan('help')

await b.close()
console.log('\n=== SUMMARY ===')
for (const [k, v] of Object.entries(results)) {
  console.log(`${k.padEnd(14)} surface=${String(v.surface).padEnd(16)} off=${v.off.length} clip=${v.clip.length}`)
}
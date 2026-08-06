/* probe-live-map.mjs — walk the REAL-data map/trail routes (not idle) and scan for
 * layout offenders + geometry. Drive: boot -> search -> result -> inside-map -> map surface,
 * then 'open-map' to the full map with real tile geometry.
 * FOLD A: map surface offenders (any element off-viewport).
 * FOLD B: trail route render (route lines present, no zero-size buffers).
 * FOLD C: panels over map (info / legend / compass) — no overlap with controls.
 * Writes JSONL per fold. Usage: node probe-live-map.mjs <url> <out.jsonl>
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import { write, beat, bounded, boot, openSearch } from './probe-lib.mjs'

const URL = process.argv[2] || 'http://localhost:5174'
const OUT = process.argv[3] || 'tmp/live-map.found.jsonl'
fs.rmSync(OUT, { force: true })
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1440, height: 900 } })

async function scanSurf(label) {
  beat(OUT, label)
  const r = await page.evaluate(() => {
    const vp = { w: innerWidth, h: innerHeight }
    const off = []
    for (const el of document.querySelectorAll('button, a, div, span, section')) {
      const b = el.getBoundingClientRect()
      if (b.width < 2 || b.height < 2 || el.offsetParent === null) continue
      if (b.right > vp.w + 1 && b.width > 24) off.push({ cls: String(el.className).slice(0, 40), right: Math.round(b.right), txt: (el.textContent || '').trim().slice(0, 18) })
    }
    // canvas presence + size (real geometry check)
    const canvas = document.querySelector('canvas#canvas, #canvas-container canvas')
    const mapW = document.querySelector('#map-container')
    return {
      surface: document.body.dataset.panelSurface,
      mode: document.body.dataset.mode,
      canvas: canvas ? { w: Math.round(canvas.getBoundingClientRect().width), h: Math.round(canvas.getBoundingClientRect().height), zero: canvas.getBoundingClientRect().width < 100 } : null,
      map: mapW ? { w: Math.round(mapW.getBoundingClientRect().width), h: Math.round(mapW.getBoundingClientRect().height) } : null,
      scrollW: document.documentElement.scrollWidth,
      hit: [...document.querySelectorAll('[class*="route"], [class*="trail"]')].filter(e => e.offsetParent !== null).slice(0, 4).map(e => String(e.className).slice(0, 36)),
      off: off.slice(0, 10)
    }
  })
  write(OUT, { kind: 'surface', label, ...r })
  console.log(`[live-map] ${label} surface=${r.surface} mode=${r.mode} off=${r.off.length}`)
}

await bounded(() => boot(page, `${URL}?nodemo=1`), 60000, 'boot').catch((e) => write(OUT, { kind: 'error', phase: 'boot', msg: e.message }))
await bounded(() => openSearch(page), 40000, 'search').catch(() => {})
await scanSurf('search-result')
// force via the inside-map button / mode nav to map
await page.evaluate(() => {
  const mk = document.querySelector('#btn-inside-map, [data-journey-action="open-map"], [data-mode="map"], [data-testid="nav-map"]')
  if (mk) mk.click()
}).catch(() => {})
await page.waitForTimeout(2200)
await scanSurf('map')
// try trail mode (next-stop) from a focused node if available
await page.evaluate(() => {
  const n = document.querySelector('#btn-inside-next, [data-journey-action="next-stop"], [data-journey-action="start-trail"]')
  if (n) n.click()
}).catch(() => {})
await page.waitForTimeout(1500)
await scanSurf('trail')
write(OUT, { kind: 'done' })
await b.close()
console.log('[live-map] complete -> ' + OUT)
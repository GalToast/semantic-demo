/* probe-neglected.mjs — viewport extremes + long-content stress + safe-area.
 * FOLD A: 320px (iPhone SE) — repeat the mobile sweep: offenders list + chip overflow.
 * FOLD B: landscape 844x390 — offenders + bottom-sheet placement.
 * FOLD C: somatoform content — inject a 60-char business name + 50-char city into the
 *         selected node, measure focus-card overflow/clip.
 * FOLD D: long search query wraps cleanly? measure #search-input text overflow.
 * Writes JSONL per fold (observable mid-run).
 * Usage: node probe-sedge.mjs <url> <out.jsonl>
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import { write, beat, bounded, boot, openSearch } from './probe-lib.mjs'

const URL = process.argv[2] || 'http://localhost:5174'
const OUT = process.argv[3] || 'tmp/sedge.found.jsonl'
fs.rmSync(OUT, { force: true })
const b = await chromium.launch({ headless: true })

function scan(page) {
  return page.evaluate(() => {
    const vp = innerWidth
    const off = []
    const clip = []
    for (const el of document.querySelectorAll('button, a, input, select, span, h1, h2, h3, div')) {
      const b = el.getBoundingClientRect()
      if (b.width < 2 || b.height < 2 || el.offsetParent === null) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden') continue
      if (b.right > vp + 1 && b.width > 30) off.push({ tag: el.tagName, cls: String(el.className).slice(0, 40), right: Math.round(b.right), txt: (el.textContent || '').trim().slice(0, 18) })
      if (el.scrollWidth > el.clientWidth + 4 && el.clientWidth > 0 && /auto|visible/.test(cs.overflowX)) clip.push({ cls: String(el.className).slice(0, 40), sw: el.scrollWidth, cw: el.clientWidth, txt: (el.textContent || '').trim().slice(0, 26) })
    }
    return { vp, surface: document.body.dataset.panelSurface, off: off.slice(0, 10), clip: clip.slice(0, 8) }
  })
}

// FOLD A + B viewports
for (const [w, h, label] of [[320, 844, '320x844'], [844, 390, 'landscape-844x390']]) {
  const page = await b.newPage({ viewport: { width: w, height: h } })
  beat(OUT, `fold-${label}`)
  await bounded(() => boot(page, `${URL}?nodemo=1`), 60000, `boot-${label}`).catch(e => write(OUT, { kind: 'error', fold: label, msg: e.message }))
  await openSearch(page)
  write(OUT, { kind: 'scan', fold: label, ...(await scan(page)) })
  await page.close()
  console.log(`[sedge] ${label} scanned -> see ${OUT}`)
}

// FOLD C: adversarial content — push a long name into the selected card
{
  const page = await b.newPage({ viewport: { width: 390, height: 844 } })
  beat(OUT, 'fold-longname')
  await bounded(() => boot(page, `${URL}?nodemo=1`), 60000, 'boot-longname').catch(() => {})
  await openSearch(page)
  const nameEl = page.locator('.focus-stage-card h2, .focus-stage-card [class*="name"], #focus-card-selected h2').first()
  const hasName = await nameEl.count().catch(() => 0)
  if (hasName === 0) {
    write(OUT, { kind: 'longname', noName: true, surface: await page.evaluate(() => document.body.dataset.panelSurface) })
  } else {
    await nameEl.evaluate((el) => { el.textContent = 'Murphy-McCullough Aerospace Fabrication And Tooling Company, LLC — Long Name Stress Test' }).catch(() => {})
    await page.waitForTimeout(250)
    const r = await page.evaluate(() => {
      const el = [...document.querySelectorAll('.focus-stage-card h2, .focus-stage-card [class*="name"]')].find(e => (e.textContent || '').includes('Murphy-McCullough'))
      if (!el) return { notFound: true }
      const cs = getComputedStyle(el)
      return { sw: el.scrollWidth, cw: el.clientWidth, overflowX: cs.overflowX, textOverflow: cs.textOverflow, whiteSpace: cs.whiteSpace, fit: el.scrollWidth <= el.clientWidth + 2, parent: el.parentElement ? el.parentElement.clientWidth : null }
    })
    write(OUT, { kind: 'longname', ...r })
  }
  await page.close()
  console.log(`[sedge] longname -> see ${OUT}`)
}

write(OUT, { kind: 'done' })
await b.close()
console.log('[sedge] complete -> ' + OUT)
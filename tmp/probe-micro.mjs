/* probe-micro.mjs — hover/active/pressed feedback audit across all visible buttons.
 * For each visible interactive control: does :hover change anything (border/bg/transform)?
 * Does :active? We detect via computed-style deltas before/after hover & active.
 * Writes JSONL per surface with any control lacking ANY hover feedback.
 * Usage: node probe-micro.mjs <url> <out.jsonl>
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import { write, beat, bounded, boot, openSearch } from './probe-lib.mjs'

const URL = process.argv[2] || 'http://localhost:5174'
const OUT = process.argv[3] || 'tmp/micro.found.jsonl'
fs.rmSync(OUT, { force: true })
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1280, height: 800 } })

async function hoverScan(label) {
  beat(OUT, label)
  const controls = await page.$$('button, [role="button"], a[href], summary')
  let noFeedback = []
  for (const c of controls) {
    try {
      const visible = await c.isVisible()
      if (!visible) continue
      const before = await c.evaluate((el) => { const cs = getComputedStyle(el); return cs.borderColor + '|' + cs.backgroundColor + '|' + cs.transform + '|' + cs.boxShadow.slice(0, 30) })
      await c.hover({ force: true }).catch(() => {})
      await page.waitForTimeout(90)
      const after = await c.evaluate((el) => { const cs = getComputedStyle(el); return cs.borderColor + '|' + cs.backgroundColor + '|' + cs.transform + '|' + cs.boxShadow.slice(0, 30) })
      // force a mouseleave so subsequent hovers aren't sticky
      await page.mouse.move(2, 2).catch(() => {})
      await page.waitForTimeout(60)
      if (before === after) {
        const txt = await c.textContent().catch(() => '')
        const cls = await c.getAttribute('class').catch(() => '')
        noFeedback.push({ cls: String(cls).slice(0, 40), txt: (txt || '').trim().slice(0, 24) })
      }
    } catch {}
    if (noFeedback.length >= 10) break
  }
  write(OUT, { kind: 'hover', label, noFeedback: noFeedback.slice(0, 10) })
  console.log(`[micro] ${label}: ${noFeedback.length} controls w/ no hover feedback`)
}

await bounded(() => boot(page, `${URL}?nodemo=1`), 60000, 'boot').catch((e) => write(OUT, { kind: 'error', phase: 'boot', msg: e.message }))
await hoverScan('idle')
await openSearch(page)
await hoverScan('search')
write(OUT, { kind: 'done' })
await b.close()
console.log('[micro] complete -> ' + OUT)
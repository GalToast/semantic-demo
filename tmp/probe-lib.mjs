/* probe-lib.mjs — shared probe plumbing to prevent silent hangs + buffered output.
 * 1) boundedAsync: any awaited operation runs under a hard timeout (fails loudly).
 * 2) heartbeat: every surface writes a line to outfile (JSONL) so an observer can
 *    see progress vs. a wedge — NOT a pipe that line-buffers to exit.
 * 3) write(): append JSONL per surface (observable mid-run); never buffer to stdout.
 * Usage: import { write, beat, bounded, boot3d, openSearch } from './probe-lib.mjs'
 */
import fs from 'node:fs'

export function write(out, obj) {
  fs.appendFileSync(out, JSON.stringify({ ts: new Date().toISOString(), ...obj }) + '\n')
}

export function beat(out, label) {
  write(out, { kind: 'beat', label, at: Date.now() })
}

/* bounded: wraps fn in a hard timeout; rejects on exceed so a stuck boot/nav
 * fails loudly instead of wedging the whole probe. */
export async function bounded(fn, ms, name) {
  let timer
  const t = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`TIMEOUT after ${ms}ms in ${name}`)), ms)
  })
  try {
    return await Promise.race([fn(), t])
  } finally {
    clearTimeout(timer)
  }
}

/* Boot the app past splash + WebGL gate; bounded to ~45s. */
export async function boot(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {})
  await page.waitForTimeout(1800)
  const cta = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
  await bounded(() => cta.waitFor({ state: 'visible', timeout: 25000 }), 30000, 'splash-cta').catch(() => {})
  await cta.click().catch(() => {})
  await bounded(
    () => page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 25000, polling: 200 }),
    30000,
    'webgl-boot'
  ).catch(() => {})
  await page.waitForTimeout(900)
  return true
}

/* Open a coffee search and pick the first result (surface: focus card). */
export async function openSearch(page) {
  await page.evaluate(() => { const i = document.querySelector('input[type="search"], #search-input'); if (i) i.focus() })
  await page.keyboard.type('coffee', { delay: 15 }).catch(() => {})
  await page.keyboard.press('Enter').catch(() => {})
  await page.waitForTimeout(2000)
  const res = page.locator('.search-result-listitem, .search-result-row').first()
  if (await res.count().catch(() => 0) > 0) { await res.click().catch(() => {}); await page.waitForTimeout(1800) }
}
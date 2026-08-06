/* probe-inside-audit.mjs — Worker A: "inside" surface audit (read-only).
 * Reaches the inside journey surface (via inside chip → semantic dive, then
 * End-of-Trail → pure inside panel), runs the DOM battery on both states,
 * writes JSONL evidence. Battery: h-overflow, clipped nowrap text,
 * interactive h<42, no accessible name.
 */
import fs from 'node:fs'
import { chromium } from '@playwright/test'

const URL = process.env.AUDIT_URL || 'http://localhost:5174'
const OUT = `tmp/audit-inside-${new Date().toISOString().slice(0, 10)}.jsonl`
fs.writeFileSync(OUT, '')
const write = (o) => fs.appendFileSync(OUT, JSON.stringify({ ts: new Date().toISOString(), ...o }) + '\n')
const beat = (label) => write({ kind: 'beat', label, at: Date.now() })

function bounded(fn, ms, name) {
  let timer
  const p = typeof fn === 'function' ? fn() : fn
  const t = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms in ${name}`)), ms) })
  return Promise.race([p, t]).finally(() => clearTimeout(timer))
}

const snap = async (page, label) => {
  try {
    return await bounded(page.evaluate((label) => {
      const q = (s) => document.querySelector(s)
      const box = (el) => el ? (() => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } })() : null
      const chip = q('.mode-chip[data-mode="inside"]')
      return {
        label,
        panelSurface: document.body.dataset.panelSurface || null,
        journeyPhase: document.body.dataset.journeyPhase || null,
        semanticDive: document.body.dataset.semanticDive || null,
        navMode: window.__APP_STATE__?.navState?.mode ?? null,
        navSurface: window.__APP_STATE__?.navState?.surface ?? null,
        trailDepth: window.__APP_STATE__?.navState?.trailDepth ?? null,
        points: window.__APP_STATE__?.points?.length ?? 0,
        insideChip: chip ? { text: (chip.textContent || '').trim().slice(0, 20), box: box(chip), locked: chip.disabled } : null,
        insideControls: ['#btn-inside-next', '#btn-inside-map', '#btn-inside-county'].map((s) => { const e = q(s); return e && !e.hidden ? { id: s, box: box(e), disabled: e.getAttribute('aria-disabled') } : null }).filter(Boolean),
        insideStatus: (q('#focus-stage-inside-status')?.textContent || '').trim().slice(0, 30),
        diveBtn: box(q('.focus-stage-dive-btn')),
        compassAction: (() => { const b = q('.journey-compass-action'); return b ? { text: (b.textContent || '').trim().slice(0, 30), action: b.getAttribute('data-journey-action'), box: box(b) } : null })()
      }
    }, label), 10000, 'snap')
  } catch (e) { write({ kind: 'snap-fail', label, error: e.message.slice(0, 120) }); return null }
}

const runBattery = async (page, tag) => {
  const battery = await bounded(page.evaluate(() => {
    const VW = innerWidth, VH = innerHeight
    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CANVAS', 'SVG', 'LINK', 'META', 'TITLE', 'HEAD', 'TEMPLATE', 'NOSCRIPT'])
    const INTERACTIVE = 'a, button, [role="button"], [tabindex], select, input, textarea, summary'
    const hits = { overflow: [], clip: [], short: [], noname: [] }
    const els = document.querySelectorAll('body *')
    for (const el of els) {
      if (SKIP_TAGS.has(el.tagName)) continue
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') === 0) continue
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) continue
      const cls = (el.className && typeof el.className === 'string') ? el.className : ''
      const sel = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls.trim().split(/\s+/).slice(0, 3).join('.') : ''}`
      const onScreen = r.left < VW && r.right > 0 && r.top < VH && r.bottom > 0
      const hasDirectText = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent || '').trim().length > 0)
      const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60)
      const clippedAncestor = (() => {
        let p = el.parentElement, depth = 0
        while (p && depth < 10) {
          const pc = getComputedStyle(p)
          if (['hidden', 'clip', 'auto', 'scroll'].includes(pc.overflow) || ['hidden', 'clip'].includes(pc.overflowX)) {
            return { tag: p.tagName.toLowerCase(), cls: (typeof p.className === 'string' ? p.className : '').split(/\s+/).slice(0, 2).join('.'), overflow: pc.overflow, overflowX: pc.overflowX }
          }
          p = p.parentElement; depth++
        }
        return null
      })()
      const styleExcerpt = { display: cs.display, position: cs.position, whiteSpace: cs.whiteSpace, textOverflow: cs.textOverflow, fontSize: cs.fontSize, lineHeight: cs.lineHeight, overflow: cs.overflow }

      if (r.right > VW + 2) {
        hits.overflow.push({ sel, cls: cls.slice(0, 60), tag: el.tagName.toLowerCase(), right: Math.round(r.right), w: Math.round(r.width), left: Math.round(r.left), onScreen, styleExcerpt, clippedAncestor })
      }
      if (cs.whiteSpace.includes('nowrap') && el.scrollWidth > el.clientWidth + 2 && (hasDirectText || txt.length > 0)) {
        hits.clip.push({ sel, cls: cls.slice(0, 60), tag: el.tagName.toLowerCase(), text: txt, sw: el.scrollWidth, cw: el.clientWidth, onScreen, styleExcerpt, clippedAncestor })
      }
      if (el.matches(INTERACTIVE) && r.height < 42) {
        hits.short.push({ sel, cls: cls.slice(0, 60), tag: el.tagName.toLowerCase(), text: txt, h: Math.round(r.height), w: Math.round(r.width), onScreen, disabled: el.disabled || el.getAttribute('aria-disabled') === 'true', styleExcerpt, clippedAncestor })
      }
      if (el.matches(INTERACTIVE) && !(el.disabled || el.getAttribute('aria-disabled') === 'true')) {
        const labelledBy = el.getAttribute('aria-labelledby')
        const labelTarget = labelledBy ? document.getElementById(labelledBy) : null
        const hasName = (el.getAttribute('aria-label') || '').trim() ||
          (el.getAttribute('title') || '').trim() ||
          (labelledBy && labelTarget && (labelTarget.textContent || '').trim()) ||
          (hasDirectText && txt.length > 0) ||
          (el.getAttribute('aria-hidden') === 'true')
        if (!hasName) {
          hits.noname.push({ sel, cls: cls.slice(0, 60), tag: el.tagName.toLowerCase(), text: txt, onScreen, styleExcerpt, clippedAncestor })
        }
      }
      if (hits.overflow.length > 200 && hits.clip.length > 200 && hits.short.length > 200 && hits.noname.length > 200) break
    }
    return { viewport: { VW, VH }, counts: { overflow: hits.overflow.length, clip: hits.clip.length, short: hits.short.length, noname: hits.noname.length }, hits }
  }), 25000, 'battery')

  write({ kind: 'battery', tag, counts: battery.counts, viewport: battery.viewport })
  for (const [cat, list] of Object.entries(battery.hits)) {
    for (const h of list.slice(0, 200)) write({ kind: 'hit', tag, cat, ...h })
  }
  return battery
}

const getSurface = async () => {
  try { return await bounded(page.evaluate(() => document.body.dataset.panelSurface || ''), 6000, 'surface-read') } catch { return '' }
}

// ── reach phase ────────────────────────────────────────────────────────────
beat('launch')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (m) => { if (m.type() === 'error') write({ kind: 'console-error', text: m.text().slice(0, 200) }) })
page.on('pageerror', (e) => write({ kind: 'pageerror', text: String(e).slice(0, 200) }))

let reachMode = 'deep-link'
try {
  await bounded(page.goto(`${URL}?nodemo=1&q=coffee`, { waitUntil: 'domcontentloaded', timeout: 20000 }), 25000, 'goto')
  beat('goto-ok')
  await bounded(page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 25000, polling: 200 }), 30000, 'webgl-gate').catch(() => {})
  await page.waitForTimeout(3500)
  write(await snap(page, 'after-deeplink'))
} catch (e) {
  write({ kind: 'reach-fail', mode: reachMode, error: e.message })
  beat('reach-fail-deeplink')
}

let s1 = await getSurface()
if (!['focus', 'focus-search'].includes(s1)) {
  reachMode = 'search'
  beat('fallback-search')
  try {
    const cta = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
    await bounded(cta.waitFor({ state: 'visible', timeout: 20000 }), 25000, 'splash-cta').catch(() => {})
    await bounded(cta.click(), 5000, 'cta-click').catch(() => {})
    await bounded(page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 25000, polling: 200 }), 30000, 'webgl-gate-2').catch(() => {})
    await bounded(page.evaluate(() => { const i = document.querySelector('input[type="search"], #search-input'); if (i) i.focus() }), 5000, 'focus-input').catch(() => {})
    await page.keyboard.type('coffee', { delay: 10 }).catch(() => {})
    await page.keyboard.press('Enter').catch(() => {})
    await page.waitForTimeout(2000)
    const res = page.locator('.search-result-listitem, .search-result-row').first()
    if (await res.count().catch(() => 0) > 0) { await bounded(res.click(), 5000, 'first-result-click').catch(() => {}); await page.waitForTimeout(1800) }
    write(await snap(page, 'after-search'))
  } catch (e) { write({ kind: 'reach-fail', mode: 'search', error: e.message }) }
}

let s2 = await getSurface()
if (!['focus', 'focus-search'].includes(s2)) {
  beat('focus-fallback-click')
  const res = page.locator('.search-result-listitem, .search-result-row').first()
  if (await res.count().catch(() => 0) > 0) {
    await bounded(res.click(), 5000, 'result-click-2').catch(() => {})
    await page.waitForTimeout(1800)
    s2 = await getSurface()
  }
}

if (!['focus', 'focus-search'].includes(s2)) {
  write({ kind: 'reach-fail', mode: 'inside-gate', error: `surface=${s2} (need focus first)` })
  beat('reach-fail-no-focus')
} else {
  beat('attempt-inside-chip')
  const chip = page.locator('.mode-chip[data-mode="inside"]')
  if (await chip.count().catch(() => 0) > 0) {
    const bb = await chip.boundingBox().catch(() => null)
    if (bb && bb.width > 4 && bb.height > 4) {
      await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2).catch(() => {})
      write({ kind: 'inside-chip-click', result: 'clicked', box: bb })
    } else write({ kind: 'inside-chip-click', result: 'no-box' })
  } else {
    write({ kind: 'inside-chip-click', result: 'no-inside-chip' })
  }
  await page.waitForTimeout(2500)
  write(await snap(page, 'after-inside-chip'))
}

const s3 = await getSurface()
beat(`surface-after-chip:${s3}`)
const insideEntered = s3 === 'semantic-dive' || s3 === 'inside'

if (!insideEntered) {
  write({ kind: 'reach-fail', mode: 'inside', error: `surface=${s3} after chip` })
} else {
  // ── battery #1: dive-inside state (canonical inside entry) ──────────────
  write(await snap(page, 'battery-1-context'))
  await page.screenshot({ path: 'tmp/audit-inside-dive-state.png' }).catch(() => {})
  write({ kind: 'screenshot', tag: 'dive-inside', file: 'tmp/audit-inside-dive-state.png' })
  const b1 = await runBattery(page, 'dive-inside')
  write({ kind: 'battery-done', tag: 'dive-inside', counts: b1.counts })

  // ── End-of-Trail path → pure inside panel surface ────────────────────────
  beat('end-of-trail')
  let ended = false
  for (let i = 0; i < 40 && !ended; i++) {
    const st = await page.evaluate(() => {
      const btn = document.querySelector('#btn-inside-next')
      const action = document.querySelector('.journey-compass-action[data-journey-action="show-trail-panel"]')
      return { nextDisabled: btn ? btn.getAttribute('aria-disabled') === 'true' : null, endOfTrailBtn: action ? (action.textContent || '').trim().slice(0, 30) : null }
    }).catch(() => ({}))
    if (st?.endOfTrailBtn) {
      const b = page.locator('.journey-compass-action[data-journey-action="show-trail-panel"]')
      await bounded(b.click(), 5000, 'end-of-trail-click').catch(() => {})
      ended = true
      break
    }
    if (st?.nextDisabled === true) {
      // fallback: try compass primary action button directly
      const primary = page.locator('.journey-compass-action').first()
      if (await primary.count().catch(() => 0) > 0) {
        const txt = (await primary.textContent().catch(() => '')) || ''
        if (txt.includes('End')) { await bounded(primary.click(), 5000, 'primary-end-click').catch(() => {}); ended = true; break }
      }
      break
    }
    const nbtn = page.locator('#btn-inside-next')
    if (await nbtn.count().catch(() => 0) > 0) await bounded(nbtn.click(), 4000, 'next-stop').catch(() => {})
    await page.waitForTimeout(500)
  }
  write({ kind: 'end-of-trail', ended })
  await page.waitForTimeout(1500)
  write(await snap(page, 'after-end-of-trail'))
  await page.screenshot({ path: 'tmp/audit-inside-after-trail.png' }).catch(() => {})
  write({ kind: 'screenshot', tag: 'after-trail', file: 'tmp/audit-inside-after-trail.png' })

  const s4 = await getSurface()
  if (s4 === 'inside') {
    beat('surface-inside-pure')
    const b2 = await runBattery(page, 'inside-pure')
    write({ kind: 'battery-done', tag: 'inside-pure', counts: b2.counts })
  } else {
    write({ kind: 'reach-fail', mode: 'inside-pure', error: `surface=${s4} after end-of-trail` })
    beat(`surface-pure-fail:${s4}`)
  }
}

beat('done')
console.log('final surface:', await getSurface())
await browser.close()

(() => {
  const el = document.querySelector('#btn-prev-node')
  if (!el) return { missing: true, surface: document.body.dataset.panelSurface }
  const cs = getComputedStyle(el)
  // find every rule that matches the button with width/flex/min-width/overflow
  const rules = []
  for (const sheet of document.styleSheets) {
    let rs; try { rs = [...sheet.cssRules] } catch { continue }
    for (const r of rs) {
      if (!r.selectorText || r.style === undefined) continue
      const sel = r.selectorText
      if (sel.includes('trail-btn') || sel.includes('focus-stage-action-btn')) {
        rules.push({
          sel: sel.slice(0, 80), w: r.style.width, minW: r.style.minWidth,
          flex: r.style.flex, overflow: r.style.overflow, order: r.style.order,
          padding: r.style.padding, display: r.style.display
        })
      }
    }
  }
  return {
    id: el.id,
    rect: { w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height },
    clientW: el.clientWidth, scrollW: el.scrollWidth,
    cs: { width: cs.width, minWidth: cs.minWidth, maxWidth: cs.maxWidth, flex: cs.flex, flexBasis: cs.flexBasis, flexGrow: cs.flexGrow, flexShrink: cs.flexShrink, overflow: cs.overflow, overflowX: cs.overflowX, whiteSpace: cs.whiteSpace, padding: cs.padding, display: cs.display, pos: cs.position },
    rules,
    parent: (() => { const p = el.parentElement; if (!p) return null; const pc = getComputedStyle(p); return { cls: String(p.className).slice(0, 60), display: pc.display, flex: pc.flex, w: p.clientWidth, overflow: pc.overflow, gap: pc.gap } })(),
    surface: document.body.dataset.panelSurface
  }
})()
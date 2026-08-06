(() => {
  const el = document.querySelector('#btn-prev-node')
  if (!el) return { missing: true }
  const out = []
  for (const sheet of document.styleSheets) {
    let rs; try { rs = [...sheet.cssRules] } catch { continue }
    for (const r of rs) {
      if (!r.selectorText || r.style === undefined) continue
      try { if (!el.matches(r.selectorText)) continue } catch { continue }
      const s = r.style
      if (s.width || s.flex || s.minWidth || s.maxWidth || s.flexBasis || s.padding || s.display || s.overflow) {
        out.push({ sel: r.selectorText.slice(0, 90), w: s.width, flex: s.flex, fb: s.flexBasis, mw: s.minWidth, MW: s.maxWidth, pad: s.padding, disp: s.display, ov: s.overflow, order: s.order })
      }
    }
  }
  return { total: out.length, rules: out }
})()

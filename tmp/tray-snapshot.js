(() => {
  const tray = document.querySelector('#trail-controls')
  if (!tray) return { missing: true, surface: document.body.dataset.panelSurface }
  const kids = [...tray.children].map(c => ({
    cls: String(c.className).slice(0, 44),
    w: Math.round(c.getBoundingClientRect().width),
    flex: getComputedStyle(c).flex, fg: getComputedStyle(c).flexGrow, fb: getComputedStyle(c).flexBasis,
    mw: getComputedStyle(c).minWidth, MW: getComputedStyle(c).maxWidth, ov: getComputedStyle(c).overflow
  }))
  const journey = document.querySelector('.focus-stage-journey')
  const chain = []
  let cur = tray.parentElement
  for (let i = 0; cur && i < 5; i++) {
    const r = cur.getBoundingClientRect()
    const cs = getComputedStyle(cur)
    chain.push({ tag: cur.tagName, cls: String(cur.className || cur.id).slice(0, 50), w: Math.round(r.width), display: cs.display, overflow: cs.overflow, gridCols: cs.gridTemplateColumns || '', pos: cs.position })
    cur = cur.parentElement
  }
  return { trayW: Math.round(tray.getBoundingClientRect().width), trayGap: getComputedStyle(tray).gap, trayOv: getComputedStyle(tray).overflow, kids, journey: journey ? getComputedStyle(journey).gridTemplateColumns : null, chain }
})()

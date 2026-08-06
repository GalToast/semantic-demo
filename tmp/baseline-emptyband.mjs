() => {
  const panel = document.querySelector('aside#info-panel')
  if (!panel) return { miss: true, surface: document.body.dataset.panelSurface }
  const r = panel.getBoundingClientRect()
  const content = document.querySelector('#info-panel-content')
  const cr = content ? content.getBoundingClientRect() : null
  const cs = getComputedStyle(panel)
  return {
    surface: document.body.dataset.panelSurface,
    vw: innerWidth, vh: innerHeight,
    panel: { h: Math.round(r.height), bottom: Math.round(r.bottom), top: Math.round(r.top) },
    heightRule: cs.height,
    contentBottom: cr ? Math.round(cr.bottom) : null,
    deadBand: cr ? Math.round(r.bottom - cr.bottom) : null,
    compact: document.body.dataset.compact
  }
}

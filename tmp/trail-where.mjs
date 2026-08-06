() => {
  const tc = document.querySelector('.trail-controls')
  if (!tc) return { none: true, surface: document.body.dataset.panelSurface }
  const ancestors = []
  let cur = tc
  for (let i = 0; cur && i < 6; i++) {
    ancestors.push({ tag: cur.tagName.toLowerCase(), cls: String(cur.className || cur.id).slice(0, 50), w: Math.round(cur.getBoundingClientRect().width), display: getComputedStyle(cur).display, position: getComputedStyle(cur).position })
    cur = cur.parentElement
  }
  return { surface: document.body.dataset.panelSurface, trailInJourney: !!tc.closest('.focus-stage-journey'), chain: ancestors }
}

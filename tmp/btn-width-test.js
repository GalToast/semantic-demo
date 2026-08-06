(() => {
  const el = document.querySelector('#btn-prev-node')
  if (!el) return { missing: true }
  el.style.width = '84px'
  el.style.flex = '0 0 auto'
  el.style.minWidth = 'max-content'
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    resolve({
      inlineW: '84px',
      rectW: Math.round(r.width),
      clientW: el.clientWidth,
      scrollW: el.scrollWidth,
      overflow: cs.overflow,
      flex: cs.flex
    })
  })))
})()

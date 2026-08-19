import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// W48-J UX-copy audit: lock the HTML <head> (browser-tab title + search-snippet
// description) + the <noscript> fallback against forbidden engineering jargon.
// "Semantic Explorer" is the product brand (acceptable in the title), but the
// descriptive tagline + description + noscript must not leak "mycelium"
// (system-internal metaphor) or the "semantic explorer" / "mapping similarity"
// descriptors. See docs/ux-copy-rules.md for the forbidden-jargon table.

function readHead(file: string): { title: string; description: string; noscript: string } {
  const src = readFileSync(resolve(__dirname, '../../src', file), 'utf8')
  const titleMatch = src.match(/<title>([^<]*)<\/title>/)
  const descMatch = src.match(/name="description"\s+content="([^"]*)"/)
  const noscriptMatch = src.match(/<noscript>([\s\S]*?)<\/noscript>/)
  return {
    title: titleMatch ? titleMatch[1] : '',
    description: descMatch ? descMatch[1] : '',
    noscript: noscriptMatch ? noscriptMatch[1] : '',
  }
}

const app = readHead('app.html')
const index = readHead('index.html')

describe('HTML head + noscript friendly copy (W48-J UX-copy audit)', () => {
  it('app.html title keeps the brand but drops the forbidden "Mycelium" tagline', () => {
    expect(app.title).toContain('Semantic Explorer') // product brand — acceptable
    expect(app.title).not.toMatch(/mycelium/i) // forbidden system-internal metaphor
    expect(app.title).toContain('Montgomery County Businesses') // friendly tagline
  })

  it('app.html description has no engineering jargon descriptors', () => {
    expect(app.description).not.toMatch(/semantic explorer/i)
    expect(app.description).not.toMatch(/mycelium/i)
    expect(app.description).not.toMatch(/mapping similarity/)
  })

  it('app.html description uses friendly concrete copy', () => {
    expect(app.description).toContain('interactive 3D map')
    expect(app.description).toContain('similar businesses')
    expect(app.description).toContain('neighborhood connections')
  })

  it('index.html title + description match app.html (no drift)', () => {
    expect(index.title).toEqual(app.title)
    expect(index.description).toEqual(app.description)
  })

  it('index.html noscript has no "semantic explorer" descriptor or "mycelium"', () => {
    expect(index.noscript).not.toMatch(/semantic explorer/i)
    expect(index.noscript).not.toMatch(/mycelium/i)
  })

  it('index.html noscript uses friendly copy', () => {
    expect(index.noscript).toContain('3D business map')
  })
})

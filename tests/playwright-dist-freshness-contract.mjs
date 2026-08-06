import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getPlaywrightDistFreshness } from '../scripts/playwright-dist-freshness.mjs'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-playwright-freshness-'))
const distIndex = path.join(root, 'dist', 'svelte', 'index.html')
const sourceFile = path.join(root, 'src', 'App.svelte')

try {
    fs.mkdirSync(path.dirname(distIndex), { recursive: true })
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true })
    fs.writeFileSync(distIndex, '<html></html>')
    fs.writeFileSync(sourceFile, '<script></script>')

    const baseTime = Date.now()
    const sourceTime = new Date(baseTime)
    const distTime = new Date(baseTime + 1000)
    fs.utimesSync(sourceFile, sourceTime, sourceTime)
    fs.utimesSync(distIndex, distTime, distTime)

    const fresh = getPlaywrightDistFreshness({ root, distIndex })
    assert.equal(fresh.fresh, true, 'dist should be fresh when it is newer than source inputs')

    const later = new Date(baseTime + 2000)
    fs.utimesSync(sourceFile, later, later)
    const stale = getPlaywrightDistFreshness({ root, distIndex })
    assert.equal(stale.fresh, false, 'dist should be stale when a source input is newer')

    fs.rmSync(distIndex)
    const missing = getPlaywrightDistFreshness({ root, distIndex })
    assert.equal(missing.reason, 'missing', 'missing dist should require a build')

    console.log('playwright-dist-freshness-contract: PASS')
} finally {
    fs.rmSync(root, { recursive: true, force: true })
}

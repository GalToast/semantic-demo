import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const cssDir = path.join(root, 'css')
const viteConfigPath = path.join(root, 'vite.config.ts')

const failures = []

function fail(message) {
    failures.push(message)
}

const onDisk = fs.readdirSync(cssDir).filter((f) => f.endsWith('.css'))

const viteConfig = fs.readFileSync(viteConfigPath, 'utf8')
const legacyStart = viteConfig.indexOf('const LEGACY_CSS_LINKS = [')
const legacyEnd = viteConfig.indexOf(']', legacyStart)
if (legacyStart === -1 || legacyEnd === -1) {
    fail('LEGACY_CSS_LINKS array not found in vite.config.ts')
}

const block = viteConfig.slice(legacyStart, legacyEnd + 1)
const linked = new Set(
    [...block.matchAll(/href="([^"]+\.css)"/g)]
        .map((m) => m[1])
        .map((href) => href.replace(/^\.\//, '').replace(/^css\//, ''))
)

for (const file of onDisk) {
    if (!linked.has(file)) {
        fail(`css/${file} exists on disk but is not linked in LEGACY_CSS_LINKS`)
    }
}

if (failures.length) {
    console.error('CSS link linkage check failed:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
}

console.log(
    `CSS link linkage check OK: ${onDisk.length} css/ files, ${linked.size} legacy CSS links verified in vite.config.ts`
)

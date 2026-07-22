import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const demoPath = path.join(root, 'semantic-demo.css')
const cssDir = path.join(root, 'css')

const failures = []

function fail(message) {
    failures.push(message)
}

function read(relativePath) {
    const absolutePath = path.join(root, relativePath)
    if (!fs.existsSync(absolutePath)) {
        fail(`${relativePath} is missing`)
        return ''
    }
    return fs.readFileSync(absolutePath, 'utf8')
}

// css/ files loaded by LEGACY_CSS_LINKS <link> tags (see vite.config.ts) —
// they ship but are not required to appear in semantic-demo.css @import.
const linkSharded = new Set([
    'mobile_premium__components.css',
    'mobile_premium__layout.css',
    'mobile_premium__state.css'
])

const demoText = read('semantic-demo.css')
const imported = new Set([...demoText.matchAll(/@import\s+url\(['"]\.\/css\/([^?'"]+)/g)].map((m) => m[1]))

const onDisk = fs.readdirSync(cssDir).filter((f) => f.endsWith('.css'))

for (const file of onDisk) {
    if (linkSharded.has(file)) continue
    if (!imported.has(file)) {
        fail(`css/${file} exists on disk but is NOT @imported by semantic-demo.css`)
    }
}

for (const file of imported) {
    if (linkSharded.has(file)) continue
    if (!onDisk.includes(file)) {
        fail(`semantic-demo.css imports css/${file} but the file is missing on disk`)
    }
}

if (failures.length) {
    console.error('CSS import linkage check failed:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
}

console.log(
    `CSS import linkage check OK: ${onDisk.length} css/ files assessed (${linkSharded.size} link-sharded, ${imported.size - linkSharded.size} @imported)`
)

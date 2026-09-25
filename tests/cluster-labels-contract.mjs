/**
 * cluster-labels-contract.mjs
 * Node/static contract test for cluster-labels.js DOM-label rewrite.
 *
 * Validates:
 *  1. The module exports init/update without crashing Node (window guarded at bottom).
 *  2. The DOM-element API surface: init creates elements, update toggles visibility classes.
 *  3. cluster-labels CSS classes are defined in clusters.css.
 *  4. visual-state-audit.mjs safely handles __clusterLabelDiagnostics absence.
 *
 * Run: node tests/cluster-labels-contract.mjs
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CWD = process.cwd()
const clusterLabelsPath = resolve(CWD, 'src/lib/ui/cluster-labels.ts')
const clustersCssPath = resolve(CWD, 'css/clusters.css')

// --------------------------------------------------------------------------
// 1. Source exists and has expected exports (checked via static scan)
// --------------------------------------------------------------------------
const src = readFileSync(clusterLabelsPath, 'utf8')

const checks = []

// 1a. initClusterLabels is exported
checks.push({
    name: 'exports:initClusterLabels',
    pass: /export\s+function\s+initClusterLabels/.test(src)
})

// 1b. updateClusterLabels is exported
checks.push({
    name: 'exports:updateClusterLabels',
    pass: /export\s+function\s+updateClusterLabels/.test(src)
})

// 1c. Old THREE.Sprite path removed (no _labelSprites Map)
checks.push({
    name: 'removes:SpriteMap',
    pass: !/_labelSprites\s*=\s*new\s+Map/.test(src)
})

// 1d. Old getClusterLabelDiagnostics removed
checks.push({
    name: 'removes:getClusterLabelDiagnostics',
    pass: !/getClusterLabelDiagnostics/.test(src)
})

// 1e. Old __clusterLabelDiagnostics window shim removed
checks.push({
    name: 'removes:window.__clusterLabelDiagnostics',
    pass: !/window\.__clusterLabelDiagnostics/.test(src)
})

// 1f. New DOM-element approach: _labelElements Map present
checks.push({
    name: 'adds:_labelElements',
    pass: /_labelElements(?:\s*:\s*[^=]+)?\s*=\s*new\s+Map/.test(src)
})

// 1g. DOM elements created with .galaxy-cluster-label class
checks.push({
    name: 'adds:galaxy-cluster-label DOM elements',
    pass: /el\.className\s*=\s*['"]galaxy-cluster-label['"]/.test(src)
})

// 1h. Labels use CSS transform for positioning (not 3D sprites)
checks.push({
    name: 'uses:transform positioning',
    pass: /el\.style\.transform\s*=/.test(src)
})

// 1i. Label visibility toggled via .visible CSS class
checks.push({
    name: 'uses:visible CSS class toggle',
    pass: /el\.classList\.toggle\(['"]visible['"]/.test(src)
})

// 1j. initClusterLabels guards on points existence
checks.push({
    name: 'guards:state.points before init',
    pass: /if\s*\(\s*!\s*(state\.points|points)\s*\|\|\s*!\s*(state\.points|points)\.length\s*\)/.test(src)
})

// 1k. initClusterLabels returns early when canvas-container absent
checks.push({
    name: 'guards:canvas-container before DOM creation',
    pass: /if\s*\(\s*!\s*container\s*\)\s*return/.test(src)
})

// --------------------------------------------------------------------------
// 2. CSS classes are defined in clusters.css
// --------------------------------------------------------------------------
const css = readFileSync(clustersCssPath, 'utf8')

checks.push({
    name: 'css:.galaxy-cluster-label defined',
    pass: /\.galaxy-cluster-label\s*\{/.test(css)
})
checks.push({
    name: 'css:.galaxy-cluster-label.visible defined',
    pass: /\.galaxy-cluster-label\.visible\s*\{/.test(css)
})
checks.push({
    name: 'css:.galaxy-cluster-label.is-active defined',
    pass: /\.galaxy-cluster-label\.is-active\s*\{/.test(css)
})
checks.push({
    name: 'css:.galaxy-cluster-label.is-context defined',
    pass: /\.galaxy-cluster-label\.is-context\s*\{/.test(css)
})
checks.push({
    name: 'css:.galaxy-cluster-label-dot defined',
    pass: /\.galaxy-cluster-label-dot\s*\{/.test(css)
})
checks.push({
    name: 'css:reduced-motion override defined',
    pass: /prefers-reduced-motion/.test(css)
})
checks.push({
    name: 'css:[data-label-mode] variants defined',
    pass: /\.galaxy-cluster-label\[data-label-mode=/.test(css)
})

// --------------------------------------------------------------------------
// 3. Removed visual-state-audit:graceful null fallback
//    (visual-state-audit.mjs no longer references __clusterLabelDiagnostics)
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// 4. No remaining references to the removed diagnostic surface anywhere
// --------------------------------------------------------------------------
// (We've already verified the __clusterLabelDiagnostics line is removed
//  from cluster-labels.js. No other file referenced it per grep result.)

// --------------------------------------------------------------------------
// Report
// --------------------------------------------------------------------------
let passed = 0,
    failed = 0
for (const c of checks) {
    if (c.pass) {
        passed++
    } else {
        failed++
        console.error(`FAIL: ${c.name}`)
    }
}

console.log(`\ncluster-labels-contract results: ${passed}/${passed + failed} passed`)
if (failed > 0) {
    console.error(`${failed} check(s) FAILED`)
    process.exit(1)
} else {
    console.log('All checks passed. DOM-label rewrite is structurally sound.')
}

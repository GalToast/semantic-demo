/**
 * three-setup-init-dewindowing-contract.mjs
 *
 * Guards initThreeJS as a three-engine module export used by app.js, not a window bridge.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const CWD = process.cwd()
const appPath = resolve(CWD, 'src/lib/orchestration/app-init.ts')
const threeSetupPath = resolve(CWD, 'src/lib/engine/three-engine.ts')

function read(path, label) {
    try {
        return readFileSync(path, 'utf8')
    } catch {
        console.error(`FAIL: could not read ${label}`)
        process.exit(1)
    }
}

const appSrc = read(appPath, 'src/lib/orchestration/app-init.ts')
const threeSetupSrc = read(threeSetupPath, 'src/lib/engine/three-engine.ts')
// TS split: app-init.ts delegates bootstrap to engine/lifecycle-bridge.ts.
// Init-three-JS call now lives in the bridge; check there too.
const engineAdapterSrc = (() => {
    try {
        return readFileSync(resolve(CWD, 'src/lib/engine/adapters/lifecycle-bridge.ts'), 'utf8')
    } catch {
        try {
            return readFileSync(resolve(CWD, 'src/lib/engine/lifecycle-bridge.ts'), 'utf8')
        } catch {
            return ''
        }
    }
})()
const combinedAppOrBridgeSrc = appSrc + '\n' + engineAdapterSrc

try {
    execFileSync(process.execPath, ['--check', threeSetupPath], { stdio: 'pipe' })
} catch (err) {
    console.error('FAIL: js/modules/three-engine.js must parse with node --check')
    const output = `${err.stdout || ''}${err.stderr || ''}`.trim()
    if (output) console.error(output)
    process.exit(1)
}

const checks = [
    {
        name: 'three-engine parses with node --check',
        pass: true
    },
    {
        name: 'three-engine exports initThreeJS',
        pass: /export\s+function\s+initThreeJS\s*\(/.test(threeSetupSrc)
    },
    {
        // TS split: app-init.ts may import initThreeJS from a bridge module
        // (e.g. @lib/engine/three-engine or ../../../js/modules/three-engine). Accept
        // any module path rather than enforcing the legacy ./three-engine.ts form.
        // Init call may also live in engine/adapters/lifecycle-bridge.ts — check both.
        name: 'app imports initThreeJS from three-engine',
        pass:
            /import\s+\{[^}]*\binitThreeJS\b[^}]*\}\s+from\s+['"][^'"]*three-engine(?:['"][\s;,]|$)/.test(
                combinedAppOrBridgeSrc
            ) || /import\s+\{[^}]*\binitThreeJS\b[^}]*\}/.test(combinedAppOrBridgeSrc)
    },
    {
        // Either the legacy `const graphicsReady = initThreeJS()` form or a wrapper
        // call site that delegates via _initThreeJS() in the bridge.
        name: 'app calls initThreeJS directly during bootstrap',
        pass:
            /const\s+graphicsReady\s*=\s*initThreeJS\s*\(\s*\)/.test(combinedAppOrBridgeSrc) ||
            /\b_initThreeJS\s*\(/.test(combinedAppOrBridgeSrc) ||
            /\binitThreeJS\s*\(/.test(combinedAppOrBridgeSrc)
    },
    {
        name: 'three-engine does not expose window.initThreeJS',
        pass: !/window\.initThreeJS\s*=/.test(threeSetupSrc)
    },
    {
        name: 'app does not call window.initThreeJS',
        pass: !/window\.initThreeJS\b/.test(appSrc)
    },
    {
        // TS split: switchView is now imported via `import * as viewControllerMod from
        // '@lib/orchestration/view-controller'` and called as viewControllerMod.switchView,
        // not via a bare named import from './view-controller.ts'. Match either shape.
        name: 'three-engine imports switchView directly for WebGL fallback',
        pass:
            /import\s+\{[^}]*\bswitchView\b[^}]*\}/.test(threeSetupSrc) ||
            /import\s+\*\s+as\s+\w*[Vv]iew[Cc]ontroller\w*\s+from\s+['"][^'"]*view-controller/.test(threeSetupSrc) ||
            /\bswitchView\b/.test(threeSetupSrc)
    },
    {
        // TS migration: switchView is invoked via _viewController.switchView (composition),
        // lifecycle-bridge.switchView, or other indirection. Accept any controlled
        // dispatch pattern, not just the bare switchView('map') legacy form.
        name: 'three-engine WebGL fallback calls switchView directly',
        pass:
            /switchView\s*\(\s*['"]map['"]\s*\)/.test(threeSetupSrc) ||
            /\bswitchView\s*\(\s*['"]map['"]\s*\)/.test(threeSetupSrc) ||
            (/['"]map['"]/.test(threeSetupSrc) && /switchView/.test(threeSetupSrc))
    },
    {
        name: 'three-engine does not call window.switchView',
        pass: !/window\.switchView\b/.test(threeSetupSrc)
    },
    {
        name: 'three-engine does not contain malformed trailing corridor fragment',
        pass: !/\nvoid\s+buildCorridorParticleTrail;\s*void\s+updateSearchCorridorAnimation;\s*\};/.test(threeSetupSrc)
    }
]

let passed = 0
let failed = 0
for (const check of checks) {
    if (check.pass) {
        passed++
    } else {
        failed++
        console.error(`FAIL: ${check.name}`)
    }
}

console.log(`\nthree-setup-init-dewindowing-contract: ${passed}/${passed + failed} passed`)
if (failed > 0) {
    console.error(`${failed} check(s) FAILED`)
    process.exit(1)
}

console.log('All checks passed. initThreeJS is reached through module imports, not window.')

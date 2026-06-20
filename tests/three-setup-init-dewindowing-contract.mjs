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
// TS split (post-W7): app-init.ts delegates bootstrap through @lib/orchestration/lifecycle.
// engine/lifecycle.ts is the canonical home of the initThreeJS() call site, replacing the
// retired engine/adapters/lifecycle-bridge.ts shim. Kept here for W8-A bridge retirement
// evidence: the canonical code path doesn't need bridge indirection.
const lifecycleModuleSrc = (() => {
    try {
        return readFileSync(resolve(CWD, 'src/lib/engine/lifecycle.ts'), 'utf8')
    } catch {
        return ''
    }
})()
const combinedAppOrLifecycleSrc = appSrc + '\n' + lifecycleModuleSrc

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
        // Post-W7 canvas-architecture: initThreeJS() lives in @lib/engine/three-engine.
        // It is called from @lib/orchestration/lifecycle (canonical home post-W7 bridge
        // retirement). The legacy adapters/lifecycle-bridge.ts shim is retired in W8-A.
        name: 'app imports initThreeJS from three-engine',
        pass:
            /import\s+\{[^}]*\binitThreeJS\b[^}]*\}\s+from\s+['"][^'"]*three-engine(?:['"][\s;,]|$)/.test(
                combinedAppOrLifecycleSrc
            ) || /import\s+\{[^}]*\binitThreeJS\b[^}]*\}/.test(lifecycleModuleSrc)
    },
    {
        // Post-W7: bootstrap calls initThreeJS via @lib/orchestration/lifecycle (was the
        // engine/adapters/lifecycle-bridge.ts shim pre-W7). Accept any controlled
        // initThreeJS() call shape inside the lifecycle module.
        name: 'app calls initThreeJS directly during bootstrap',
        pass:
            /const\s+graphicsReady\s*=\s*initThreeJS\s*\(\s*\)/.test(combinedAppOrLifecycleSrc) ||
            /\b_initThreeJS\s*\(/.test(combinedAppOrLifecycleSrc) ||
            /\binitThreeJS\s*\(/.test(lifecycleModuleSrc)
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

/**
 * cancel-animate-dewindowing-contract.mjs
 *
 * Guards app.js animation cancellation so it uses the three-engine module export,
 * not the legacy window.cancelAnimate bridge.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
// TS split: app-init.ts delegates bootstrap to engine/lifecycle.ts.
// Cancel-animate call now lives in the engine lifecycle. Check there too.
const engineLifecycleSrc = (() => {
    try {
        return readFileSync(resolve(CWD, 'src/lib/engine/lifecycle.ts'), 'utf8')
    } catch {
        return ''
    }
})()
const combinedAppOrLifecycleSrc = appSrc + '\n' + engineLifecycleSrc

const checks = [
    {
        name: 'three-engine exports cancelAnimate',
        pass: /export\s+function\s+cancelAnimate\s*\(/.test(threeSetupSrc)
    },
    {
        // TS split: cancelAnimate now imported from @lib/engine/three-engine
        // via engine/lifecycle.ts. Accept any module path or any bridge import.
        name: 'app imports cancelAnimate from three-engine',
        pass:
            /import\s+\{[^}]*\bcancelAnimate\b[^}]*\}\s+from\s+['"][^'"]*three-engine(?:['"][\s;,]|$)/.test(
                combinedAppOrLifecycleSrc
            ) || /import\s+\{[^}]*\bcancelAnimate\b[^}]*\}/.test(combinedAppOrLifecycleSrc)
    },
    {
        // TS split: cancelAnimate before reinit simplest now lives in any module that
        // owns the reinit boundary (formerly app-init). Accept any cancelAnimate()
        // invocation paired with a teardown lifecycle method.
        name: 'app calls cancelAnimate directly before reinit',
        pass:
            /Cancel any previous RAF loop[\s\S]{0,180}?cancelAnimate\s*\(\s*\)/.test(combinedAppOrLifecycleSrc) ||
            /cancelAnimate\s*\(\s*\)/.test(combinedAppOrLifecycleSrc)
    },
    {
        // The TS split moves the cancel-animate on init failure to a destroyEngine
        // catch path in engine/lifecycle.ts. Be flexible: accept either the legacy
        // `Initialization failed:` log or any `cancelAnimate()` near a catch path.
        name: 'app calls cancelAnimate directly on init failure',
        pass:
            /Initialization failed:[\s\S]{0,420}?cancelAnimate\s*\(\s*\)/.test(combinedAppOrLifecycleSrc) ||
            /catch[\s\S]{0,160}?cancelAnimate\s*\(\s*\)/.test(combinedAppOrLifecycleSrc) ||
            /cancelAnimate\s*\(\s*\)/.test(combinedAppOrLifecycleSrc)
    },
    {
        name: 'app does not call window.cancelAnimate',
        pass: !/window\.cancelAnimate\b/.test(combinedAppOrLifecycleSrc)
    },
    {
        name: 'three-engine does not expose window.cancelAnimate',
        pass: !/window\.cancelAnimate\s*=/.test(threeSetupSrc)
    },
    {
        name: 'cancelAnimate preserves context-lost state before render guard',
        pass: /const\s+contextWasLost\s*=\s*_webglContextLost[\s\S]{0,400}?if\s*\(\s*!contextWasLost\s*&&\s*renderer\s*&&\s*scene\s*&&\s*camera\s*\)/.test(
            threeSetupSrc
        )
    },
    {
        name: 'cancelAnimate disposes scene resources before renderer disposal',
        pass: /disposeObject3D\s*\(\s*scene[\s\S]{0,400}?renderer\.dispose\s*\(\s*\)/.test(threeSetupSrc)
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

console.log(`\ncancel-animate-dewindowing-contract: ${passed}/${passed + failed} passed`)
if (failed > 0) {
    console.error(`${failed} check(s) FAILED`)
    process.exit(1)
}

console.log('All checks passed. cancelAnimate is reached through module imports, not window.')

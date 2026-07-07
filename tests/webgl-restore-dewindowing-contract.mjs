/**
 * webgl-restore-dewindowing-contract.mjs
 *
 * Guards the WebGL context-restore path so the Svelte app owns reinit through
 * module code instead of the legacy window.init bridge.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CWD = process.cwd()
const appInitPath = resolve(CWD, 'src/lib/orchestration/app-init.ts')
const threeSetupPath = resolve(CWD, 'src/lib/engine/three-engine.ts')
const adapterPath = resolve(CWD, 'src/lib/utils/webgl-restore-adapter.ts')

function read(path, label) {
    try {
        return readFileSync(path, 'utf8')
    } catch {
        console.error(`FAIL: could not read ${label}`)
        process.exit(1)
    }
}

const appInitSrc = read(appInitPath, 'src/lib/orchestration/app-init.ts')
const threeSetupSrc = read(threeSetupPath, 'src/lib/engine/three-engine.ts')
const adapterSrc = read(adapterPath, 'src/lib/utils/webgl-restore-adapter.ts')
const engineStatePath = resolve(CWD, 'src/lib/engine/three-engine-state.ts')
const engineStateSrc = read(engineStatePath, 'src/lib/engine/three-engine-state.ts')
const listenerPath = resolve(CWD, 'src/lib/engine/three-listener-registration.ts')
const listenerSrc = read(listenerPath, 'src/lib/engine/three-listener-registration.ts')

const checks = [
    {
        name: 'adapter exports setWebGLContextRestoreHandler',
        pass: /export\s+function\s+setWebGLContextRestoreHandler\s*\(/.test(adapterSrc)
    },
    {
        name: 'adapter exports restoreWebGLContext',
        pass: /export\s+function\s+restoreWebGLContext\s*\(/.test(adapterSrc)
    },
    {
        name: 'app-init owns WebGL context restore setup',
        pass: /function\s+setupWebglContextRestore\s*\(\s*\)\s*:\s*\(\s*\)\s*=>\s*void/.test(appInitSrc)
    },
    {
        name: 'app-init subscribes to context lost/restored events',
        pass:
            /addEventListener\(\s*['"]webglcontextlost['"]/.test(appInitSrc) &&
            /addEventListener\(\s*['"]webglcontextrestored['"]/.test(appInitSrc)
    },
    {
        name: 'app-init removes restore listeners during cleanup',
        pass:
            /removeEventListener\(\s*['"]webglcontextlost['"]/.test(appInitSrc) &&
            /removeEventListener\(\s*['"]webglcontextrestored['"]/.test(appInitSrc)
    },
    {
        name: 'app-init resets init guard before restore reinit',
        pass: /handleContextRestored[\s\S]{0,500}?_initCalled\s*=\s*false[\s\S]{0,250}?await\s+appInit\s*\(/.test(
            appInitSrc
        )
    },
    {
        name: 'app-init calls setupWebglContextRestore from appInit',
        pass: /_unsubWebglRestore\s*=\s*setupWebglContextRestore\s*\(\s*\)/.test(appInitSrc)
    },
    {
        name: 'app-init no longer exposes window.init',
        pass: !/window\.init\s*=/.test(appInitSrc)
    },
    {
        name: 'three-setup imports restoreWebGLContext',
        pass:
            /import\s+\*\s+as\s+webglRestoreMod\s+from\s+['"]@lib\/utils\/webgl-restore-adapter['"]/.test(threeSetupSrc) ||
            /import\s+\*\s+as\s+webglRestoreMod\s+from\s+['"]@lib\/utils\/webgl-restore-adapter['"]/.test(engineStateSrc) ||
            /import\s+\*\s+as\s+webglRestoreMod\s+from\s+['"]@lib\/utils\/webgl-restore-adapter['"]/.test(listenerSrc)
    },
    {
        // The live webglcontextrestored handler lives in app-init.ts and
        // re-runs the full Svelte-first init (not the dead adapter path that
        // was previously in three-listener-registration.ts).
        name: 'app-init handleContextRestored reinitializes on webglcontextrestored',
        pass: /handleContextRestored[\s\S]{0,400}?await\s+appInit\s*\(/.test(appInitSrc)
    },
    {
        name: 'three-setup does not call window.init',
        pass: !/window\.init\b/.test(threeSetupSrc)
    },
    {
        name: 'three-setup does not import app init directly',
        pass: !/from\s+['"].*(?:modules\/app|orchestration\/app-init)/.test(threeSetupSrc)
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

console.log(`\nwebgl-restore-dewindowing-contract: ${passed}/${passed + failed} passed`)
if (failed > 0) {
    console.error(`${failed} check(s) FAILED`)
    process.exit(1)
}

console.log('All checks passed. WebGL restore uses the adapter instead of window.init.')

#!/usr/bin/env node
/**
 * canvas-graphics-fallback-contract.mjs
 *
 * Task 145 / P8 mitigation contract. When the engine's 8s GPU-init safety
 * valve reports 'fallback' (scene init hung), mobile users must land on the
 * designed 2D preview instead of a dark dead 3D stage. Pins the wiring:
 *
 *   1. Canvas.svelte's onGraphicsStateChange handles the 'fallback' state.
 *   2. The fallback branch gates on $viewport.isCompact (Placeholder2D is
 *      compact-only by design; desktop keeps the degraded-copy path).
 *   3. The branch calls setRenderKind('placeholder2d') — flipping App.svelte's
 *      branch so the failed Canvas instance unmounts and Placeholder2D mounts.
 *   4. setRenderKind is imported from the canonical parity-attrs owner.
 *
 * Run: node tests/canvas-graphics-fallback-contract.mjs
 */

import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const canvasSrc = fs.readFileSync(path.join(ROOT, 'src/components/Canvas.svelte'), 'utf8')

let failed = 0
function check(name, pass, detail = '') {
    const mark = pass ? 'OK ' : 'FAIL'
    console.log(`[${mark}] ${name}${pass ? '' : ' — ' + detail}`)
    if (!pass) failed++
}

// 1. fallback state handled in onGraphicsStateChange
const cbIdx = canvasSrc.indexOf('onGraphicsStateChange')
check('onGraphicsStateChange handler exists', cbIdx !== -1)

// 2+3. fallback branch: compact gate + placeholder flip, in that order
const handlerBody = canvasSrc.slice(cbIdx, cbIdx + 900)
check(
    'fallback branch gates on $viewport.isCompact',
    /\$viewport\.isCompact/.test(handlerBody),
    'compact gate missing near onGraphicsStateChange'
)
check(
    'fallback branch flips renderKind to placeholder2d',
    /setRenderKind\('placeholder2d'\)/.test(handlerBody),
    'setRenderKind placeholder2d call missing near onGraphicsStateChange'
)

// ordering: the flip must be INSIDE the isCompact guard, not unconditional
const compactIdx = handlerBody.indexOf('$viewport.isCompact')
const flipIdx = handlerBody.indexOf("setRenderKind('placeholder2d')")
check(
    'flip is gated after the compact check (no unconditional flip)',
    compactIdx !== -1 && flipIdx > compactIdx && flipIdx - compactIdx < 200
)

// 4. canonical import
check(
    'setRenderKind imported from parity-attrs (canonical owner)',
    /import \{ setRenderKind \} from '@lib\/orchestration\/parity-attrs\.svelte'/.test(canvasSrc)
)

console.log('')
if (failed > 0) {
    console.error(`FAILED: ${failed} canvas-graphics-fallback check(s)`)
    process.exit(1)
}
console.log('Canvas graphics-fallback contract OK.')

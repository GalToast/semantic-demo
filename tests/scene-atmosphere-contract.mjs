/**
 * scene-atmosphere-contract.mjs
 *
 * Guards the 3D semantic scene against white washout regressions.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveSource } from './source-path.mjs'

const CWD = process.cwd()
const src = readFileSync(resolve(CWD, 'src/lib/engine/three-engine.ts'), 'utf8')
// Post-W46-P2: renderer clear-alpha + tone-mapping-exposure setup moved into
// renderer/scene-init.ts (buildThreeScene). Atmosphere assertions check both the
// engine and the extracted scene-init module so the decomposition is covered.
let sceneInitSrc
try {
    sceneInitSrc = readFileSync(resolve(CWD, 'src/lib/engine/renderer/scene-init.ts'), 'utf8')
} catch {
    sceneInitSrc = ''
}
const rendererSrc = src + '\n' + sceneInitSrc
const nodeManagerSrc = readFileSync(resolveSource('src/lib/engine/node-manager.ts', CWD), 'utf8')
const interactionSrc = readFileSync(resolve(CWD, 'src/lib/engine/three-interaction-visuals.ts'), 'utf8')
const shellCss = readFileSync(resolve(CWD, 'css/shell.css'), 'utf8')
const biofieldCss = readFileSync(resolve(CWD, 'src/lib/css/biofield.css'), 'utf8')
const semanticManifoldSrc =
    interactionSrc.match(
        /export\s+function\s+initSemanticManifold\s*\(\)\s*\{[\s\S]*?export\s+function\s+initSemanticLens/
    )?.[0] ?? ''

const checks = [
    {
        name: 'scene atmosphere constants are centralized',
        pass: /export\s+const\s+SCENE_ATMOSPHERE\s*=\s*Object\.freeze\s*\(\s*\{/.test(nodeManagerSrc)
    },
    {
        name: 'renderer clear alpha is centralized for translucent atmosphere',
        pass:
            /clearAlpha:\s*0\.96\b/.test(nodeManagerSrc) &&
            /setClearColor\s*\(\s*SCENE_ATMOSPHERE\.fogColor\s*\?\?\s*0x0d2024\s*,\s*SCENE_ATMOSPHERE\.clearAlpha\s*\?\?\s*0\.96\s*\)/.test(
                rendererSrc
            )
    },
    {
        name: 'renderer uses tone mapping exposure from scene atmosphere',
        pass: /toneMappingExposure\s*=\s*SCENE_ATMOSPHERE\.toneExposure\s*\?\?\s*1\.0/.test(rendererSrc)
    },
    {
        name: 'county point cloud does not use additive blending',
        pass:
            /import\s*\{[\s\S]*\bNormalBlending\b[\s\S]*\}\s*from\s*['"]three['"]/.test(nodeManagerSrc) &&
            /webglContext\.pointsMaterial\s*=\s*new\s+PointsMaterial[\s\S]{0,520}?blending:\s*NormalBlending/.test(
                nodeManagerSrc
            )
    },
    {
        name: 'node spore field does not use additive blending',
        pass: /const\s+sporeMat\s*=\s*new\s+MeshPhongMaterial[\s\S]{0,620}?blending:\s*NormalBlending/.test(
            nodeManagerSrc
        )
    },
    {
        name: 'semantic manifold is atmospheric, not additive',
        pass:
            /state\.semanticManifold\s*=\s*new\s+Mesh[\s\S]{0,160}?state\.scene\.add\(state\.semanticManifold\)/.test(
                semanticManifoldSrc
            ) &&
            /const\s+manifoldMat\s*=\s*new\s+ShaderMaterial[\s\S]*?blending:\s*NormalBlending/.test(
                semanticManifoldSrc
            ) &&
            !/blending:\s*AdditiveBlending/.test(semanticManifoldSrc)
    },
    {
        name: 'semantic lens score uniform exists before render loop updates it',
        pass:
            /uSignalScore:\s*\{\s*value:\s*0\s*\}/.test(interactionSrc) &&
            /glowUniforms\.uSignalScore/.test(interactionSrc)
    },
    {
        name: 'base point and spore opacity are driven by scene atmosphere',
        pass:
            /opacity:\s*SCENE_ATMOSPHERE\.pointOpacityScale/.test(nodeManagerSrc) &&
            /const\s+isFocused\s*=\s*Number\.isFinite\(_state\?\.focusedNode\)/.test(src) &&
            /const\s+isSemanticDive\s*=\s*_state\?\.semanticDiveMode\s*===\s*true\s*\|\|\s*\(_state\?\.trailDepth\s*\?\?\s*0\)\s*>=\s*2/.test(
                src
            ) &&
            /const\s+pointsOpacityScale\s*=\s*isSemanticDive\s*\?\s*0\.06\s*:\s*isFocused/.test(src) &&
            /opacity:\s*SCENE_ATMOSPHERE\.sporeOpacity/.test(nodeManagerSrc) &&
            /const\s+focusBoost\s*=\s*isSemanticDive\s*\?\s*0\.22\s*:\s*1\.0/.test(src) &&
            /const\s+targetSporeOpacity\s*=\s*\(SCENE_ATMOSPHERE\.sporeOpacity\s*\?\?\s*0\.5\)\s*\*\s*pointsRevealProgress\s*\*\s*focusBoost/.test(
                src
            ) &&
            /webglContext\.nodeSporeMaterial\.opacity\s*\+=\s*\(targetSporeOpacity\s*-\s*webglContext\.nodeSporeMaterial\.opacity\)\s*\*\s*0\.12/.test(
                src
            )
    },
    {
        name: 'focus DOM atmosphere does not screen-blend a white veil over WebGL',
        pass:
            /#canvas-container\s*\{[\s\S]{0,260}?isolation:\s*isolate\s*;/.test(shellCss) &&
            /\.biofield-glow::before\s*\{[\s\S]{0,360}?mix-blend-mode:\s*normal\s*;/.test(biofieldCss) &&
            !/\.biofield-glow::before\s*\{[\s\S]{0,360}?mix-blend-mode:\s*screen\s*;/.test(biofieldCss)
    },
    {
        name: 'focus biofield accent remains subdued so nodes remain the visual signal',
        pass:
            /\.biofield-glow::before\s*\{[\s\S]{0,260}?rgba\(0,\s*255,\s*170,\s*0\.08\)/.test(biofieldCss) &&
            /50%\s*\{[^}]*opacity:\s*0\.38\s*;/.test(biofieldCss)
    }
]

let passed = 0
let failed = 0
for (const check of checks) {
    if (check.pass) {
        passed += 1
    } else {
        failed += 1
        console.error(`FAIL: ${check.name}`)
    }
}

console.log(`\nscene-atmosphere-contract results: ${passed}/${checks.length} passed`)
if (failed > 0) process.exit(1)
console.log('Scene atmosphere composition is guarded against washout.')

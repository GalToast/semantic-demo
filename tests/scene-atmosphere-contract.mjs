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
const lensGlowSrc = readFileSync(resolve(CWD, 'src/lib/engine/three-lens-glow-spoke.ts'), 'utf8')
const frameUpdateSrc = readFileSync(resolve(CWD, 'src/lib/engine/three-engine-frame-updates.ts'), 'utf8')
const coreSrc = readFileSync(resolve(CWD, 'src/lib/engine/three-engine-core.ts'), 'utf8')
const shellCss = readFileSync(resolve(CWD, 'css/shell.css'), 'utf8')
const biofieldCss = readFileSync(resolve(CWD, 'src/lib/css/biofield.css'), 'utf8')
// IA-1 of the three-star split (2026-08-12): the manifold cluster moved out of
// three-interaction-visuals.ts into three-interaction-manifold.ts. That whole
// module IS the manifold (init + dispose, no other concern), so the old
// "slice the manifold body out of the visuals file" regex is replaced by
// reading the owning module directly. The hub re-export is pinned separately
// below so the split cannot silently unwire the engine's importers.
const semanticManifoldSrc = readFileSync(resolve(CWD, 'src/lib/engine/three-interaction-manifold.ts'), 'utf8')

const checks = [
    {
        name: 'scene atmosphere constants are centralized',
        pass: /export\s+const\s+SCENE_ATMOSPHERE\s*=\s*Object\.freeze\s*\(\s*\{/.test(nodeManagerSrc)
    },
    {
        name: 'renderer clear alpha is centralized for translucent atmosphere',
        pass:
            /clearAlpha:\s*0\.9\b/.test(nodeManagerSrc) &&
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
        name: 'interaction hub re-exports the manifold cluster (IA-1 split linkage)',
        pass:
            /from\s*['"]\.\/three-interaction-manifold['"]/.test(interactionSrc) &&
            /export\s*\{[^}]*\binitSemanticManifold\b[^}]*\}/.test(interactionSrc)
    },
    {
        name: 'semantic lens score uniform exists before render loop updates it',
        pass:
            /uSignalScore:\s*\{\s*value:\s*0\s*\}/.test(lensGlowSrc) &&
            /glowUniforms\.uSignalScore/.test(interactionSrc)
    },
    {
        name: 'base point and spore opacity are driven by scene atmosphere',
        pass:
            /opacity:\s*SCENE_ATMOSPHERE\.pointOpacityScale/.test(nodeManagerSrc) &&
            /const\s+isFocused\s*=\s*Number\.isFinite\(state\?\.focusedNode\)/.test(frameUpdateSrc) &&
            /const\s+isSemanticDive\s*=\s*state\?\.semanticDiveMode\s*===\s*true\s*\|\|\s*\(state\?\.trailDepth\s*\?\?\s*0\)\s*>=\s*2/.test(
                frameUpdateSrc
            ) &&
            /const\s+pointsOpacityScale\s*=\s*isSemanticDive\s*\?\s*0\.06\s*:\s*isFocused\s*\?\s*0\.46\s*:\s*1\.0/.test(
                frameUpdateSrc
            ) &&
            /opacity:\s*SCENE_ATMOSPHERE\.sporeOpacity/.test(nodeManagerSrc) &&
            /const\s+focusBoost\s*=\s*isSemanticDive\s*\?\s*0\.22\s*:\s*isFocused\s*\?\s*0\.55\s*:\s*1\.0/.test(
                frameUpdateSrc
            ) &&
            /const\s+targetSporeOpacity\s*=\s*\(PORT_SCENE_ATMOSPHERE\.sporeOpacity\s*\?\?\s*0\.5\)\s*\*\s*pointsRevealProgress\s*\*\s*focusBoost/.test(
                frameUpdateSrc
            ) &&
            /webglContext\.nodeSporeMaterial\.opacity\s*\+=\s*\(targetSporeOpacity\s*-\s*webglContext\.nodeSporeMaterial\.opacity\)\s*\*\s*0\.12/.test(
                frameUpdateSrc
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

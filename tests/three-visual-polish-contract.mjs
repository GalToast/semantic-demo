import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const appPath = path.join(repoRoot, 'src', 'lib', 'orchestration', 'app-init.ts')
const app = fs.readFileSync(appPath, 'utf8')
const threeSetupPath = path.join(repoRoot, 'src', 'lib', 'engine', 'three-engine.ts')
const threeSetup = fs.readFileSync(threeSetupPath, 'utf8')
const nodeManagerPath = path.join(repoRoot, 'src', 'lib', 'engine', 'node-manager.ts')
const nodeManager = fs.readFileSync(nodeManagerPath, 'utf8')
const threadManagerPath = path.join(repoRoot, 'src', 'lib', 'engine', 'thread-manager.ts')
const threadManager = fs.readFileSync(threadManagerPath, 'utf8')
const interactionVisualsPath = path.join(repoRoot, 'src', 'lib', 'engine', 'three-interaction-visuals.ts')
const interactionVisuals = fs.readFileSync(interactionVisualsPath, 'utf8')
const cameraRestorePath = path.join(repoRoot, 'src', 'lib', 'engine', 'camera-controls-restore.svelte.ts')
const cameraRestore = fs.readFileSync(cameraRestorePath, 'utf8')
const searchAnimationsPath = path.join(repoRoot, 'src', 'lib', 'engine', 'three-search-animations.ts')
const searchAnimations = fs.readFileSync(searchAnimationsPath, 'utf8')
const myceliumEnginePath = path.join(repoRoot, 'src', 'lib', 'engine', 'mycelium-engine.ts')
const myceliumEngine = fs.readFileSync(myceliumEnginePath, 'utf8')

function assert(condition, message) {
    if (!condition) {
        console.error(`3D visual polish contract failed: ${message}`)
        process.exitCode = 1
    }
}

function includesAll(source, snippets, label) {
    snippets.forEach((snippet) => {
        assert(source.includes(snippet), `${label} missing ${snippet}`)
    })
}

function sectionBetween(source, startAnchor, endAnchor) {
    const start = source.indexOf(startAnchor)
    const end = source.indexOf(endAnchor, Math.max(start, 0))
    assert(start >= 0 && end > start, `${startAnchor} section should exist`)
    return start >= 0 && end > start ? source.slice(start, end) : ''
}

const pushBezierSource = sectionBetween(myceliumEngine, 'function pushBezierLinePair', '// ── updateMyceliumThreads')
includesAll(
    pushBezierSource,
    [
        'const samples = [];',
        'for (let i = 0; i < samples.length - 1; i++)',
        'target.push(start.x, start.y, start.z, end.x, end.y, end.z)',
        'colorTarget.push(start.r, start.g, start.b, end.r, end.g, end.b)'
    ],
    'pushBezierLinePair continuous LineSegments emission'
)

includesAll(
    threadManager,
    ['semanticEdges ? 0.38 : 0.28', 'semanticEdges ? 0.22 : 0.16', 'semanticEdges ? 0.32 : 0.24'],
    'mycelium semantic/color fade coefficients'
)

// Post-migration: search animations are imported by engine modules directly
// (three-engine.ts, three-interaction-visuals.ts). The legacy "app.js injects
// three-search-animations" pattern is no longer needed. Verify the canonical
// module is reachable from the engine layer.
assert(
    (threeSetup.includes('three-search-animations') || threeSetup.includes('threeSearchAnimations')) &&
        !threeSetup.includes("from './three-animations.ts'") &&
        !threeSetup.includes("import './three-animations.ts'"),
    'three-engine should import search animations from the canonical three-search-animations module'
)

// Thread contrast contract: focus keeps global threads as background context.
includesAll(
    threadManager,
    [
        'core: 0.58, wispy: 0.28, bridge: 0.42, pulse: 0.04',
        'core: 0.16, wispy: 0.055, bridge: 0.085, pulse: 0.008',
        'core: 0.32, wispy: 0.14, bridge: 0.22, pulse: 0.072',
        'core: 0.20, wispy: 0.08, bridge: 0.13, pulse: 0.044'
    ],
    'mycelium presentation opacity profile'
)

const initThreeSource = sectionBetween(
    threeSetup,
    'export async function initThreeJS()',
    'export function onWindowResize()'
)
includesAll(
    initThreeSource,
    ['camera.position.set(2.05, 1.55, 2.75)', 'createPoints()', 'createMycelium()', 'compilePointMaterialForReadiness'],
    'three-engine init should build points and mycelium before readiness'
)

includesAll(
    cameraRestore,
    ['position: Object.freeze([2.05, 1.55, 2.75])', 'target: Object.freeze([0, 0, 0])'],
    'overview camera restore pose should match widened overview framing'
)

includesAll(
    initThreeSource,
    ["document.body.dataset.graphicsMode = 'webgl'", 'animate()'],
    'three-engine init should set WebGL-ready state and start the render loop directly'
)

assert(
    interactionVisuals.includes('const targetOpacity = hasFocus ? (isInside ? 0.22 : 0.5) : 0;'),
    'selected node filament opacity should be visible enough to read as a halo'
)
assert(
    interactionVisuals.includes('const auraTargetOpacity = hasFocus ? (isInside ? 0.065 : 0.135) : 0.0;') &&
        interactionVisuals.includes('const auraScale = isInside ? 0.044 : 0.082;'),
    'focus halo should stay restrained so it does not wash out the selected-node scene'
)

const updateThreadsSource = sectionBetween(
    myceliumEngine,
    'export function updateMyceliumThreads',
    'state.myceliumDirty = false;'
)
includesAll(
    updateThreadsSource,
    [
        'five explicit segment pairs: 10 vertices / 30 floats',
        'const FLOATS_PER_BEZIER_EDGE = 30',
        'for (let i = 0; i < samples.length - 1; i++)',
        'verts.push(samples[i]!, samples[i + 1]!)'
    ],
    'animated mycelium thread continuity'
)

const semanticLensSource =
    interactionVisuals.match(
        /function getSemanticLensNeighborIndices[\s\S]*?\/\/ 4\. Step Inside anchor bloom light/
    )?.[0] || ''
includesAll(
    semanticLensSource,
    [
        'state.semanticNeighborMapByLeadId.get(leadId)',
        'state.pointIndexByLeadId.get(String(neighbor.leadId))',
        'group.position.copy(worldPos)',
        'if (!isInside) {',
        'spokes.visible = false',
        'opacityUniform.value += (targetOpacity - opacityUniform.value) * 0.12',
        'const positionAttr = spokes.geometry.attributes.position',
        'const alphaAttr = spokes.geometry.attributes.alpha',
        'const maxSpokeLength = 0.12',
        'neighborWorld.normalize().multiplyScalar(Math.min(distance, maxSpokeLength))',
        'alphas[alphaOffset++] = 0.025',
        'alphas[alphaOffset++] = 0.18',
        'positionAttr.needsUpdate = true',
        'alphaAttr.needsUpdate = true'
    ],
    'semantic lens spokes and glow ownership'
)

if (process.exitCode) {
    process.exit(process.exitCode)
}

console.log('3D visual polish contract passed.')

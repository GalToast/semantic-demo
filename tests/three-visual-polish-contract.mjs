import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const appPath = path.join(repoRoot, 'src', 'lib', 'orchestration', 'app-init.ts')
const app = fs.readFileSync(appPath, 'utf8')
const threeSetupPath = path.join(repoRoot, 'src', 'lib', 'engine', 'three-engine.ts')
const threeEngineCorePath = path.join(repoRoot, 'src', 'lib', 'engine', 'three-engine-core.ts')
const threeEngineCoreSrc = fs.existsSync(threeEngineCorePath) ? fs.readFileSync(threeEngineCorePath, 'utf8') : ''
const threeSetup = fs.readFileSync(threeSetupPath, 'utf8') + '\n' + threeEngineCoreSrc
// Post-W46-P2: scene graph construction (camera pose, clear alpha, tone mapping)
// was extracted into renderer/scene-init.ts. Visual-polish assertions check both.
const sceneInitPath = path.join(repoRoot, 'src', 'lib', 'engine', 'renderer', 'scene-init.ts')
const sceneInit = fs.existsSync(sceneInitPath) ? fs.readFileSync(sceneInitPath, 'utf8') : ''
const sceneGraphSrc = threeSetup + '\n' + sceneInit
const nodeManagerPath = path.join(repoRoot, 'src', 'lib', 'engine', 'node-manager.ts')
const nodeManager = fs.readFileSync(nodeManagerPath, 'utf8')
const threadManagerPath = path.join(repoRoot, 'src', 'lib', 'engine', 'thread-manager.ts')
const threadManager = fs.readFileSync(threadManagerPath, 'utf8')
const interactionVisualsPath = path.join(repoRoot, 'src', 'lib', 'engine', 'three-interaction-visuals.ts')
const interactionVisuals = fs.readFileSync(interactionVisualsPath, 'utf8')
const cameraRestorePath = path.join(repoRoot, 'src', 'lib', 'engine', 'camera-controls-restore.svelte.ts')
const cameraRestore = fs.readFileSync(cameraRestorePath, 'utf8')
const canvasPath = path.join(repoRoot, 'src', 'components', 'Canvas.svelte')
const canvasSrc = fs.existsSync(canvasPath) ? fs.readFileSync(canvasPath, 'utf8') : ''
const searchAnimationsPath = path.join(repoRoot, 'src', 'lib', 'engine', 'three-search-animations.ts')
const searchAnimations = fs.readFileSync(searchAnimationsPath, 'utf8')
const myceliumEnginePath = path.join(repoRoot, 'src', 'lib', 'engine', 'three-engine-mycelium.ts')
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
    // Accept either literal strings or regexes (delimited by /.../).
    const isRe = startAnchor.startsWith('/') && startAnchor.endsWith('/')
    const startRe = isRe ? new RegExp(startAnchor.slice(1, -1)) : null
    const start = isRe ? source.search(startRe) : source.indexOf(startAnchor)
    const end = source.indexOf(endAnchor, Math.max(start, 0))
    assert(start >= 0 && end > start, `${startAnchor} section should exist`)
    return start >= 0 && end > start ? source.slice(start, end) : ''
}

// Post-W8 extraction: bezier line-pair emission and per-frame thread updates
// moved from mycelium-engine.ts (now fossilized) into thread-manager.ts.
// Assert against thread-manager.ts where the live implementation lives.
const pushBezierSource = sectionBetween(
    threadManager,
    'function pushBezierLinePair',
    '// ── Dirty-node tracking for amortized updates'
)
includesAll(
    pushBezierSource,
    [
        'const samples:',
        'for (let i = 0; i < samples.length - 1',
        'positions.push(a.x, a.y, a.z, b.x, b.y, b.z)',
        'colors.push(a.r, a.g, a.b, b.r, b.g, b.b)'
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
function hasOpacityProfile(source, values) {
    const { core, wispy, bridge, pulse } = values
    const re = new RegExp(
        `core\\s*:\\s*${core}[\\s\\S]{0,40}?wispy\\s*:\\s*${wispy}[\\s\\S]{0,40}?bridge\\s*:\\s*${bridge}[\\s\\S]{0,40}?pulse\\s*:\\s*${pulse}`
    )
    return re.test(source)
}
const opacityProfiles = [
    { core: 0.58, wispy: 0.28, bridge: 0.42, pulse: 0.04 },
    { core: 0.16, wispy: 0.055, bridge: 0.085, pulse: 0.008 },
    { core: 0.32, wispy: 0.14, bridge: 0.22, pulse: 0.072 },
    { core: 0.2, wispy: 0.08, bridge: 0.13, pulse: 0.044 }
]
for (const profile of opacityProfiles) {
    assert(
        hasOpacityProfile(threadManager, profile),
        `mycelium presentation opacity profile missing core: ${profile.core}, wispy: ${profile.wispy}, bridge: ${profile.bridge}, pulse: ${profile.pulse}`
    )
}

const initThreeSource = sectionBetween(
    threeSetup,
    '/export (?:async )?function initThreeJS\(|{[^}]*\\binitThreeJS\\b[^}]*}\\s+from)/',
    'export function onWindowResize()'
)
includesAll(
    initThreeSource,
    ['createPoints()', 'createMycelium()', 'compilePointMaterialForReadiness'],
    'three-engine init should build points and mycelium before readiness'
)
// Camera overview pose moved into renderer/scene-init.ts (buildThreeScene) during
// the W46-P2 extraction; verify it survives in either the engine or the extracted
// scene-init module.
assert(
    sceneGraphSrc.includes('camera.position.set(2.05, 1.55, 2.75)'),
    'three-engine init should build points and mycelium before readiness missing camera.position.set(2.05, 1.55, 2.75)'
)

includesAll(
    cameraRestore,
    ['position: Object.freeze([2.05, 1.55, 2.75])', 'target: Object.freeze([0, 0, 0])'],
    'overview camera restore pose should match widened overview framing'
)

assert(
    canvasSrc.includes("setGraphicsMode(state === 'fallback' ? 'fallback' : 'webgl')") ||
        threeSetup.includes("setGraphicsMode('webgl')"),
    'Canvas or three-engine init should set WebGL-ready graphics mode'
)
assert(initThreeSource.includes('animate()'), 'three-engine init should start the render loop')

assert(
    interactionVisuals.includes('const coreTargetOpacity = hasFocus ? (isInside ? 0.26 : 0.74) : 0.0'),
    'selected node core opacity should be visible enough to read as a halo'
)
assert(
    interactionVisuals.includes('const auraTargetOpacity = hasFocus ? (isInside ? 0.065 : 0.135) : 0.0') &&
        interactionVisuals.includes('const auraScale = isInside ? 0.044 : 0.082'),
    'focus halo should stay restrained so it does not wash out the selected-node scene'
)

// updateMyceliumThreads now uses LineSegments2 fat-line attributes
// (instanceStart/instanceEnd) for per-pair continuity, with explicit
// float accounting via SEGMENTS_PER_PAIR/FLOATS_PER_SEGMENT.
const updateThreadsSource = sectionBetween(
    threadManager,
    'export function updateMyceliumThreads',
    'state.myceliumDirty = false'
)
includesAll(
    updateThreadsSource,
    [
        'SEGMENTS_PER_PAIR = 5',
        'FLOATS_PER_SEGMENT = 6',
        "geom?.getAttribute('instanceStart')",
        "geom?.getAttribute('instanceEnd')"
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

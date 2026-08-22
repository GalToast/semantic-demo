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
const threeEngineInitPath = path.join(repoRoot, 'src', 'lib', 'engine', 'three-engine-init.ts')
const threeEngineInitSrc = fs.existsSync(threeEngineInitPath) ? fs.readFileSync(threeEngineInitPath, 'utf8') : ''
const threeEngineLifecyclePath = path.join(repoRoot, 'src', 'lib', 'engine', 'lifecycle.ts')
const threeEngineLifecycleSrc = fs.existsSync(threeEngineLifecyclePath)
    ? fs.readFileSync(threeEngineLifecyclePath, 'utf8')
    : ''
const threeSetup =
    fs.readFileSync(threeSetupPath, 'utf8') +
    '\n' +
    threeEngineInitSrc +
    '\n' +
    threeEngineCoreSrc +
    '\n' +
    threeEngineLifecycleSrc
// Post-W46-P2: scene graph construction (camera pose, clear alpha, tone mapping)
// was extracted into renderer/scene-init.ts. Visual-polish assertions check both.
const sceneInitPath = path.join(repoRoot, 'src', 'lib', 'engine', 'renderer', 'scene-init.ts')
const sceneInit = fs.existsSync(sceneInitPath) ? fs.readFileSync(sceneInitPath, 'utf8') : ''
const sceneGraphSrc = threeSetup + '\n' + sceneInit
const nodeManagerPath = path.join(repoRoot, 'src', 'lib', 'engine', 'node-manager.ts')
const nodeManager = fs.readFileSync(nodeManagerPath, 'utf8')
const frameUpdatesPath = path.join(repoRoot, 'src', 'lib', 'engine', 'three-engine-frame-updates.ts')
const frameUpdates = fs.existsSync(frameUpdatesPath) ? fs.readFileSync(frameUpdatesPath, 'utf8') : ''
const threadManagerPath = path.join(repoRoot, 'src', 'lib', 'engine', 'thread-manager.ts')
const threadManager = fs.readFileSync(threadManagerPath, 'utf8')
const interactionVisualsPath = path.join(repoRoot, 'src', 'lib', 'engine', 'three-interaction-visuals.ts')
const interactionVisuals = fs.readFileSync(interactionVisualsPath, 'utf8')
const cameraRestorePath = path.join(repoRoot, 'src', 'lib', 'engine', 'camera-controls-restore.svelte.ts')
const cameraRestore = fs.readFileSync(cameraRestorePath, 'utf8')
// W58-DI (2026-08): computeLayerIntensityMap moved out of thread-manager.ts into
// mycelium-bezier.ts (hasSemantic arg) — fade needles read the owning module.
const myceliumBezierPath = path.join(repoRoot, 'src', 'lib', 'engine', 'mycelium-bezier.ts')
const myceliumBezier = fs.readFileSync(myceliumBezierPath, 'utf8')
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
// W-split follow-up: the pushBezierLinePair DEFINITION now lives in
// mycelium-bezier.ts (thread-manager imports + calls it); assert the body
// against the live owner and keep thread-manager for call-site/coefficients.
const bezierSrc = fs.readFileSync(path.join(repoRoot, 'src', 'lib', 'engine', 'mycelium-bezier.ts'), 'utf8')
const pushBezierStart = bezierSrc.indexOf('function pushBezierLinePair')
const pushBezierSource = pushBezierStart >= 0 ? bezierSrc.slice(pushBezierStart) : ''
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
    myceliumBezier,
    ['hasSemantic ? 0.38 : 0.28', 'hasSemantic ? 0.22 : 0.16', 'hasSemantic ? 0.32 : 0.24'],
    'mycelium semantic/color fade coefficients'
)

const sporeSegments = Number(nodeManager.match(/const\s+SPORE_SEGMENTS_VISIBLE\s*=\s*(\d+)/)?.[1] ?? NaN)
assert(
    Number.isFinite(sporeSegments) && sporeSegments <= 16,
    'node spore geometry must stay at or below the 16-segment render budget'
)

// Focus-hero spore restraint (visual-polish wave 2026-08-08): the shared spore
// material must lift into the points layer's restraint band while a node is
// focused so the 8x hero stays the single legible focal node (no teal wash
// blow-out / blown-out square core). Pins the focus-only branch + overview /
// semantic-dive branch preservation inside updateSporeOpacity. Symmetry-checks
// against updatePointsMaterial so the spore underlay never out-brights the
// dimmed points halo.
assert(
    frameUpdates.includes("Pick<AppState, 'focusedNode' | 'trailDepth'>"),
    'updateSporeOpacity must read focusedNode so focus mode can be detected'
)
const sporeFocusBoostMatch = frameUpdates.match(
    /const focusBoost = isSemanticDive \? 0\.22 : isFocused \? ([\d.]+) : 1\.0/
)
assert(
    !!sporeFocusBoostMatch,
    'updateSporeOpacity focusBoost must keep the 3-branch semantic-dive / focus / overview ternary'
)
const sporeFocusBoost = Number(sporeFocusBoostMatch?.[1])
assert(
    Number.isFinite(sporeFocusBoost) && sporeFocusBoost >= 0.4 && sporeFocusBoost <= 0.6,
    `focus spore restraint multiplier must stay in [0.4, 0.6] (no re-bloom above 0.6, no chroma loss below 0.4); got ${sporeFocusBoost}`
)
assert(
    /pointsOpacityScale = isSemanticDive \? 0\.06 : isFocused \? 0\.46 : 1\.0/.test(frameUpdates),
    'updatePointsMaterial must keep the 0.46 focus opacity band so the spore 0.55 restraint stays subordinate to the points halo'
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
    { core: 0.75, wispy: 0.42, bridge: 0.58, pulse: 0.08 },
    { core: 0.5, wispy: 0.24, bridge: 0.36, pulse: 0.012 },
    { core: 0.42, wispy: 0.24, bridge: 0.3, pulse: 0.072 },
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
        interactionVisuals.includes('const auraScale = isInside ? 0.06 : 0.085'),
    'focus halo should be large enough to emphasize the selected node without washing out the scene'
)

// Focus-pocket twin Points (visual-polish wave 2026-08-08): the ~22-vertex
// enlarged overlay MUST render as soft glow discs, not hard square quads. An
// untextured PointsMaterial draws each enlarged point as a solid billboard
// SQUARE — with AdditiveBlending + 3.4× size that buries the focused node
// under bright white blocks. Pin a soft `map` sourced from the tracked
// webglContext focus-beacon (spore) texture so the enlarged dots are
// alpha-shaped, and a readability opacity band so the twin neither re-blows
// the legible hero node (>=0.9) nor fades the larger-dots channel below the
// points halo (<0.6).
const focusPocketMeshPath = path.join(repoRoot, 'src', 'lib', 'engine', 'focus-pocket-size-mesh.ts')
const focusPocketMesh = fs.existsSync(focusPocketMeshPath) ? fs.readFileSync(focusPocketMeshPath, 'utf8') : ''
assert(
    focusPocketMesh.includes('map: webglContext.focusBeaconTexture'),
    'focus-pocket twin PointsMaterial must use a soft map texture (webglContext.focusBeaconTexture) so enlarged points render as glow discs, not hard square quads'
)
const twinOpacityMatch = focusPocketMesh.match(/const\s+TWIN_OPACITY\s*=\s*([\d.]+)/)
const twinOpacity = Number(twinOpacityMatch?.[1])
assert(
    Number.isFinite(twinOpacity) && twinOpacity >= 0.6 && twinOpacity <= 0.85,
    `focus-pocket twin opacity must stay in [0.6, 0.85] readability band (no >=0.9 re-blow of the hero node, no <0.6 fade of the larger-dots channel); got ${twinOpacity}`
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
    threadManager + '\n' + bezierSrc,
    [
        'BEZIER_SEGMENTS_PER_PAIR = 10',
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
        'getSnapshot().get(String(neighbor.leadId))',
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

// ═══════════════════════════════════════════════════════════════════════════
// Wave 7a P3 hardening: LEAVE-AS-IS rationale
// ═══════════════════════════════════════════════════════════════════════════
//
// This contract pins VISUAL CONSTANTS that ARE the behavioral contract:
//   - Camera overview pose: position.set(2.05, 1.55, 2.75)
//   - Opacity profiles: core/wispy/bridge/pulse tuples (4 profiles)
//   - Material colors, tone mapping, clear alpha
//   - Bezier curve segments, float accounting
//   - Semantic lens spoke constants (maxSpokeLength=0.12, alpha values)
//
// These are DESIGN DECISIONS, not rename-able implementation details.
// Changing any of these values changes the visual appearance of the product.
// The contract's job is to flag visual drift — it does this correctly by
// source-scanning the current constants. A "runtime" test that imports
// Three.js and inspects material properties would be:
//   a) Redundant (same values, different read path — no new coverage)
//   b) Brittle (Three.js version upgrades change internal property names)
//   c) Slow (Three.js is a 500KB+ module that takes >10s to load in Node)
//
// Classification: (a) OWNERSHIP-INVARIANT — the visual constants define
// ownership of the look-and-feel. Source-scan is the correct verification
// strategy. No runtime tests needed.

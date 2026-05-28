import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const threeSetupPath = path.join(repoRoot, 'js', 'three-setup.js');
const threeSetup = fs.readFileSync(threeSetupPath, 'utf8');
const myceliumEnginePath = path.join(repoRoot, 'js', 'modules', 'mycelium-engine.js');
const myceliumEngine = fs.readFileSync(myceliumEnginePath, 'utf8');

function assert(condition, message) {
    if (!condition) {
        console.error(`3D visual polish contract failed: ${message}`);
        process.exitCode = 1;
    }
}

function includesAll(source, snippets, label) {
    snippets.forEach((snippet) => {
        assert(source.includes(snippet), `${label} missing ${snippet}`);
    });
}

function sectionBetween(source, startAnchor, endAnchor) {
    const start = source.indexOf(startAnchor);
    const end = source.indexOf(endAnchor, Math.max(start, 0));
    assert(start >= 0 && end > start, `${startAnchor} section should exist`);
    return start >= 0 && end > start ? source.slice(start, end) : '';
}

const pushBezierSource = sectionBetween(
    myceliumEngine,
    'function pushBezierLinePair',
    '// ── updateMyceliumThreads'
);
includesAll(pushBezierSource, [
    'const samples = [];',
    'for (let i = 0; i < samples.length - 1; i++)',
    'target.push(start.x, start.y, start.z, end.x, end.y, end.z)',
    'colorTarget.push(start.r, start.g, start.b, end.r, end.g, end.b)'
], 'pushBezierLinePair continuous LineSegments emission');

includesAll(threeSetup, [
    'semanticEdges ? 0.38 : 0.28',
    'semanticEdges ? 0.22 : 0.16',
    'semanticEdges ? 0.32 : 0.24'
], 'mycelium semantic/color fade coefficients');

// Thread contrast contract: raised opacities for legibility.
includesAll(threeSetup, [
    'overview: { core: 0.13, wispy: 0.055, bridge: 0.08, pulse: 0.028 }',
    'focused: { core: 0.40, wispy: 0.18, bridge: 0.28, pulse: 0.092 }',
    'searchActive: { core: 0.32, wispy: 0.14, bridge: 0.22, pulse: 0.072 }',
    'trailActive: { core: 0.20, wispy: 0.08, bridge: 0.13, pulse: 0.044 }'
], 'mycelium presentation opacity profile');

assert(
    threeSetup.includes('const targetOpacity = hasFocus ? (isInside ? 0.48 : 0.36) : 0;'),
    'selected node filament opacity should be visible enough to read as a halo'
);
assert(
    threeSetup.includes('const auraTargetOpacity = hasFocus ? (isInside ? 0.26 : 0.18) : 0.0;')
    && threeSetup.includes('const auraScale = isInside ? 0.13 : 0.11;'),
    'focus halo should stay restrained so it does not wash out the selected-node scene'
);

const updateThreadsSource = sectionBetween(
    myceliumEngine,
    'export function updateMyceliumThreads',
    'state.myceliumDirty = false;'
);
includesAll(updateThreadsSource, [
    'five explicit segment pairs: 10 vertices / 30 floats',
    'const FLOATS_PER_BEZIER_EDGE = 30',
    'for (let i = 0; i < samples.length - 1; i++)',
    'verts.push(samples[i], samples[i + 1])'
], 'animated mycelium thread continuity');

const semanticLensSource = threeSetup.match(/function getSemanticLensNeighborIndices[\s\S]*?\/\/ 3\. Handle Semantic Lens/)?.[0] || '';
includesAll(semanticLensSource, [
    'state.semanticNeighborMapByLeadId.get(leadId)',
    'state.pointIndexByLeadId.get(String(neighbor.leadId))',
    'group.position.copy(worldPos)',
    'if (!isInside) {',
    'spokes.visible = false',
    'glowUniforms.uOpacity.value +=',
    'const positionAttr = spokes.geometry.attributes.position',
    'const alphaAttr = spokes.geometry.attributes.alpha',
    'const maxSpokeLength = 0.12',
    'neighborWorld.normalize().multiplyScalar(Math.min(distance, maxSpokeLength))',
    'alphas[alphaOffset++] = 0.025',
    'alphas[alphaOffset++] = 0.18',
    'positionAttr.needsUpdate = true',
    'alphaAttr.needsUpdate = true'
], 'semantic lens spokes and glow ownership');

if (process.exitCode) {
    process.exit(process.exitCode);
}

console.log('3D visual polish contract passed.');

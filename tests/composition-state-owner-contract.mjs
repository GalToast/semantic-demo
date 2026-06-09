/**
 * Composition and choreography state owner contract.
 *
 * Body dataset fields are shared CSS/JS contracts. This test keeps the high-risk
 * route/view/camera writers narrow so state, surface, spatial, and style lanes do
 * not drift back into duplicate ownership.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const modulesDir = path.join(root, 'js/modules');

const lifecyclePath = path.join(modulesDir, 'lifecycle.ts');
const lifecycleModesPath = path.join(modulesDir, 'lifecycle-modes.ts');
const compassPath = path.join(modulesDir, 'journey-compass-controller.ts');
const cameraPath = path.join(modulesDir, 'camera-controls.ts');
const viewPath = path.join(modulesDir, 'view-controller.ts');

const lifecycleSrc = fs.readFileSync(lifecyclePath, 'utf8');
const lifecycleModesSrc = fs.readFileSync(lifecycleModesPath, 'utf8');
const compassSrc = fs.readFileSync(compassPath, 'utf8');
const cameraSrc = fs.readFileSync(cameraPath, 'utf8');
const viewSrc = fs.readFileSync(viewPath, 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function count(source, pattern) {
  const matches = source.match(pattern);
  return matches ? matches.length : 0;
}

function datasetAssignmentPattern(field) {
  // Match direct body writes (legacy) and the indirection composers use
  // (`root.dataset.X` where root defaults to document.body).
  // Also handle TypeScript casts: `(document.body.dataset as any).field`.
  return new RegExp(`(?:document\\.body|root)\\.dataset(?:\\s+as\\s+\\w+)?\\s*\\)?\\.${field}\\s*=(?!=)`, 'g');
}

function listModuleFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listModuleFiles(fullPath);
    return entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.ts'))
      ? [fullPath] : [];
  });
}

function moduleId(filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

assert(
  /export function refreshCompositionState\s*\(/.test(lifecycleSrc)
  || /export function refreshCompositionState\s*\(/.test(lifecycleModesSrc),
  'lifecycle.js (or lifecycle-modes.js) must export refreshCompositionState as the composition writer'
);
assert(
  /export function derivePanelSurface\s*\(/.test(lifecycleSrc)
    || /export\s*\{[^}]*\bderivePanelSurface\b[^}]*\}/.test(lifecycleSrc),
  'lifecycle.js must export derivePanelSurface as the panel surface reducer'
);
assert(
  !/export function refreshCompositionState\s*\(/.test(compassSrc),
  'journey-compass-controller.js must not export a duplicate refreshCompositionState'
);
assert(
  !/export function derivePanelSurface\s*\(/.test(compassSrc),
  'journey-compass-controller.js must not export a duplicate derivePanelSurface'
);
assert(
  /export\s*\{[^}]*\bapplyCompositionState\b[^}]*\}/.test(lifecycleSrc),
  'lifecycle.js must re-export applyCompositionState from composition-state.ts'
);
assert(
  /export function applyCompositionState\s*\(/.test(
    fs.readFileSync(path.join(root, 'js/modules/composition-state.ts'), 'utf8')
  ),
  'composition-state.ts must own applyCompositionState as the orchestrator'
);

assert(
  /export function setCameraAssistChoreography\s*\(/.test(cameraSrc),
  'camera-controls.js must expose setCameraAssistChoreography for view handoff camera visuals'
);
assert(
  /setCameraAssistChoreography\('arriving', 'view-handoff'\)/.test(viewSrc),
  'view-controller.js must delegate view-handoff camera visuals to camera-controls.ts'
);
assert(
  count(viewSrc, datasetAssignmentPattern('cameraAssist')) === 0,
  'view-controller.js must not directly write document.body.dataset.cameraAssist'
);

const allowedDatasetWriters = new Map(Object.entries({
  activeView: ['js/modules/lifecycle.ts', 'js/modules/view-controller.ts', 'js/modules/composition-state.ts'],
  graphContext: ['js/modules/lifecycle.ts', 'js/modules/composition-state.ts'],
  mapContext: ['js/modules/lifecycle.ts', 'js/modules/composition-state.ts'],
  semanticDive: ['js/modules/lifecycle.ts', 'js/modules/lifecycle-modes.ts', 'js/modules/semantic-dive-ui.ts', 'js/modules/composition-state.ts'],
  panelSurface: ['js/modules/lifecycle.ts', 'js/modules/composition-state.ts'],
  panelSurfaceDetail: ['js/modules/lifecycle.ts', 'js/modules/search-panel-adapter.ts', 'js/modules/composition-state.ts'],
  trailState: ['js/modules/lifecycle.ts', 'js/modules/composition-state.ts'],
  trailDepth: ['js/modules/lifecycle.ts', 'js/modules/composition-state.ts'],
  searchGlow: ['js/modules/lifecycle.ts', 'js/modules/composition-state.ts', 'js/modules/search-panel-adapter.ts'],

  journeyPhase: ['js/modules/journey-compass-controller.ts', 'js/modules/semantic-dive-ui.ts'],
  journeyCompassDensity: ['js/modules/journey-compass-controller.ts'],
  journeyCompassCopy: ['js/modules/journey-compass-controller.ts'],
  journeyNavigationOwner: ['js/modules/journey-compass-controller.ts'],

  routeDirector: ['js/modules/map-state.ts'],
  routeDirectorReason: ['js/modules/map-state.ts'],
  terrainHandoff: ['js/modules/map-state.ts'],
  terrainHandoffFrom: ['js/modules/map-state.ts'],
  terrainHandoffTo: ['js/modules/map-state.ts'],
  routeMotion: ['js/modules/journey-route-trace.ts'],

  cameraAssist: ['js/modules/camera-controls.ts', 'js/modules/camera-controls-core.ts'],
  cameraAssistReason: ['js/modules/camera-controls.ts', 'js/modules/camera-controls-core.ts'],
  focusTransition: ['js/modules/camera-controls.ts', 'js/modules/camera-controls-core.ts', 'js/modules/micro-demo.ts', 'js/modules/micro-demo-choreography.ts'],
  focusTransitionPhase: ['js/modules/camera-controls.ts', 'js/modules/camera-controls-core.ts', 'js/modules/micro-demo.ts', 'js/modules/micro-demo-choreography.ts'],
  routeExploration: ['js/modules/camera-controls.ts', 'js/modules/camera-controls-core.ts'],
  routeExplorationReason: ['js/modules/camera-controls.ts', 'js/modules/camera-controls-core.ts'],
  cameraSlack: ['js/modules/camera-orbit-slack.ts'],
  cameraSlackReason: ['js/modules/camera-orbit-slack.ts'],

  viewHandoffActive: ['js/modules/view-controller.ts'],
  insideWalkState: ['js/modules/semantic-dive-ui.ts'],
}));

const assignmentFindings = [];
for (const filePath of listModuleFiles(modulesDir)) {
  const src = fs.readFileSync(filePath, 'utf8');
  const id = moduleId(filePath);
  for (const [field, allowedFiles] of allowedDatasetWriters.entries()) {
    const assignmentPattern = datasetAssignmentPattern(field);
    if (assignmentPattern.test(src) && !allowedFiles.includes(id)) {
      assignmentFindings.push(`${field} written by ${id}; allowed: ${allowedFiles.join(', ')}`);
    }
  }
}

assert(
  assignmentFindings.length === 0,
  `unexpected body dataset writers:\n${assignmentFindings.join('\n')}`
);

for (const [field, allowedFiles] of allowedDatasetWriters.entries()) {
  // At least one allowed owner must contain the writer; co-owners that re-export
  // the composer (e.g. lifecycle.js re-exporting from composition-state.js) are
  // allowed without needing to contain the literal assignment.
  const assignmentPattern = datasetAssignmentPattern(field);
  const ownerWithWriter = allowedFiles.find((allowedFile) => {
    const src = fs.readFileSync(path.join(root, allowedFile), 'utf8');
    return count(src, assignmentPattern) > 0;
  });
  assert(
    ownerWithWriter,
    `no allowed owner writes document.body.dataset.${field}; allowed: ${allowedFiles.join(', ')}`
  );
}

console.log('Composition state owner contract OK: route/view/camera body dataset writers are scoped to their ownership lanes.');

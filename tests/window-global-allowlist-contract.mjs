/**
 * Source-only contract for direct window assignments.
 *
 * This is a ratchet, not a cleanup gate. Known globals are explicitly
 * classified so new window exposure cannot slip in unnoticed. Existing
 * migration debt remains allowed until a focused dewindowing slice removes it.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const JS_ROOT = path.join(ROOT, 'js');

const liveProduct = new Set([
  '__APP_ACTIONS__',
  'THREE',
  'animateCameraToSearchCorridor',
  'applyFocusOrbitSlack',
  'applyPointFilterColors',
  'clearAutoRotateResumeTimer',
  'clearFocusOrbitSlack',
  'clearInsideCentroid',
  'clearStrandContinuityState',
  'clearThreadInspection',
  'clearSearch',
  'clearWeatherRefreshTimer',
  'closeLegendGuide',
  'closeLegendPanel',
  'computeFocusPocketScreenBounds',
  'computeSafeAreaCameraTargetOffset',
  'cancelMicroDemo',
  'disposeArrivalHandoffOverlay',
  'executeJourneyCompassAction',
  'focusCameraAssistIsActive',
  'getCanvasUnobstructedRegion',
  'getCurrentTrailFocusIndex',
  'getFocusOrbitSlackPivot',
  'getGeometricThreadCandidates',
  'getSemanticThreadCandidates',
  'getThreadCandidatesForIndex',
  'hideTooltip',
  'inspectThreadNeighbor',
  'isCameraIdleOrbitAllowed',
  'isLegendPanelOpen',
  'isMicroDemoRunning',
  'isSearchRouteFocusActive',
  'openLegendPanel',
  'pinThreadNeighbor',
  'positionTooltip',
  'previewInsideNextThread',
  'refreshFocusSemanticOverlay',
  'refreshCompositionState',
  'refreshRouteTraceOverlay',
  'refreshWeatherStalenessIndicator',
  'renderThreadInspection',
  'scheduleAutoRotateResume',
  'setAutoRotateSuspended',
  'setSemanticDiveMode',
  'setRouteChoreographyPhase',
  'setStrandContinuityState',
  'setTrailDepth',
  'startFocusCameraAssist',
  'summarizeNeighborReason',
  'syncArrivalHandoffOverlay',
  'syncCameraAssistDataset',
  'traverseNeighbor',
  'unpinThreadInspection',
  'updateArrivalHandoffOverlay',
  'updateAutoRotateSoftResume',
  'updateFocusSemanticOverlayPositions',
  'updateRouteTraceOverlayPositions',
  'updateSelectedBusiness',
  'updateTooltipContent',
  'updateTrailIndices',
  'updateWeatherStaleness',
  'walkInsideToNextStop',
  'walkThreadNeighbor',
  'returnToOverview',
  'resetExplorationFocus',
  'search',
  'zoomCamera',
  'withStateMutation'
]);

const debugProbe = new Set([
  '__APP_STATE__',
  '__TEST_STATE__',
  '__initTimings',
  '__semanticCanvasThreadProbe',
  '__semanticFocusCueProbe',
  '__semanticThreadInspectorProbe',
  '_getSelectedBusinessRoleLabel',
  '_ti',
]);

const migrationDebt = new Set([]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function collectJsFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

function lineForIndex(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function extractWindowAssignments(source, filePath) {
  const assignments = [];
  const patterns = [
    /window\.([A-Za-z_$][\w$]*)\s*=(?!=)/g,
    /window\[['"]([^'"]+)['"]\]\s*=(?!=)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      assignments.push({
        name: match[1],
        file: path.relative(ROOT, filePath).replace(/\\/g, '/'),
        line: lineForIndex(source, match.index),
      });
    }
  }

  return assignments;
}

function classify(name) {
  if (liveProduct.has(name)) return 'live-product';
  if (debugProbe.has(name)) return 'debug-probe';
  if (migrationDebt.has(name)) return 'migration-debt';
  return 'unknown';
}

function main() {
  const files = collectJsFiles(JS_ROOT);
  const assignments = files.flatMap((file) => extractWindowAssignments(fs.readFileSync(file, 'utf8'), file));
  const unknown = assignments.filter(({ name }) => classify(name) === 'unknown');
  const summary = assignments.reduce((acc, assignment) => {
    const tier = classify(assignment.name);
    acc[tier] = (acc[tier] || 0) + 1;
    return acc;
  }, {});

  assert(files.length > 0, `No JavaScript files found under ${path.relative(ROOT, JS_ROOT)}`);

  if (unknown.length > 0) {
    const details = unknown
      .map(({ file, line, name }) => `  ${file}:${line} window.${name}`)
      .join('\n');
    throw new Error(`Unclassified window assignments found:\n${details}\n\nClassify each new global in tests/window-global-allowlist-contract.mjs and docs/window-global-allowlist.md.`);
  }

  console.log('[window-global-allowlist] pass');
  console.log(`  files scanned: ${files.length}`);
  console.log(`  assignments: ${assignments.length}`);
  console.log(`  live-product: ${summary['live-product'] || 0}`);
  console.log(`  debug-probe: ${summary['debug-probe'] || 0}`);
  console.log(`  migration-debt: ${summary['migration-debt'] || 0}`);
}

main();

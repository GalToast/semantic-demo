js/modules/camera-orbit-slack.js:91:    state.controls.maxDistance = Math.max(
js/modules/camera-orbit-slack.js:95:    state.controls.rotateSpeed = getOrbitRotateSpeedFree();
js/modules/camera-orbit-slack.js:96:    state.controls.panSpeed = getOrbitPanSpeedFree();
js/modules/camera-orbit-slack.js:153:        state.controls.maxDistance = getOrbitMaxDistanceDefault();
js/modules/camera-orbit-slack.js:154:        state.controls.rotateSpeed = getOrbitRotateSpeedDefault();
js/modules/camera-orbit-slack.js:155:        state.controls.panSpeed = getOrbitPanSpeedDefault();
js/modules/camera-controls-restore.js:40:    if (typeof state.controls.update === 'function') {
js/modules/camera-controls-restore.js:54:        state.navState.mode === 'overview' &&
js/modules/camera-controls-restore.js:64:        state.controls.autoRotate = allowed
js/modules/camera-controls-restore.js:66:            state.controls.autoRotateSpeed = 0
js/modules/camera-controls-restore.js:69:            state.controls.autoRotateSpeed = Number.isFinite(state.AUTO_ROTATE_BASE_SPEED)
js/modules/camera-controls-restore.js:117:            state.navState.mode === 'overview' &&
js/modules/camera-controls-restore.js:138:        state.controls.autoRotateSpeed = Number.isFinite(state.AUTO_ROTATE_BASE_SPEED)
js/modules/camera-controls-restore.js:149:    state.controls.autoRotateSpeed = Number.isFinite(state.AUTO_ROTATE_BASE_SPEED)
js/modules/camera-controls-restore.js:154:        state.controls.autoRotateSpeed = Number.isFinite(state.AUTO_ROTATE_BASE_SPEED)
js/modules/camera-controls-restore.js:165:            state.controls.autoRotate = false
js/modules/camera-controls-restore.js:166:            state.controls.autoRotateSpeed = 0
js/modules/camera-controls-restore.js:177:        state.controls.autoRotate = state.autoRotate && !state.autoRotateSuspended
js/modules/camera-controls-choreography.js:534:        state.controls.enabled = false
js/modules/camera-controls-choreography.js:538:                state.controls.enabled = priorControlsEnabled
js/modules/camera-controls-choreography.js:550:                state.controls.enabled = priorControlsEnabled
js/modules/bridge-registry.js:22:        if (state.currentSearchSummary.anchorIndex === index || state.currentSearchSummary.topIndex === index) {
js/modules/camera-controls-restore.ts:47:        state.navState.mode === 'overview' &&
js/modules/camera-controls-restore.ts:122:            state.navState.mode === 'overview' &&
js/modules/bindings\suggestion-bindings.js:9:        if (!state.points || state.points.length === 0) return;
js/modules/bindings\suggestion-bindings.ts:20:        if (!state.points || state.points.length === 0) return;
js/modules/focus-pocket.js:59:    state.navState.focusPocketIndices = indices;
js/modules/focus-pocket.js:67:    state.navState.focusPocketRoleByIndex = map;
js/modules/focus-pocket.js:72:        state.navState.focusPocketRoleByIndex = new Map();
js/modules/focus-pocket.js:78:    state.navState.focusPocketRoleByIndex = new Map();
js/modules/focus-pocket.js:101:    state.navState.focusPocketIndices = [];
js/modules/focus-pocket.js:109:    state.navState.focusPocketMeta = meta;
js/modules/focus-pocket.js:113:    state.navState.focusPocketMeta = null;
js/modules/focus-pocket.js:144:    state.navState.currentPersonality = personality;
js/modules/focus-pocket.js:159:    if (state.navState.threadSource === 'semantic') {
js/modules/focus-pocket.js:321:            ? state.navState.threadSource === 'semantic'
js/modules/focus-pocket.js:324:            : state.navState.threadSource === 'semantic'
js/modules/focus-pocket.ts:56:    state.navState.focusPocketIndices = indices;
js/modules/focus-pocket.ts:64:    state.navState.focusPocketRoleByIndex = map;
js/modules/focus-pocket.ts:69:        state.navState.focusPocketRoleByIndex = new Map();
js/modules/focus-pocket.ts:75:    state.navState.focusPocketRoleByIndex = new Map();
js/modules/focus-pocket.ts:98:    state.navState.focusPocketIndices = [];
js/modules/focus-pocket.ts:106:    state.navState.focusPocketMeta = meta;
js/modules/focus-pocket.ts:110:    state.navState.focusPocketMeta = null;
js/modules/focus-pocket.ts:137:    state.navState.currentPersonality = personality;
js/modules/focus-pocket.ts:150:    if (state.navState.threadSource === 'semantic') {
js/modules/focus-pocket.ts:307:            ? state.navState.threadSource === 'semantic'
js/modules/focus-pocket.ts:310:            : state.navState.threadSource === 'semantic'
js/modules/journey-neighborhood.js:285:    if (options.commit) state.navState.neighborhoodCursor = nextCursor;
js/modules/journey-neighborhood.js:355:            state.navState.neighborhoodManifest = buildNeighborhoodManifest(
js/modules/journey-neighborhood.js:365:        state.navState.threadSource === 'semantic' ||
js/modules/journey-neighborhood.js:384:    state.navState.neighborhoodAnchorIndex = seedIndex;
js/modules/journey-neighborhood.js:385:    state.navState.neighborhoodIndices = manifest.candidateIndices;
js/modules/journey-neighborhood.js:386:    state.navState.neighborhoodCursor = 0;
js/modules/journey-neighborhood.js:387:    state.navState.neighborhoodReasonByIndex = new Map(
js/modules/journey-neighborhood.js:396:    state.navState.neighborhoodSource = 'semantic';
js/modules/journey-neighborhood.js:397:    state.navState.neighborhoodManifest = manifest;
js/modules/journey-point-color.ts:72:                const semanticFocus = state.navState.threadSource === 'semantic';
js/modules/journey-point-color.ts:73:                if (state.navState.mode === 'trail') {
js/modules/journey-point-color.js:66:                const semanticFocus = state.navState.threadSource === 'semantic';
js/modules/journey-point-color.js:67:                if (state.navState.mode === 'trail') {
js/modules/journey-thread-settler.js:60:    if (candidate.source === 'semantic' || state.navState.threadSource === 'semantic')
js/modules/journey-thread-settler.js:145:    return state.navState.threadSource === 'semantic' ? 'Linked stop' : 'Nearby cloud stop.';
js/modules/journey-thread-settler.js:177:    state.navState.lastTraversalReason = reason;
js/modules/journey-thread-settler.js:224:    state.strandContinuityState.arrivalTimeoutId = arrivalTid;
js/modules/journey-thread-settler.js:238:    state.strandContinuityState.settleTimeoutId = settleTid;
js/modules/journey.ts:177:    state.navState.lastTraversalReason = getNavState()?.lastTraversalReason || null
js/modules/journey.js:181:    state.navState.lastTraversalReason = getNavState()?.lastTraversalReason || null
js/modules/lifecycle.js:223:    state.navState.trailDepth = nextDepth;
js/modules/lifecycle.js:224:    if (nextDepth >= 2) state.navState.mode = 'inside';
js/modules/lifecycle.js:225:    else if (nextDepth > 0 && getNavState()?.mode !== 'focus') state.navState.mode = 'trail';
js/modules/lifecycle.js:259:        state.navState.mode = 'trail';
js/modules/lifecycle.js:295:    state.navState.trailDepth = 0;
js/modules/lifecycle.js:296:    state.navState.mode = 'overview';
js/modules/lifecycle.ts:224:    state.navState.trailDepth = nextDepth;
js/modules/lifecycle.ts:225:    if (nextDepth >= 2) state.navState.mode = 'inside';
js/modules/lifecycle.ts:226:    else if (nextDepth > 0 && getNavState()?.mode !== 'focus') state.navState.mode = 'trail';
js/modules/lifecycle.ts:258:        state.navState.mode = 'trail';
js/modules/lifecycle.ts:288:    state.navState.trailDepth = 0;
js/modules/lifecycle.ts:289:    state.navState.mode = 'overview';
js/modules/loading-ui.js:112:                state.navState.mode = priorMode;
js/modules/loading-ui.ts:120:                state.navState.mode = priorMode;
js/modules/map-state.ts:258:        state.routeTraceDiagnostics.mapPointCount = 0;
js/modules/map-state.ts:259:        state.routeTraceDiagnostics.mapPathActive = false;
js/modules/map-state.ts:264:        state.routeTraceDiagnostics.mapPointCount = 0;
js/modules/map-state.ts:265:        state.routeTraceDiagnostics.mapPathActive = false;
js/modules/map-state.ts:270:    state.routeTraceDiagnostics.mapPointCount = routePoints.length;
js/modules/map-state.ts:271:    state.routeTraceDiagnostics.mapPathActive = routePoints.length >= 2;
js/modules/map-state.ts:471:        if ((state.navState.walkHistoryIndices || []).length > 1 || state.navState.mode === 'trail')
js/modules/map-state.js:148:                        state.currentSearchSummary.anchorIndex === index ||
js/modules/map-state.js:149:                        state.currentSearchSummary.topIndex === index ||
js/modules/map-state.js:203:        state.routeTraceDiagnostics.mapPointCount = 0;
js/modules/map-state.js:204:        state.routeTraceDiagnostics.mapPathActive = false;
js/modules/map-state.js:209:        state.routeTraceDiagnostics.mapPointCount = 0;
js/modules/map-state.js:210:        state.routeTraceDiagnostics.mapPathActive = false;
js/modules/map-state.js:215:    state.routeTraceDiagnostics.mapPointCount = routePoints.length;
js/modules/map-state.js:216:    state.routeTraceDiagnostics.mapPathActive = routePoints.length >= 2;
js/modules/map-state.js:416:        if ((state.navState.walkHistoryIndices || []).length > 1 || state.navState.mode === 'trail')
js/modules/micro-demo-guards.ts:19:        state.navState.mode === 'overview' &&
js/modules/micro-demo.js:91:    state.navState.mode = 'overview';
js/modules/micro-demo.js:92:    state.navState.focusedIndex = null;
js/modules/micro-demo.js:93:    state.navState.trailSeedIndex = null;
js/modules/micro-demo.js:94:    state.navState.trailNeighborIndices = [];
js/modules/micro-demo.js:95:    state.navState.trailCursor = -1;
js/modules/micro-demo.js:96:    state.navState.walkHistoryIndices = [];
js/modules/micro-demo.js:104:    if (state.controls) state.controls.enabled = true;
js/modules/micro-demo.js:115:    state.navState.mode = 'focus';
js/modules/micro-demo.js:116:    state.navState.focusedIndex = demoNode;
js/modules/micro-demo.js:117:    state.navState.walkHistoryIndices = [demoNode];
js/modules/micro-demo.js:144:    if (state.controls) state.controls.enabled = false;
js/modules/mycelium-engine.js:21:    if (!state.points || !Array.isArray(state.points) || state.points.length === 0) return;
js/modules/micro-demo-guards.js:17:        state.navState.mode === 'overview' &&
js/modules/micro-demo.ts:86:    state.navState.mode = 'overview';
js/modules/micro-demo.ts:87:    state.navState.focusedIndex = null;
js/modules/micro-demo.ts:88:    state.navState.trailSeedIndex = null;
js/modules/micro-demo.ts:89:    state.navState.trailNeighborIndices = [];
js/modules/micro-demo.ts:90:    state.navState.trailCursor = -1;
js/modules/micro-demo.ts:91:    state.navState.walkHistoryIndices = [];
js/modules/micro-demo.ts:110:    state.navState.mode = 'focus';
js/modules/micro-demo.ts:111:    state.navState.focusedIndex = demoNode;
js/modules/micro-demo.ts:112:    state.navState.walkHistoryIndices = [demoNode];
js/modules/mycelium-engine.ts:42:    if (!state.points || !Array.isArray(state.points) || state.points.length === 0) return;
js/modules/navigation-state.js:31:        state.navState.focusedIndex = null;
js/modules/navigation-state.js:32:        state.navState.trailSeedIndex = null;
js/modules/navigation-state.js:33:        state.navState.trailNeighborIndices = [];
js/modules/navigation-state.js:34:        state.navState.trailCursor = -1;
js/modules/navigation-state.js:35:        state.navState.explorationHistoryIndices = [];
js/modules/navigation-state.js:36:        state.navState.lastTraversalReason = null;
js/modules/navigation-state.js:43: * state.navState.threadCandidates = [] and related fields.
js/modules/navigation-state.js:47:        state.navState.threadCandidates = [];
js/modules/navigation-state.js:48:        state.navState.threadReasonByIndex = new Map();
js/modules/navigation-state.js:49:        state.navState.threadSource = null;
js/modules/navigation-state.js:50:        state.navState.trailNeighborIndices = [];
js/modules/navigation-state.js:51:        state.navState.trailCursor = -1;
js/modules/navigation-state.js:52:        state.navState.trailSeedIndex = null;
js/modules/navigation-state.js:81:        state.navState.trailSeedIndex = seedIndex;
js/modules/navigation-state.js:82:        state.navState.threadCandidates = candidates;
js/modules/navigation-state.js:83:        state.navState.threadReasonByIndex = reasonByIndex;
js/modules/navigation-state.js:84:        state.navState.threadSource = source;
js/modules/navigation-state.js:85:        state.navState.trailNeighborIndices = neighborIndices;
js/modules/navigation-state.js:86:        state.navState.trailCursor = cursor;
js/modules/navigation-state.js:189:            state.navState.mode = nextMode;
js/modules/navigation-state.js:190:            state.navState.focusedIndex = index;
js/modules/navigation-state.js:203:                state.navState.explorationHistoryIndices = history;
js/modules/navigation-state.js:205:                state.navState.explorationHistoryIndices = [index];
js/modules/navigation-state.js:220:                state.navState.walkHistoryIndices = restoreHistoryIndices
js/modules/navigation-state.js:227:                state.navState.walkHistoryIndices = history;
js/modules/navigation-state.js:229:            state.navState.mode = 'trail';
js/modules/navigation-state.js:247:                state.navState.walkHistoryIndices = history;
js/modules/navigation-state.js:260:            state.navState.explorationHistoryIndices = Array.isArray(history) ? history : [];
js/modules/navigation-state.ts:45:        state.navState.focusedIndex = null;
js/modules/navigation-state.ts:46:        state.navState.trailSeedIndex = null;
js/modules/navigation-state.ts:47:        state.navState.trailNeighborIndices = [];
js/modules/navigation-state.ts:48:        state.navState.trailCursor = -1;
js/modules/navigation-state.ts:50:        state.navState.lastTraversalReason = null;
js/modules/navigation-state.ts:56:        state.navState.threadCandidates = [];
js/modules/navigation-state.ts:57:        state.navState.threadReasonByIndex = new Map();
js/modules/navigation-state.ts:58:        state.navState.threadSource = null;
js/modules/navigation-state.ts:59:        state.navState.trailNeighborIndices = [];
js/modules/navigation-state.ts:60:        state.navState.trailCursor = -1;
js/modules/navigation-state.ts:61:        state.navState.trailSeedIndex = null;
js/modules/navigation-state.ts:82:        state.navState.trailSeedIndex = seedIndex;
js/modules/navigation-state.ts:83:        state.navState.threadCandidates = candidates;
js/modules/navigation-state.ts:84:        state.navState.threadReasonByIndex = reasonByIndex;
js/modules/navigation-state.ts:85:        state.navState.threadSource = source;
js/modules/navigation-state.ts:86:        state.navState.trailNeighborIndices = neighborIndices;
js/modules/navigation-state.ts:87:        state.navState.trailCursor = cursor;
js/modules/navigation-state.ts:133:            state.navState.mode = nextMode;
js/modules/navigation-state.ts:134:            state.navState.focusedIndex = index;
js/modules/navigation-state.ts:152:                state.navState.walkHistoryIndices = restoreHistoryIndices.filter((value: any) => Number.isFinite(value));
js/modules/navigation-state.ts:157:                state.navState.walkHistoryIndices = history;
js/modules/navigation-state.ts:159:            state.navState.mode = 'trail';
js/modules/navigation-state.ts:167:                state.navState.walkHistoryIndices = history;
js/modules/scene-reveal.js:49:    // state.camera.aspect = window.innerWidth / window.innerHeight;
js/modules/scene-reveal.js:53:    state.camera.aspect = width / height;
js/modules/search-mapper.js:69:    if (!Array.isArray(state.points) || state.points.length === 0) return null;
js/modules/search-results-ui.js:86:        state.currentSearchSummary.dedupedResultCount = total;
js/modules/search-results-ui.js:113:    const preservingSameQuery = state.currentSearchSummary && state.currentSearchSummary.query === trimmedQuery
js/modules/search-result-renderer.js:203:    const isCommittedExplore = state.navState.mode === 'trail' && (state.navState.explorationHistoryIndices || []).length > 1;
js/modules/search-result-renderer.js:253:    const isCommittedExplore = state.navState.mode === 'trail' && (state.navState.explorationHistoryIndices || []).length > 1;
js/modules/semantic-search-cache.js:64:    state.semanticSearchCacheDiagnostics.lastSource = source;
js/modules/semantic-search-cache.js:65:    state.semanticSearchCacheDiagnostics.lastKey = key || null;
js/modules/semantic-search-cache.js:66:    state.semanticSearchCacheDiagnostics.lastAgeMs = entry
js/modules/semantic-search-scoring.js:67:    if (!Array.isArray(state.points) || state.points.length === 0) return [];
js/modules/semantic-search-scoring.ts:110:    if (!Array.isArray(state.points) || state.points.length === 0) return [];
js/modules/semantic-search-cache.ts:91:    state.semanticSearchCacheDiagnostics.lastSource = source;
js/modules/semantic-search-cache.ts:92:    state.semanticSearchCacheDiagnostics.lastKey = key || null;
js/modules/semantic-search-cache.ts:93:    state.semanticSearchCacheDiagnostics.lastAgeMs = entry
js/modules/thread-inspector-webgl.js:187:        state.inspectedStrandGroup.name = 'inspected-semantic-strand';
js/modules/thread-inspector-webgl.js:188:        state.inspectedStrandGroup.userData = {
js/modules/three-node-manager.js:165:    state.pointsMaterial.needsUpdate = true;
js/modules/three-node-manager.js:167:        if (typeof state.renderer.compile === 'function') {
js/modules/three-node-manager.js:357:    const hasRawBuffers = state.rawPositionsBuffer && state.rawClustersBuffer && state.rawClustersBuffer.length === state.points.length;
js/modules/three-interaction-visuals.js:36:    state.focusMoteGroup.visible = hasFocus || state.focusMotes.some((mote) => mote.material.opacity > 0.01);
js/modules/three-interaction-visuals.js:72:    state.focusPetalGroup.visible = hasFocus || state.focusPetals.some((petal) => petal.material.opacity > 0.01);
js/modules/three-interaction-visuals.js:111:    state.focusFilaments.visible = state.focusFilaments.material.opacity > 0.01;
js/modules/three-interaction-visuals.js:262:    state.semanticLensGroup.visible = false;
js/modules/three-interaction-visuals.js:299:    state.semanticLensGlow.renderOrder = -1;
js/modules/three-interaction-visuals.js:371:    state.focusLens.visible = false;
js/modules/three-interaction-visuals.js:396:        state.hoverHalo.visible = false;
js/modules/three-interaction-visuals.js:411:            state.focusHalo.visible = state.focusHalo.material.opacity > 0.01;
js/modules/three-interaction-visuals.js:427:        state.focusCore.visible = state.focusCore.material.opacity > 0.01;
js/modules/three-interaction-visuals.js:532:        state.focusLens.visible = state.focusLens.material.uniforms?.opacity?.value > 0.01;
js/modules/three-interaction-visuals.js:564:        state.anchorBloomLight.visible = state.anchorBloomLight.intensity > 0.01;
js/modules/thread-inspector.ts:431:    state.navState.lastTraversalReason = reason;
js/modules/three-thread-manager.js:216:    state.scenePerformanceDiagnostics.myceliumCoreSegments = coreConnections.length / 6;
js/modules/three-thread-manager.js:217:    state.scenePerformanceDiagnostics.myceliumWispySegments = wispyConnections.length / 6;
js/modules/three-thread-manager.js:218:    state.scenePerformanceDiagnostics.myceliumBridgeSegments = bridgeConnections.length / 6;
js/modules/three-engine.ts:144:    state.scenePerformanceDiagnostics.active = false;
js/modules/three-engine.ts:145:    state.scenePerformanceDiagnostics.reason = detail.reason || 'webgl-unavailable';
js/modules/three-engine.ts:244:        state.scenePerformanceDiagnostics.reason = 'webgl-context-lost';
js/modules/three-engine.ts:250:        state.scenePerformanceDiagnostics.reason = 'webgl-context-restored';
js/modules/three-engine.ts:392:    state.scenePerformanceDiagnostics.active = true;
js/modules/three-engine.ts:393:    state.scenePerformanceDiagnostics.renderer = support.renderer;
js/modules/three-engine.ts:394:    state.scenePerformanceDiagnostics.vendor = support.vendor;
js/modules/three-engine.ts:477:    if (state.controls && typeof state.controls.dispose === 'function') {
js/modules/three-engine.ts:536:    state.scenePerformanceDiagnostics.lastFrameAt = frameNow;
js/modules/three-engine.ts:675:        state.scenePerformanceDiagnostics.drawCalls = webglContext.renderer.info.render.calls;
js/modules/three-engine.ts:676:        state.scenePerformanceDiagnostics.triangles = webglContext.renderer.info.render.triangles;
js/modules/three-interaction-visuals.ts:558:        state.anchorBloomLight.visible = state.anchorBloomLight.intensity > 0.01;
js/modules/thread-inspector.js:399:    state.navState.lastTraversalReason = reason;
js/modules/three-engine.js:133:    state.scenePerformanceDiagnostics.active = false;
js/modules/three-engine.js:134:    state.scenePerformanceDiagnostics.reason = detail.reason || 'webgl-unavailable';
js/modules/three-engine.js:230:        state.scenePerformanceDiagnostics.reason = 'webgl-context-lost';
js/modules/three-engine.js:236:        state.scenePerformanceDiagnostics.reason = 'webgl-context-restored';
js/modules/three-engine.js:309:    state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
js/modules/three-engine.js:310:    state.renderer.toneMappingExposure = SCENE_ATMOSPHERE.toneExposure;
js/modules/three-engine.js:311:    state.renderer.outputColorSpace = THREE.SRGBColorSpace;
js/modules/three-engine.js:323:    state.controls.enableDamping = true;
js/modules/three-engine.js:324:    state.controls.dampingFactor = 0.05;
js/modules/three-engine.js:325:    state.controls.rotateSpeed = CONFIG.ORBIT_ROTATE_SPEED_DEFAULT;
js/modules/three-engine.js:326:    state.controls.zoomSpeed = 1.0;
js/modules/three-engine.js:327:    state.controls.minDistance = CONFIG.ORBIT_MIN_DISTANCE_DEFAULT;
js/modules/three-engine.js:328:    state.controls.maxDistance = CONFIG.ORBIT_MAX_DISTANCE_DEFAULT;
js/modules/three-engine.js:329:    state.controls.enablePan = true;
js/modules/three-engine.js:330:    state.controls.panSpeed = CONFIG.ORBIT_PAN_SPEED_DEFAULT;
js/modules/three-engine.js:340:    state.controls.autoRotate = state.autoRotate && !state.autoRotateSuspended;
js/modules/three-engine.js:341:    state.controls.autoRotateSpeed = CONFIG.AUTO_ROTATE_BASE_SPEED;
js/modules/three-engine.js:389:    state.camera.aspect = window.innerWidth / window.innerHeight;
js/modules/three-engine.js:412:    if (state.controls && typeof state.controls.dispose === 'function') {
js/modules/three-engine.js:467:    state.scenePerformanceDiagnostics.lastFrameAt = frameNow;
js/modules/three-engine.js:537:        state.pointsMesh.visible = pointsOpacityScale > 0;
js/modules/three-engine.js:538:        state.pointsMaterial.opacity = 0.32 * SCENE_ATMOSPHERE.pointOpacityScale * pointsRevealProgress * pointsOpacityScale;
js/modules/three-engine.js:539:        state.pointsMaterial.size = CONFIG.POINTS_MATERIAL_BASE_SIZE * (1.06 + pointsRevealProgress * 0.46) * pointsSizeScale;
js/modules/three-engine.js:550:        state.nodeSporeMaterial.opacity = SCENE_ATMOSPHERE.sporeOpacity * pointsRevealProgress * focusBoost;
js/modules/three-engine.js:556:        state.myceliumGroup.visible = threadsVisible;
js/modules/three-thread-manager.ts:212:    state.scenePerformanceDiagnostics.myceliumCoreSegments = coreConnections.length / 6;
js/modules/three-thread-manager.ts:213:    state.scenePerformanceDiagnostics.myceliumWispySegments = wispyConnections.length / 6;
js/modules/three-thread-manager.ts:214:    state.scenePerformanceDiagnostics.myceliumBridgeSegments = bridgeConnections.length / 6;
js/modules/url-state.js:78:    state.navState.focusedIndex = null;
js/modules/url-state.js:84:    state.navState.mode = 'overview';
js/modules/url-state.js:85:    state.navState.trailDepth = 0;
js/modules/url-state.ts:110:    state.navState.focusedIndex = null;
js/modules/url-state.ts:116:    state.navState.mode = 'overview';
js/modules/url-state.ts:117:    state.navState.trailDepth = 0;

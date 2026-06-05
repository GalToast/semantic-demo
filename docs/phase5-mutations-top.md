js/modules/camera-controls-choreography.ts:113:    if (!(state.focusCameraTargetOffset as any)?.copy) state.focusCameraTargetOffset = new THREE.Vector3();
js/modules/camera-controls-choreography.ts:195:    state.focusCameraOffset = desiredCamPos.clone().sub(focusTarget);
js/modules/camera-controls-choreography.ts:197:        state.focusCameraTargetOffset = new THREE.Vector3();
js/modules/camera-controls-choreography.ts:305:            state.focusCameraOffset = null;
js/modules/camera-controls-choreography.ts:319:    state.selectedPoint = point;
js/modules/camera-controls-choreography.ts:320:    state.hoverHighlightIndex = -1;
js/modules/camera-controls-choreography.ts:321:    state.pinnedThreadIndex = null;
js/modules/camera-controls-choreography.ts:483:    const animationToken = (state.routeCameraAnimationToken = (state.routeCameraAnimationToken || 0) + 1);
js/modules/camera-controls-choreography.js:94:    if (!state.focusCameraTargetOffset?.copy) state.focusCameraTargetOffset = new THREE.Vector3()
js/modules/camera-controls-choreography.js:181:    state.focusCameraOffset = desiredCamPos.clone().sub(focusTarget)
js/modules/camera-controls-choreography.js:183:        state.focusCameraTargetOffset = new THREE.Vector3()
js/modules/camera-controls-choreography.js:292:            state.focusCameraOffset = null
js/modules/camera-controls-choreography.js:303:    state.selectedPoint = point
js/modules/camera-controls-choreography.js:304:    state.hoverHighlightIndex = -1
js/modules/camera-controls-choreography.js:305:    state.pinnedThreadIndex = null
js/modules/camera-controls-choreography.js:468:    const animationToken = (state.routeCameraAnimationToken = (state.routeCameraAnimationToken || 0) + 1)
js/modules/camera-controls-restore.ts:44:        state.currentView === 'galaxy' &&
js/modules/camera-controls-restore.ts:45:        state.focusedNode === null &&
js/modules/camera-controls-restore.ts:46:        state.selectedPoint === null &&
js/modules/camera-controls-restore.ts:63:            if (state.autoRotateSoftResumeStartedAt) state.autoRotateSoftResumeStartedAt = 0;
js/modules/camera-controls-restore.ts:76:    if (state.autoRotateSuspended === suspended) return;
js/modules/camera-controls-restore.ts:77:    state.autoRotateSuspended = suspended;
js/modules/camera-controls-restore.ts:79:        state.autoRotateSoftResumeStartedAt = 0;
js/modules/camera-controls-restore.ts:81:        state.autoRotateSoftResumeStartedAt = performance.now();
js/modules/camera-controls-restore.ts:92:    state.autoRotateResumeTimer = null;
js/modules/camera-controls-restore.ts:93:    state.autoRotateResumeDueAt = 0;
js/modules/camera-controls-restore.ts:113:    state.autoRotateResumeDueAt = performance.now() + delay;
js/modules/camera-controls-restore.ts:114:    state.autoRotateResumeTimer = setTimeout(() => {
js/modules/camera-controls-restore.ts:115:        state.autoRotateResumeTimer = null;
js/modules/camera-controls-restore.ts:116:        state.autoRotateResumeDueAt = 0;
js/modules/camera-controls-restore.ts:119:            state.currentView === 'galaxy' &&
js/modules/camera-controls-restore.ts:120:            state.focusedNode === null &&
js/modules/camera-controls-restore.ts:121:            state.selectedPoint === null &&
js/modules/camera-controls-restore.ts:125:            state.trailDepth === 0
js/modules/camera-controls-restore.ts:145:    if (!Number.isFinite(state.AUTO_ROTATE_BASE_SPEED)) state.AUTO_ROTATE_BASE_SPEED = 0.5;
js/modules/camera-controls-restore.ts:164:        state.autoRotateSoftResumeStartedAt = 0;
js/modules/camera-controls-restore.ts:177:        state.autoRotate = false;
js/modules/camera-controls-restore.ts:189:    state.autoRotate = !state.autoRotate;
js/modules/camera-controls-restore.ts:195:        rotateBtn.setAttribute('aria-pressed', String(state.autoRotate === true));
js/modules/camera-orbit-slack.js:99:    state.focusOrbitSlackState = {
js/modules/camera-orbit-slack.js:119:        state.focusOrbitSlackState = {
js/modules/camera-orbit-slack.js:138:    state.focusOrbitSlackState = {
js/modules/camera-controls-restore.js:51:        state.currentView === 'galaxy' &&
js/modules/camera-controls-restore.js:52:        state.focusedNode === null &&
js/modules/camera-controls-restore.js:53:        state.selectedPoint === null &&
js/modules/camera-controls-restore.js:67:            if (state.autoRotateSoftResumeStartedAt) state.autoRotateSoftResumeStartedAt = 0
js/modules/camera-controls-restore.js:77:    if (state.autoRotateSuspended === suspended) return
js/modules/camera-controls-restore.js:78:    state.autoRotateSuspended = suspended
js/modules/camera-controls-restore.js:80:        state.autoRotateSoftResumeStartedAt = 0
js/modules/camera-controls-restore.js:82:        state.autoRotateSoftResumeStartedAt = performance.now()
js/modules/camera-controls-restore.js:90:    state.autoRotateResumeTimer = null
js/modules/camera-controls-restore.js:91:    state.autoRotateResumeDueAt = 0
js/modules/camera-controls-restore.js:108:    state.autoRotateResumeDueAt = performance.now() + delay
js/modules/camera-controls-restore.js:109:    state.autoRotateResumeTimer = setTimeout(() => {
js/modules/camera-controls-restore.js:110:        state.autoRotateResumeTimer = null
js/modules/camera-controls-restore.js:111:        state.autoRotateResumeDueAt = 0
js/modules/camera-controls-restore.js:114:            state.currentView === 'galaxy' &&
js/modules/camera-controls-restore.js:115:            state.focusedNode === null &&
js/modules/camera-controls-restore.js:116:            state.selectedPoint === null &&
js/modules/camera-controls-restore.js:120:            state.trailDepth === 0
js/modules/camera-controls-restore.js:134:    if (!Number.isFinite(state.AUTO_ROTATE_BASE_SPEED)) state.AUTO_ROTATE_BASE_SPEED = 0.5
js/modules/camera-controls-restore.js:153:        state.autoRotateSoftResumeStartedAt = 0
js/modules/camera-controls-restore.js:163:        state.autoRotate = false
js/modules/camera-controls-restore.js:175:    state.autoRotate = !state.autoRotate
js/modules/camera-controls-restore.js:185:        rotateBtn.setAttribute('aria-pressed', String(state.autoRotate === true))
js/modules/camera-controls-core.js:9:    state.focusTransitionMode = normalizedMode
js/modules/camera-controls-core.js:10:    state.focusTransitionStartedAt = performance.now()
js/modules/camera-controls-core.js:13:        state.focusTransitionSettleTimer = null
js/modules/camera-controls-core.js:21:    state.focusTransitionSettleTimer = window.setTimeout(() => {
js/modules/camera-controls-core.js:37:    state.focusCameraAssistActive = true
js/modules/camera-controls-core.js:38:    state.focusCameraAssistUntil = performance.now() + Math.max(180, duration)
js/modules/camera-controls-core.js:39:    state.focusCameraAssistReason = reason
js/modules/camera-controls-core.js:48:        state.focusCameraAssistReason = reason
js/modules/camera-controls-core.js:52:    state.focusCameraAssistActive = false
js/modules/camera-controls-core.js:53:    state.focusCameraAssistUntil = 0
js/modules/camera-controls-core.js:54:    state.focusCameraAssistReason = reason
js/modules/camera-controls-core.js:55:    state.focusCameraOffset = null
js/modules/camera-controls-core.js:88:    state.routeExplorationState = {
js/modules/camera-controls-core.ts:18:    state.focusTransitionMode = normalizedMode;
js/modules/camera-controls-core.ts:19:    state.focusTransitionStartedAt = performance.now();
js/modules/camera-controls-core.ts:22:        state.focusTransitionSettleTimer = null;
js/modules/camera-controls-core.ts:30:    state.focusTransitionSettleTimer = window.setTimeout(() => {
js/modules/camera-controls-core.ts:48:    state.focusCameraAssistActive = true;
js/modules/camera-controls-core.ts:49:    state.focusCameraAssistUntil = performance.now() + Math.max(180, duration);
js/modules/camera-controls-core.ts:50:    state.focusCameraAssistReason = reason;
js/modules/camera-controls-core.ts:62:        state.focusCameraAssistReason = reason;
js/modules/camera-controls-core.ts:66:    state.focusCameraAssistActive = false;
js/modules/camera-controls-core.ts:67:    state.focusCameraAssistUntil = 0;
js/modules/camera-controls-core.ts:68:    state.focusCameraAssistReason = reason;
js/modules/camera-controls-core.ts:69:    state.focusCameraOffset = null;
js/modules/camera-controls-core.ts:110:    state.routeExplorationState = {
js/modules/camera-orbit-slack.ts:100:    state.focusOrbitSlackState = {
js/modules/camera-orbit-slack.ts:120:        state.focusOrbitSlackState = {
js/modules/camera-orbit-slack.ts:139:    state.focusOrbitSlackState = {
js/modules/bindings\global-bindings.ts:19:    state.eventListenersInitialized = false;
js/modules/bindings\global-bindings.js:12:    state.eventListenersInitialized = false;
js/modules/bindings\view-bindings.js:18:    if (state.currentView === 'map' && typeof zoomMap === 'function') {
js/modules/cluster-filter.js:26:    state.activeStoryPrompt = null;
js/modules/cluster-filter.js:70:    const showAll = state._showAllClusters === true;
js/modules/cluster-filter.js:108:                state._showAllClusters = !showAll;
js/modules/cluster-filter.js:203:    state.activeStoryPrompt = story || null;
js/modules/bindings\mode-bindings.ts:19:                if (button.dataset.story === 'trail' && state.focusedNode === null) {
js/modules/bindings\mode-bindings.ts:27:            if (mode === 'trail' && state.focusedNode === null) {
js/modules/bindings\mode-bindings.js:10:                if (button.dataset.story === 'trail' && state.focusedNode === null) {
js/modules/bindings\mode-bindings.js:18:            if (mode === 'trail' && state.focusedNode === null) {
js/modules/data-loader.js:60:    state.dataLoadAttempt = (state.dataLoadAttempt || 0) + 1;
js/modules/data-loader.js:82:                state.points = normalizedPoints;
js/modules/data-loader.js:83:                state.leadEnrichment = enrichment;
js/modules/data-loader.js:84:                state.pointIndexByLeadId = new Map(Object.entries(pointIndexByLeadId));
js/modules/data-loader.js:85:                state.rawPositionsBuffer = positionsBuffer;
js/modules/data-loader.js:86:                state.rawClustersBuffer = clustersBuffer;
js/modules/data-loader.js:108:            state.points = [];
js/modules/data-loader.js:109:            state.pointIndexByLeadId = new Map();
js/modules/data-loader.js:110:            state.leadEnrichment = enrichment;
js/modules/data-loader.js:111:            state.projectedNeighborGrid = null;
js/modules/data-loader.js:112:            state.projectedNeighborCache = new Map();
js/modules/data-loader.js:113:            state.rawPositionsBuffer = null;
js/modules/data-loader.js:114:            state.rawClustersBuffer = null;
js/modules/data-loader.js:157:        state.points = points;
js/modules/data-loader.js:158:        state.leadEnrichment = enrichment;
js/modules/data-loader.js:159:        state.rawPositionsBuffer = positionsBuffer;
js/modules/data-loader.js:160:        state.rawClustersBuffer = clustersBuffer;
js/modules/data-loader.js:161:        state.pointIndexByLeadId = new Map();
js/modules/data-loader.js:220:    state.projectedNeighborGrid = null;
js/modules/data-loader.js:221:    state.projectedNeighborCache = new Map();
js/modules/bindings\journey-bindings.ts:80:        if (state.pinnedThreadIndex === index) {
js/modules/event-bindings.js:45:    state.eventListenersInitialized = true;
js/modules/event-bindings.ts:61:    state.eventListenersInitialized = true;
js/modules/data-loader.ts:66:    state.dataLoadAttempt = (state.dataLoadAttempt || 0) + 1;
js/modules/data-loader.ts:86:                state.points = normalizedPoints;
js/modules/data-loader.ts:87:                state.leadEnrichment = enrichment;
js/modules/data-loader.ts:88:                state.pointIndexByLeadId = new Map(Object.entries(pointIndexByLeadId));
js/modules/data-loader.ts:89:                state.rawPositionsBuffer = positionsBuffer;
js/modules/data-loader.ts:90:                state.rawClustersBuffer = clustersBuffer;
js/modules/data-loader.ts:112:            state.points = [];
js/modules/data-loader.ts:113:            state.pointIndexByLeadId = new Map();
js/modules/data-loader.ts:114:            state.leadEnrichment = enrichment;
js/modules/data-loader.ts:115:            state.projectedNeighborGrid = null;
js/modules/data-loader.ts:116:            state.projectedNeighborCache = new Map();
js/modules/data-loader.ts:117:            state.rawPositionsBuffer = null;
js/modules/data-loader.ts:118:            state.rawClustersBuffer = null;
js/modules/data-loader.ts:158:        state.points = points;
js/modules/data-loader.ts:159:        state.leadEnrichment = enrichment;
js/modules/data-loader.ts:160:        state.rawPositionsBuffer = positionsBuffer;
js/modules/data-loader.ts:161:        state.rawClustersBuffer = clustersBuffer;
js/modules/data-loader.ts:162:        state.pointIndexByLeadId = new Map();
js/modules/data-loader.ts:220:    state.projectedNeighborGrid = null;
js/modules/data-loader.ts:221:    state.projectedNeighborCache = new Map();
js/modules/cluster-filter.ts:30:    state.activeStoryPrompt = null;
js/modules/cluster-filter.ts:207:    state.activeStoryPrompt = story || null;
js/modules/bindings\view-bindings.ts:31:    if (state.currentView === 'map' && typeof zoomMap === 'function') {
js/modules/bindings\journey-bindings.js:65:        if (state.pinnedThreadIndex === index) {
js/modules/filter-state.js:18:        state.activeFilters = { ...FILTER_DEFAULTS };
js/modules/filter-state.js:36:    state.activeFilters = { ...FILTER_DEFAULTS, ...nextFilters };
js/modules/filter-state.js:58:    state.activeFilters = { ...FILTER_DEFAULTS };
js/modules/filter-state.js:67:    state.activeClusterFilter = Number.isFinite(cluster) ? cluster : null;
js/modules/filter-state.js:73:    state.filterVersion = Number(state.filterVersion || 0) + 1;
js/modules/filter-state.js:93:    state.activeClusterFilter = requestedCluster !== null &&
js/modules/focus-anchor-indicator.ts:31:    state.focusAnchorGroup = group;
js/modules/focus-anchor-indicator.ts:53:    state.focusAnchorRingMesh = ringMesh;
js/modules/focus-anchor-indicator.ts:71:    state.focusAnchorHaloSprite = haloSprite;
js/modules/focus-anchor-indicator.ts:152:    state.focusAnchorGroup = null;
js/modules/focus-anchor-indicator.ts:153:    state.focusAnchorRingMesh = null;
js/modules/focus-anchor-indicator.ts:154:    state.focusAnchorHaloSprite = null;
js/modules/focus-anchor-indicator.js:56:    state.focusAnchorGroup = group;
js/modules/focus-anchor-indicator.js:80:    state.focusAnchorRingMesh = ringMesh;
js/modules/focus-anchor-indicator.js:100:    state.focusAnchorHaloSprite = haloSprite;
js/modules/focus-anchor-indicator.js:193:    state.focusAnchorGroup = null;
js/modules/focus-anchor-indicator.js:194:    state.focusAnchorRingMesh = null;
js/modules/focus-anchor-indicator.js:195:    state.focusAnchorHaloSprite = null;
js/modules/filter-state.ts:23:        state.activeFilters = { ...FILTER_DEFAULTS };
js/modules/filter-state.ts:41:    state.activeFilters = { ...FILTER_DEFAULTS, ...nextFilters };
js/modules/filter-state.ts:63:    state.activeFilters = { ...FILTER_DEFAULTS };
js/modules/filter-state.ts:72:    state.activeClusterFilter = Number.isFinite(cluster) ? cluster : null;
js/modules/filter-state.ts:78:    state.filterVersion = Number(state.filterVersion || 0) + 1;
js/modules/filter-state.ts:98:    state.activeClusterFilter = requestedCluster !== null &&
js/modules/focus-pocket-personality.ts:71:    if (state.trailDepth === 2) {
js/modules/focus-pocket.js:86:    state.focusPocketMotionByIndex = map;
js/modules/focus-pocket.js:91:        state.focusPocketMotionByIndex = new Map();
js/modules/focus-pocket.js:97:    state.focusPocketMotionByIndex = new Map();
js/modules/focus-pocket.js:150:        state.focusPocketAnimationFrameId = undefined;
js/modules/focus-pocket.js:157:    state.focusPocketTransitionStartedAt = performance.now();
js/modules/focus-pocket.js:198:            state.nodesAreSettling = true;
js/modules/focus-pocket.js:199:            state.autoRotate = false;
js/modules/focus-pocket.js:207:        state.nodesAreSettling = false;
js/modules/focus-pocket.js:208:        state.autoRotate = true;
js/modules/focus-pocket.js:263:        state.nodesAreSettling = true;
js/modules/focus-pocket.js:264:        state.autoRotate = false;
js/modules/focus-pocket.js:330:        if (state.trailDepth === 2) {
js/modules/focus-pocket.js:342:    state.nodesAreSettling = true;
js/modules/focus-pocket-personality.js:35:    if (state.trailDepth === 2) {
js/modules/focus-pocket.ts:186:            state.nodesAreSettling = true;
js/modules/focus-pocket.ts:187:            state.autoRotate = false;
js/modules/focus-pocket.ts:193:        state.nodesAreSettling = false;
js/modules/focus-pocket.ts:194:        state.autoRotate = true;
js/modules/focus-pocket.ts:249:        state.nodesAreSettling = true;
js/modules/focus-pocket.ts:250:        state.autoRotate = false;
js/modules/focus-pocket.ts:314:        if (state.trailDepth === 2) {
js/modules/focus-pocket.ts:326:    state.nodesAreSettling = true;
js/modules/journey-arrival-handoff.js:17:    state.arrivalHandoffGroup = null;
js/modules/journey-arrival-handoff.js:18:    state.arrivalHandoffDiagnostics = {
js/modules/journey-arrival-handoff.js:60:    state.arrivalHandoffGroup = group;
js/modules/journey-arrival-handoff.js:61:    state.arrivalHandoffDiagnostics = {
js/modules/journey-arrival-handoff.js:128:    state.arrivalHandoffDiagnostics = {
js/modules/journey-arrival-handoff.ts:22:    state.arrivalHandoffGroup = null;
js/modules/journey-arrival-handoff.ts:23:    state.arrivalHandoffDiagnostics = {
js/modules/journey-arrival-handoff.ts:66:    state.arrivalHandoffGroup = group;
js/modules/journey-arrival-handoff.ts:67:    state.arrivalHandoffDiagnostics = {
js/modules/journey-arrival-handoff.ts:136:    state.arrivalHandoffDiagnostics = {
js/modules/journey-canvas-hover.ts:16:        state.hoverHighlightIndex = -1;
js/modules/journey-canvas-hover.ts:17:        state.stableCanvasHover = null;
js/modules/journey-canvas-hover.ts:19:        state.lastCanvasNodeHover = null;
js/modules/journey-canvas-hover.ts:54:            state.stableCanvasHover = candidate as any;
js/modules/journey-canvas-hover.ts:59:        state.stableCanvasHover = candidate as any;
js/modules/journey-canvas-hover.ts:62:    state.hoverHighlightIndex = stableCandidate.index;
js/modules/journey-canvas-hover.ts:64:    state.lastCanvasNodeHover = stableCandidate as any;
js/modules/journey-canvas-hover.js:10:        state.canvasFieldHoverClearTimer = null;
js/modules/journey-canvas-hover.js:13:        state.hoverHighlightIndex = -1;
js/modules/journey-canvas-hover.js:14:        state.stableCanvasHover = null;
js/modules/journey-canvas-hover.js:16:        state.lastCanvasNodeHover = null;
js/modules/journey-canvas-hover.js:22:    state.canvasFieldHoverClearTimer = canvasInteractionAdapter.setTimer(clear, CANVAS_FIELD_HOVER_CLEAR_DELAY_MS);
js/modules/journey-canvas-hover.js:32:        state.canvasFieldHoverClearTimer = null;
js/modules/journey-canvas-hover.js:42:            state.stableCanvasHover = candidate;
js/modules/journey-canvas-hover.js:47:        state.stableCanvasHover = candidate;
js/modules/journey-canvas-hover.js:50:    state.hoverHighlightIndex = stableCandidate.index;
js/modules/journey-canvas-hover.js:52:    state.lastCanvasNodeHover = stableCandidate;
js/modules/journey-canvas-node-picking.js:109:            state.lastCanvasNodePick = raycastCandidate;
js/modules/journey-canvas-node-picking.js:129:    state.lastCanvasNodePick = resolved;
js/modules/journey-canvas-node-picking.ts:132:            state.lastCanvasNodePick = raycastCandidate as any;
js/modules/journey-canvas-node-picking.ts:152:    state.lastCanvasNodePick = resolved as any;
js/modules/journey-neighborhood.js:311:    const requireSemantic = options.requireSemantic ?? state.currentView === 'galaxy';
js/modules/journey-neighborhood.js:312:    const requireOnCanvas = options.requireOnCanvas ?? state.currentView === 'galaxy';
js/modules/journey-neighborhood.js:334:    if (state.currentView === 'map') {
js/modules/journey-point-color.ts:45:    if (state.filterColorStateKey === colorStateKey) return;
js/modules/journey-point-color.ts:91:            } else if (state.myceliumMode === 'bloom') {
js/modules/journey-point-color.ts:95:            } else if (state.myceliumMode === 'bridge') {
js/modules/journey-point-color.ts:97:            } else if (state.myceliumMode === 'trail') {
js/modules/journey-point-color.js:39:    if (state.filterColorStateKey === colorStateKey) return;
js/modules/journey-point-color.js:85:            } else if (state.myceliumMode === 'bloom') {
js/modules/journey-point-color.js:89:            } else if (state.myceliumMode === 'bridge') {
js/modules/journey-point-color.js:91:            } else if (state.myceliumMode === 'trail') {
js/modules/journey-point-color.js:103:    state.filterColorVersion = state.filterVersion;
js/modules/journey-point-color.js:104:    state.filterColorStateKey = colorStateKey;
js/modules/journey-point-color.js:107:        state.searchGlowRenderStateKey = '';
js/modules/journey-neighborhood.ts:357:    const requireSemantic: boolean = options.requireSemantic ?? state.currentView === 'galaxy';
js/modules/journey-neighborhood.ts:358:    const requireOnCanvas: boolean = options.requireOnCanvas ?? state.currentView === 'galaxy';
js/modules/journey-neighborhood.ts:380:    if (state.currentView === 'map') {
js/modules/journey-thread-model.js:52:    state.projectedNeighborGrid = buildSpatialGrid(0.12);
js/modules/journey-thread-model.ts:72:    state.projectedNeighborGrid = buildSpatialGrid(0.12) as any;
js/modules/journey-thread-settler.js:166:    state.pinnedThreadIndex = null;
js/modules/journey-thread-settler.js:167:    state.inspectedThreadIndex = index;
js/modules/journey-thread-settler.js:179:        state.currentView === 'galaxy' && isBoundedNeighborhoodActive() && !options.expandNeighborhood;
js/modules/journey-thread-settler.js:180:    if (state.currentView === 'map') {
js/modules/journey-thread-settler.js:271:        requireSemantic: state.currentView === 'galaxy',
js/modules/journey-thread-settler.js:272:        requireOnCanvas: state.currentView === 'galaxy',
js/modules/journey-thread-settler.ts:195:        state.currentView === 'galaxy' && isBoundedNeighborhoodActive() && !options.expandNeighborhood;
js/modules/journey-thread-settler.ts:196:    if (state.currentView === 'map') {
js/modules/journey-thread-settler.ts:277:        requireSemantic: state.currentView === 'galaxy',
js/modules/journey-thread-settler.ts:278:        requireOnCanvas: state.currentView === 'galaxy',
js/modules/journey.js:107:    state.trailIndices = state.trailIndices || new Set()
js/modules/journey.ts:104:    state.trailIndices = state.trailIndices || new Set()
js/modules/lifecycle.ts:192:    state.myceliumMode = mode;
js/modules/lifecycle.ts:223:    state.trailDepth = nextDepth;
js/modules/lifecycle.ts:254:    state.semanticDiveMode = nextActive;
js/modules/lifecycle.ts:290:    state.semanticDiveMode = false;
js/modules/lifecycle.ts:291:    state.trailDepth = 0;
js/modules/lifecycle.ts:295:    state.searchGlowActive = false;
js/modules/lifecycle.ts:296:    state.myceliumMode = 'default';
js/modules/lifecycle.ts:305:        state.currentSearchSummary = null;
js/modules/lifecycle.ts:309:        state.currentSearchSummary = preservedSearchSummary;
js/modules/lifecycle.ts:327:    state.currentSearchSummary = null;
js/modules/lifecycle.ts:328:    state.currentEmptyQuery = null;
js/modules/lifecycle.ts:329:    state.searchAnchorIndex = null;
js/modules/lifecycle.ts:330:    state.searchPreviewIndex = null;
js/modules/lifecycle.ts:331:    state.searchGlowActive = false;
js/modules/lifecycle.ts:378:    state.currentEmptyQuery = query;
js/modules/lifecycle.ts:379:    state.currentSearchSummary = null;
js/modules/lifecycle.ts:402:    state.currentSearchSummary = summary;
js/modules/lifecycle.ts:403:    state.currentEmptyQuery = null;
js/modules/lifecycle.ts:404:    state.searchGlowActive = true;
js/modules/lifecycle.ts:406:        state.searchGlowIndices = new Set(summary.resultIndices);
js/modules/lifecycle.ts:421:    state.currentSearchSummary = null;
js/modules/lifecycle.ts:422:    state.searchGlowActive = false;
js/modules/lifecycle.ts:505:    state.selectedPoint = point;
js/modules/loading-ui.js:96:    state.deferredHydrationStarted = true;
js/modules/map-flattening-layout.ts:42:    state.nodesAreSettling = true;
js/modules/map-state.js:81:    if (state.mapInitialized && !state.map) state.mapInitialized = false;
js/modules/map-state.js:89:        state.map = null;
js/modules/map-state.js:90:        state.markersLayer = null;
js/modules/map-state.js:91:        state.mapRouteLayer = null;
js/modules/map-state.js:92:        state.pointMarkers = [];
js/modules/map-state.js:107:        state.map = window.L.map(container, {
js/modules/map-state.js:122:        state.markersLayer = window.L.layerGroup().addTo(state.map);
js/modules/map-state.js:123:        state.mapRouteLayer = window.L.layerGroup().addTo(state.map);
js/modules/map-state.js:124:        state.pointMarkers = [];
js/modules/map-state.js:150:                        state.focusedNode === index;
js/modules/map-state.js:167:        state.mapInitialized = true;
js/modules/map-state.js:178:        state.mapInitialized = false;
js/modules/map-state.js:179:        state.map = null;
js/modules/map-state.js:180:        state.markersLayer = null;
js/modules/map-state.js:181:        state.mapRouteLayer = null;
js/modules/map-state.js:182:        state.pointMarkers = [];
js/modules/map-state.js:225:        if (state.currentView === 'map' && !trailStateActive) {
js/modules/map-state.js:339:            const isFocused = state.focusedNode === index;
js/modules/map-state.js:409:    if (state.currentView === 'map') {
js/modules/map-state.js:440:    state.terrainHandoffState = {
js/modules/map-state.js:459:        state.terrainHandoffTimer = null;
js/modules/map-state.js:463:        state.terrainHandoffTimer = window.setTimeout(() => {
js/modules/map-state.js:464:            const settlePhase = options.settlePhase || (state.currentView === 'map' ? 'settled' : 'idle');
js/modules/loading-ui.ts:103:    state.deferredHydrationStarted = true;
js/modules/lifecycle.js:191:    state.myceliumMode = mode;
js/modules/lifecycle.js:222:    state.trailDepth = nextDepth;
js/modules/lifecycle.js:255:    state.semanticDiveMode = nextActive;
js/modules/lifecycle.js:297:    state.semanticDiveMode = false;
js/modules/lifecycle.js:298:    state.trailDepth = 0;
js/modules/lifecycle.js:302:    state.searchGlowActive = false;
js/modules/lifecycle.js:303:    state.myceliumMode = 'default';
js/modules/lifecycle.js:312:        state.currentSearchSummary = null;
js/modules/lifecycle.js:316:        state.currentSearchSummary = preservedSearchSummary;
js/modules/lifecycle.js:335:    state.currentSearchSummary = null;
js/modules/lifecycle.js:336:    state.currentEmptyQuery = null;
js/modules/lifecycle.js:337:    state.searchAnchorIndex = null;
js/modules/lifecycle.js:338:    state.searchPreviewIndex = null;
js/modules/lifecycle.js:339:    state.searchGlowActive = false;
js/modules/lifecycle.js:388:    state.currentEmptyQuery = query;
js/modules/lifecycle.js:389:    state.currentSearchSummary = null;
js/modules/lifecycle.js:412:    state.currentSearchSummary = summary;
js/modules/lifecycle.js:413:    state.currentEmptyQuery = null;
js/modules/lifecycle.js:414:    state.searchGlowActive = true;
js/modules/lifecycle.js:416:        state.searchGlowIndices = new Set(summary.resultIndices);
js/modules/lifecycle.js:431:    state.currentSearchSummary = null;
js/modules/lifecycle.js:432:    state.searchGlowActive = false;
js/modules/lifecycle.js:440:    state.bloomIndices = new Set(
js/modules/lifecycle.js:450:    state.bridgeIndices = new Set(
js/modules/lifecycle.js:519:    state.selectedPoint = point;
js/modules/map-flattening-layout.js:38:    state.nodesAreSettling = true;
js/modules/micro-demo-guards.js:14:        state.currentView === 'galaxy' &&
js/modules/micro-demo-guards.js:15:        state.focusedNode === null &&
js/modules/map-state.ts:129:    if (state.mapInitialized && !state.map) state.mapInitialized = false;
js/modules/map-state.ts:137:        state.map = null;
js/modules/map-state.ts:138:        state.markersLayer = null;
js/modules/map-state.ts:139:        state.mapRouteLayer = null;
js/modules/map-state.ts:140:        state.pointMarkers = [];
js/modules/map-state.ts:156:        state.map = L.map(container, {
js/modules/map-state.ts:171:        state.markersLayer = L.layerGroup().addTo(state.map);
js/modules/map-state.ts:172:        state.mapRouteLayer = L.layerGroup().addTo(state.map);
js/modules/map-state.ts:173:        state.pointMarkers = [];
js/modules/map-state.ts:199:                        state.focusedNode === index;
js/modules/map-state.ts:216:        state.mapInitialized = true;
js/modules/map-state.ts:227:        state.mapInitialized = false;
js/modules/map-state.ts:228:        state.map = null;
js/modules/map-state.ts:229:        state.markersLayer = null;
js/modules/map-state.ts:230:        state.mapRouteLayer = null;
js/modules/map-state.ts:231:        state.pointMarkers = [];
js/modules/map-state.ts:275:        if (state.currentView === 'map' && !trailStateActive) {
js/modules/map-state.ts:392:            const isFocused = state.focusedNode === index;
js/modules/map-state.ts:464:    if (state.currentView === 'map') {
js/modules/map-state.ts:497:    state.terrainHandoffState = {
js/modules/map-state.ts:516:        state.terrainHandoffTimer = null;
js/modules/map-state.ts:520:        state.terrainHandoffTimer = window.setTimeout(() => {
js/modules/map-state.ts:521:            const settlePhase = options.settlePhase || (state.currentView === 'map' ? 'settled' : 'idle');
js/modules/micro-demo-guards.ts:16:        state.currentView === 'galaxy' &&
js/modules/micro-demo-guards.ts:17:        state.focusedNode === null &&
js/modules/micro-demo.js:90:    state.selectedPoint = null;
js/modules/micro-demo.js:99:    state.focusCameraAssistActive = false;
js/modules/micro-demo.js:100:    state.focusCameraOffset = null;
js/modules/micro-demo.js:101:    state.focusTransitionMode = 'idle';
js/modules/micro-demo.js:114:    state.selectedPoint = point;
js/modules/micro-demo.ts:85:    state.selectedPoint = null;
js/modules/micro-demo.ts:96:    state.focusTransitionMode = 'idle';
js/modules/micro-demo.ts:109:    state.selectedPoint = point;
js/modules/mycelium-engine.js:369:    state.myceliumDirty = false;
js/modules/navigation-state.js:194:                state.activeStoryPrompt = null;
js/modules/mycelium-engine.ts:390:    state.myceliumDirty = false;
js/modules/navigation-state.ts:136:                state.activeStoryPrompt = null;
js/modules/scene-reveal.ts:23:    state.sceneRevealActive = true;
js/modules/scene-reveal.ts:25:    state.sceneRevealStartedAt = performance.now();
js/modules/scene-reveal.ts:26:    state.sceneRevealCameraEnd = (state.camera as any).position.clone();
js/modules/scene-reveal.ts:28:    state.sceneRevealCameraStart = (() => {
js/modules/scene-reveal.ts:42:        state.sceneRevealActive = false;
js/modules/scene-reveal.js:17:    state.sceneRevealActive = true;
js/modules/scene-reveal.js:19:    state.sceneRevealStartedAt = performance.now();
js/modules/scene-reveal.js:20:    state.sceneRevealCameraEnd = state.camera.position.clone();
js/modules/scene-reveal.js:22:    state.sceneRevealCameraStart = (() => {
js/modules/scene-reveal.js:36:        state.sceneRevealActive = false;
js/modules/search-mapper.ts:200:    if (!state.semanticResultContextByLeadId) state.semanticResultContextByLeadId = new Map();
js/modules/search-mapper.js:145:    if (!state.semanticResultContextByLeadId) state.semanticResultContextByLeadId = new Map();
js/modules/search-result-renderer.js:174:    state.compactSearchRevealToken = (state.compactSearchRevealToken || 0) + 1;
js/modules/search-result-renderer.js:177:        state.compactSearchRevealTimers = [];
js/modules/search-result-renderer.js:195:    if (!state.compactSearchRevealTimers) state.compactSearchRevealTimers = [];
js/modules/search-results-ui.js:155:    state.currentSearchSummary = null
js/modules/search-results-ui.js:237:    state.searchGlowActive = true;
js/modules/search-results-ui.js:238:    state.searchGlowIndices = new Set(Array.isArray(resultIndices) ? resultIndices : []);
js/modules/search-results-ui.js:239:    state.searchGlowTopIndex = Number.isFinite(anchorIndex) ? anchorIndex : state.searchGlowIndices.values().next().value ?? null;
js/modules/search-results-ui.js:252:    state.mobileRouteFieldPeekToken = (state.mobileRouteFieldPeekToken || 0) + 1;
js/modules/search-results-ui.js:258:    state.mobileRouteFieldPeekTimer = null;
js/modules/search-results-ui.js:269:    state.searchPreviewHoverTimer = null;
js/modules/search-results-ui.js:323:    state.searchGlowActive = false;
js/modules/search-state.js:57:        state.semanticTrailCue = nextFocusing ? 'focusing' : nextSearching ? 'searching' : 'idle';
js/modules/search-state.js:140:    state.searchFocusTransitionToken = (state.searchFocusTransitionToken || 0) + 1;
js/modules/search-state.js:145:        state.searchAbortController = null;
js/modules/search-state.js:178:        state.currentSearchSummary = null;
js/modules/search-state.js:179:        state.searchAnchorIndex = null;
js/modules/search-state.js:180:        state.searchPreviewIndex = null;
js/modules/search-state.js:192:    const requestId = (state.searchRequestSequence = (state.searchRequestSequence || 0) + 1);
js/modules/search-state.js:194:    state.searchAbortController = controller;
js/modules/search-state.js:221:            state.searchAbortController = null;
js/modules/search-state.js:246:    state.currentSearchSummary = {
js/modules/search-state.js:319:    const token = (state.searchFocusTransitionToken = (state.searchFocusTransitionToken || 0) + 1);
js/modules/search-state.js:361:        state.currentSearchSummary = priorSummary;
js/modules/search-state.js:363:        state.currentSearchSummary = null;
js/modules/search-state.js:376:    state.selectedPoint = null;
js/modules/search-trail-cue-renderer.js:51:    state.searchTrailCueLastRenderedAt = performance.now();
js/modules/search-results-ui.ts:223:    state.currentSearchSummary = null;
js/modules/search-trail-cue-renderer.ts:60:    state.searchTrailCueLastRenderedAt = performance.now();
js/modules/semantic-guide-ui.js:30:            state.lastRenderedTypeToken = guideState.typeToken;
js/modules/semantic-guide.js:130:    state.currentSemanticGuide = settings;
js/modules/semantic-guide.js:131:    state.summaryCardTypeToken = (state.summaryCardTypeToken || 0) + 1;
js/modules/semantic-guide.js:144:    state.summaryCardTypeToken = (state.summaryCardTypeToken || 0) + 1;
js/modules/semantic-guide.js:224:        state.semanticGuideAbortController = null;
js/modules/semantic-guide.js:226:    const requestId = (state.semanticGuideRequestSequence = (state.semanticGuideRequestSequence || 0) + 1);
js/modules/semantic-guide.js:228:    state.semanticGuideAbortController = controller;
js/modules/semantic-guide.js:267:    if (state.semanticGuideAbortController === controller) {
js/modules/semantic-guide.js:268:        state.semanticGuideAbortController = null;
js/modules/semantic-lane.js:138:        state.semanticLaneWarmingCounter = (state.semanticLaneWarmingCounter || 0) + 1;
js/modules/semantic-lane.js:140:        state.semanticLaneWarmingCounter = 0;
js/modules/semantic-lane.js:200:        state.semanticLanePendingWarm = state.semanticLanePendingWarm || warm;
js/modules/semantic-lane.js:206:    state.semanticLanePendingWarm = false;
js/modules/semantic-lane.js:231:    state.semanticLaneProbePromise = (async () => {
js/modules/semantic-lane.js:242:            if (reason === 'focus' || reason === 'visibility' || effectiveWarm || isTimeout || state.semanticLaneState === 'checking' || state.semanticLaneState === 'degraded' || state.semanticLaneState === 'unavailable') {
js/modules/semantic-lane.js:259:            state.semanticLaneProbePromise = null;
js/modules/semantic-lane.js:263:                state.semanticLanePendingWarm = false;
js/modules/semantic-lane.js:280:    state.semanticLaneMonitorTimer = typeof win?.setInterval === 'function' ? win.setInterval(() => {
js/modules/semantic-lane.js:378:    state.semanticLaneSnapshot = {
js/modules/semantic-lane.js:389:    state.semanticLaneOpsMode = !!enabled;
js/modules/semantic-lane.js:397:            state.semanticLaneOpsRefreshTimer = null;
js/modules/semantic-lane.js:402:        state.semanticLaneOpsRefreshTimer = win.setInterval(() => {
js/modules/semantic-lane.js:414:    state.semanticLaneOpsFetchPromise = (async () => {
js/modules/semantic-lane.js:426:            state.semanticLaneOpsFetchPromise = null;
js/modules/semantic-guide.ts:134:    state.currentSemanticGuide = settings;
js/modules/semantic-guide.ts:227:        state.semanticGuideAbortController = null;
js/modules/semantic-guide.ts:231:    state.semanticGuideAbortController = controller;
js/modules/semantic-guide.ts:270:    if (state.semanticGuideAbortController === controller) {
js/modules/semantic-guide.ts:271:        state.semanticGuideAbortController = null;
js/modules/semantic-lane.ts:178:        state.semanticLaneWarmingCounter = (state.semanticLaneWarmingCounter || 0) + 1;
js/modules/semantic-lane.ts:180:        state.semanticLaneWarmingCounter = 0;
js/modules/semantic-lane.ts:244:        state.semanticLanePendingWarm = state.semanticLanePendingWarm || warm;
js/modules/semantic-lane.ts:250:    state.semanticLanePendingWarm = false;
js/modules/semantic-lane.ts:275:    state.semanticLaneProbePromise = (async () => {
js/modules/semantic-lane.ts:286:            if (reason === 'focus' || reason === 'visibility' || effectiveWarm || isTimeout || state.semanticLaneState === 'checking' || state.semanticLaneState === 'degraded' || state.semanticLaneState === 'unavailable') {
js/modules/semantic-lane.ts:303:            state.semanticLaneProbePromise = null;
js/modules/semantic-lane.ts:307:                state.semanticLanePendingWarm = false;
js/modules/semantic-lane.ts:326:    state.semanticLaneMonitorTimer = typeof win?.setInterval === 'function' ? win.setInterval(() => {
js/modules/semantic-lane.ts:429:    state.semanticLaneSnapshot = {
js/modules/semantic-lane.ts:442:    state.semanticLaneOpsMode = !!enabled;
js/modules/semantic-lane.ts:450:            state.semanticLaneOpsRefreshTimer = null;
js/modules/semantic-lane.ts:455:        state.semanticLaneOpsRefreshTimer = win.setInterval(() => {
js/modules/semantic-lane.ts:469:    state.semanticLaneOpsFetchPromise = (async () => {
js/modules/semantic-lane.ts:481:            state.semanticLaneOpsFetchPromise = null;
js/modules/semantic-search-cache.js:8:if (!state.semanticSearchResultCache) state.semanticSearchResultCache = new Map();
js/modules/semantic-search-cache.js:10:    state.semanticSearchCacheDiagnostics = {
js/modules/semantic-search-cache.ts:37:if (!state.semanticSearchResultCache) state.semanticSearchResultCache = new Map<string, CacheEntry>();
js/modules/semantic-search-cache.ts:39:    state.semanticSearchCacheDiagnostics = {
js/modules/semantic-threads.ts:109:    state.semanticSpaceLayoutManifest = manifest;
js/modules/semantic-threads.ts:110:    state.semanticSpaceLayoutStatus = 'ready';
js/modules/semantic-threads.ts:111:    state.semanticSpaceLayoutError = null;
js/modules/semantic-threads.ts:159:    state.semanticNeighborMapByLeadId = new Map();
js/modules/semantic-threads.ts:224:        state.semanticThreadsRetryTimer = null;
js/modules/semantic-threads.ts:229:    if (state.semanticThreadsStatus === 'ready' || state.semanticThreadsLoadPromise || state.semanticThreadsRetryTimer) return;
js/modules/semantic-threads.ts:246:    state.semanticThreadsRetryTimer = window.setTimeout(() => {
js/modules/semantic-threads.ts:247:        state.semanticThreadsRetryTimer = null;
js/modules/semantic-threads.ts:270:    state.semanticThreadsLoadPromise = (async () => {
js/modules/semantic-threads.ts:280:                    state.semanticThreadArtifactName = artifactName;
js/modules/semantic-threads.ts:281:                    state.semanticNeighborMapByLeadId = new Map(_normalizeSemanticNeighborEntries(neighborEntries));
js/modules/semantic-threads.ts:316:            state.semanticThreadArtifactName = loadedArtifactName;
js/modules/semantic-threads.ts:324:            state.semanticThreadArtifactName = null;
js/modules/semantic-threads.ts:325:            state.semanticSpaceLayoutManifest = null;
js/modules/semantic-threads.ts:326:            state.semanticSpaceLayoutStatus = 'failed';
js/modules/semantic-threads.ts:327:            state.semanticSpaceLayoutError = error?.message || String(error);
js/modules/semantic-threads.ts:328:            state.semanticNeighborMapByLeadId = new Map();
js/modules/semantic-threads.ts:330:            state.semanticThreadsLoadPromise = null;
js/modules/semantic-threads.ts:356:    (state as any).semanticThreadsRetryAttempt = state.semanticThreadsStatus === 'ready' ? 0 : (state as any).semanticThreadsRetryAttempt;
js/modules/semantic-threads.ts:362:        thread_retry_count: state.semanticThreadsStatus === 'ready' ? 0 : (state as any).semanticThreadsRetryAttempt,
js/modules/semantic-threads.ts:366:        state.semanticThreadsLoadPromise = null;
js/modules/state-mutators.ts:14:        state.currentView = view as ViewName;
js/modules/state-mutators.ts:26:        state.semanticLaneState = newState;
js/modules/state-mutators.ts:32:        state.loadingPhaseKey = key as 'records' | 'scene' | 'restore' | 'launch';
js/modules/state-mutators.ts:38:        state.semanticThreadsStatus = status;
js/modules/semantic-threads.js:104:    state.semanticSpaceLayoutManifest = manifest;
js/modules/semantic-threads.js:105:    state.semanticSpaceLayoutStatus = 'ready';
js/modules/semantic-threads.js:106:    state.semanticSpaceLayoutError = null;
js/modules/semantic-threads.js:157:    state.semanticNeighborMapByLeadId = new Map();
js/modules/semantic-threads.js:222:        state.semanticThreadsRetryTimer = null;
js/modules/semantic-threads.js:227:    if (state.semanticThreadsStatus === 'ready' || state.semanticThreadsLoadPromise || state.semanticThreadsRetryTimer) return;
js/modules/semantic-threads.js:229:        state.semanticThreadsRetryAttempt = 0;
js/modules/semantic-threads.js:244:    state.semanticThreadsRetryTimer = window.setTimeout(() => {
js/modules/semantic-threads.js:245:        state.semanticThreadsRetryTimer = null;
js/modules/semantic-threads.js:271:    state.semanticThreadsLoadPromise = (async () => {
js/modules/semantic-threads.js:281:                    state.semanticThreadBundle = bundle;
js/modules/semantic-threads.js:282:                    state.semanticThreadArtifactName = artifactName;
js/modules/semantic-threads.js:283:                    state.semanticNeighborMapByLeadId = new Map(_normalizeSemanticNeighborEntries(neighborEntries));
js/modules/semantic-threads.js:318:            state.semanticThreadBundle = bundle;
js/modules/semantic-threads.js:319:            state.semanticThreadArtifactName = loadedArtifactName;
js/modules/semantic-threads.js:326:            state.semanticThreadBundle = null;
js/modules/semantic-threads.js:327:            state.semanticThreadArtifactName = null;
js/modules/semantic-threads.js:328:            state.semanticSpaceLayoutManifest = null;
js/modules/semantic-threads.js:329:            state.semanticSpaceLayoutStatus = 'failed';
js/modules/semantic-threads.js:330:            state.semanticSpaceLayoutError = error?.message || String(error);
js/modules/semantic-threads.js:331:            state.semanticNeighborMapByLeadId = new Map();
js/modules/semantic-threads.js:333:            state.semanticThreadsLoadPromise = null;
js/modules/semantic-threads.js:359:    state.semanticThreadsRetryAttempt = state.semanticThreadsStatus === 'ready' ? 0 : state.semanticThreadsRetryAttempt;
js/modules/semantic-threads.js:365:        thread_retry_count: state.semanticThreadsStatus === 'ready' ? 0 : state.semanticThreadsRetryAttempt,
js/modules/semantic-threads.js:369:        state.semanticThreadsLoadPromise = null;
js/modules/state-mutators.js:11:        state.currentView = view;
js/modules/state-mutators.js:23:        state.semanticLaneState = newState;
js/modules/state-mutators.js:29:        state.loadingPhaseKey = key;
js/modules/state-mutators.js:35:        state.semanticThreadsStatus = status;
js/modules/strand-continuity.js:10:    state.strandContinuityState = {
js/modules/strand-continuity.ts:24:    state.strandContinuityState = {
js/modules/thread-inspector-webgl.js:186:        state.inspectedStrandGroup = new THREE.Group();
js/modules/thread-inspector-webgl.js:226:    state.inspectedStrandDiagnostics = {
js/modules/thread-inspector-webgl.js:269:        state.inspectedStrandDiagnostics = {
js/modules/thread-inspector-webgl.js:286:    state.inspectedStrandGroup = null;
js/modules/thread-inspector-webgl.js:287:    state.inspectedStrandDiagnostics = {
js/modules/thread-inspector-webgl.ts:199:        state.inspectedStrandGroup = new THREE.Group();
js/modules/thread-inspector-webgl.ts:239:    state.inspectedStrandDiagnostics = {
js/modules/thread-inspector-webgl.ts:282:        state.inspectedStrandDiagnostics = {
js/modules/thread-inspector-webgl.ts:299:    state.inspectedStrandGroup = null;
js/modules/thread-inspector-webgl.ts:300:    state.inspectedStrandDiagnostics = {
js/modules/thread-inspector.ts:214:            state.threadInspectorPointerInside = true;
js/modules/thread-inspector.ts:217:                state.canvasThreadInspectionClearTimer = null;
js/modules/thread-inspector.ts:221:            state.threadInspectorPointerInside = false;
js/modules/thread-inspector.ts:231:        state.canvasThreadInspectionClearTimer = null;
js/modules/thread-inspector.ts:308:    state.inspectedThreadIndex = Number.isFinite(index) ? index : null;
js/modules/thread-inspector.ts:323:        state.canvasThreadInspectionClearTimer = null;
js/modules/thread-inspector.ts:325:    state.pinnedThreadIndex = index;
js/modules/thread-inspector.ts:326:    state.inspectedThreadIndex = index;
js/modules/thread-inspector.ts:340:        state.canvasThreadInspectionClearTimer = null;
js/modules/thread-inspector.ts:342:    state.pinnedThreadIndex = null;
js/modules/thread-inspector.ts:343:    state.inspectedThreadIndex = null;
js/modules/thread-inspector.ts:352:    state.canvasThreadInspectionClearTimer = window.setTimeout(() => {
js/modules/thread-inspector.ts:353:        state.canvasThreadInspectionClearTimer = null;
js/modules/thread-inspector.ts:363:        state.pinnedThreadIndex = null;
js/modules/thread-inspector.ts:364:        state.inspectedThreadIndex = null;
js/modules/thread-inspector.ts:365:        state.threadInspectorPointerInside = false;
js/modules/thread-inspector.ts:372:        state.canvasThreadInspectionClearTimer = null;
js/modules/thread-inspector.ts:375:        state.pinnedThreadIndex = null;
js/modules/thread-inspector.ts:376:        state.inspectedThreadIndex = null;
js/modules/thread-inspector.ts:377:        state.threadInspectorPointerInside = false;
js/modules/thread-inspector.ts:388:    state.inspectedThreadIndex = null;
js/modules/thread-inspector.ts:389:    state.threadInspectorPointerInside = false;
js/modules/thread-inspector.ts:426:    state.pinnedThreadIndex = null;
js/modules/thread-inspector.ts:427:    state.inspectedThreadIndex = index;
js/modules/three-engine.js:135:    state.scene = null;
js/modules/three-engine.js:136:    state.camera = null;
js/modules/three-engine.js:137:    state.renderer = null;
js/modules/three-engine.js:138:    state.controls = null;
js/modules/three-engine.js:192:    diagnostics.active = !!(state.renderer && state.scene && state.camera && state.currentView === 'galaxy');
js/modules/three-engine.js:279:    state.scene = scene;
js/modules/three-engine.js:285:    state.camera = camera;
js/modules/three-engine.js:291:    state.hemiLight = hemiLight;
js/modules/three-engine.js:297:    state.dirLight = dirLight;
js/modules/three-engine.js:300:        state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
js/modules/three-engine.js:322:    state.controls = new OrbitControls(state.camera, state.renderer.domElement);
js/modules/three-engine.js:335:        state.autoRotate = false;
js/modules/three-engine.js:415:    state.scene = null;
js/modules/three-engine.js:416:    state.camera = null;
js/modules/three-engine.js:417:    state.controls = null;
js/modules/three-engine.js:425:    state.renderer = null;
js/modules/three-engine.js:426:    state.pointsMesh = null;
js/modules/three-engine.js:427:    state.pointsMaterial = null;
js/modules/three-engine.js:428:    state.nodeSporeMesh = null;
js/modules/three-engine.js:429:    state.nodeSporeHitMesh = null;
js/modules/three-engine.js:430:    state.nodeSporeMaterial = null;
js/modules/three-engine.js:442:    state.sceneRevealActive = false;
js/modules/three-engine.js:443:    state.sceneRevealCameraStart = null;
js/modules/three-engine.js:444:    state.sceneRevealCameraEnd = null;
js/modules/three-engine.js:514:            state.myceliumDirty = true;
js/modules/three-engine.js:518:    if (state.sceneRevealActive && state.sceneRevealCameraStart && state.sceneRevealCameraEnd && state.focusedNode === null) {
js/modules/three-engine.js:524:            state.sceneRevealActive = false;
js/modules/three-engine.js:526:            state.sceneRevealCameraStart = null;
js/modules/three-engine.js:527:            state.sceneRevealCameraEnd = null;
js/modules/three-engine.js:564:    state.pulsePhase = (state.pulsePhase + pulseIncrement) % (Math.PI * 2);
js/modules/three-interaction-visuals.ts:372:    state.anchorBloomLight = anchorBloomLight;
js/modules/three-interaction-visuals.ts:396:        const isInside = state.trailDepth === 2;
js/modules/three-interaction-visuals.ts:452:        const isInside = state.trailDepth === 2;
js/modules/three-interaction-visuals.ts:550:        const isInside = state.trailDepth === 2;
js/modules/three-node-manager.js:241:        state.pointsMesh = null;
js/modules/three-node-manager.js:245:        state.nodeSporeMesh = null;
js/modules/three-node-manager.js:249:        state.nodeSporeHitMesh = null;
js/modules/three-node-manager.js:256:        state.focusBeaconTexture = null;
js/modules/three-node-manager.js:260:        state.focusRingTexture = null;
js/modules/three-node-manager.js:264:        state.focusNextCueTexture = null;
js/modules/three-node-manager.js:296:    state.nodeSporeMesh = sporeMesh;
js/modules/three-node-manager.js:297:    state.nodeSporeMaterial = sporeMat;
js/modules/three-node-manager.js:323:    state.nodeSporeHitMesh = hitMesh;
js/modules/three-node-manager.js:335:    state.nodePositions = [];
js/modules/three-node-manager.js:336:    state.targetPositions = [];
js/modules/three-node-manager.js:337:    state.originalPositions = [];
js/modules/three-node-manager.js:338:    state.pointBaseColors = new Float32Array(state.points.length * 3);
js/modules/three-node-manager.js:340:    state.searchGlowRenderStateKey = '';
js/modules/three-node-manager.js:344:    state.overviewBounds = {
js/modules/three-node-manager.js:353:    state.focusBeaconTexture = sporeTexture;
js/modules/three-node-manager.js:354:    state.focusRingTexture = createFocusRingTexture(THREE);
js/modules/three-node-manager.js:355:    state.focusNextCueTexture = createFocusNextCueTexture(THREE);
js/modules/three-node-manager.js:403:    state.pointsMaterial = new THREE.PointsMaterial({
js/modules/three-node-manager.js:419:    state.pointsMesh = pointsMesh;
js/modules/three-node-manager.ts:305:    state.nodePositions = [];
js/modules/three-node-manager.ts:306:    state.targetPositions = [];
js/modules/three-node-manager.ts:307:    state.originalPositions = [];
js/modules/three-node-manager.ts:308:    state.pointBaseColors = new Float32Array(state.points.length * 3);
js/modules/three-node-manager.ts:310:    state.searchGlowRenderStateKey = '';
js/modules/three-node-manager.ts:314:    state.overviewBounds = {
js/modules/thread-inspector.js:178:            state.threadInspectorPointerInside = true;
js/modules/thread-inspector.js:181:                state.canvasThreadInspectionClearTimer = null;
js/modules/thread-inspector.js:185:            state.threadInspectorPointerInside = false;
js/modules/thread-inspector.js:195:        state.canvasThreadInspectionClearTimer = null;
js/modules/thread-inspector.js:275:    state.inspectedThreadIndex = Number.isFinite(index) ? index : null;
js/modules/thread-inspector.js:290:        state.canvasThreadInspectionClearTimer = null;
js/modules/thread-inspector.js:292:    state.pinnedThreadIndex = index;
js/modules/thread-inspector.js:293:    state.inspectedThreadIndex = index;
js/modules/thread-inspector.js:307:        state.canvasThreadInspectionClearTimer = null;
js/modules/thread-inspector.js:309:    state.pinnedThreadIndex = null;
js/modules/thread-inspector.js:310:    state.inspectedThreadIndex = null;
js/modules/thread-inspector.js:319:    state.canvasThreadInspectionClearTimer = window.setTimeout(() => {
js/modules/thread-inspector.js:320:        state.canvasThreadInspectionClearTimer = null;
js/modules/thread-inspector.js:330:        state.pinnedThreadIndex = null;
js/modules/thread-inspector.js:331:        state.inspectedThreadIndex = null;
js/modules/thread-inspector.js:332:        state.threadInspectorPointerInside = false;
js/modules/thread-inspector.js:339:        state.canvasThreadInspectionClearTimer = null;
js/modules/thread-inspector.js:342:        state.pinnedThreadIndex = null;
js/modules/thread-inspector.js:343:        state.inspectedThreadIndex = null;
js/modules/thread-inspector.js:344:        state.threadInspectorPointerInside = false;
js/modules/thread-inspector.js:355:    state.inspectedThreadIndex = null;
js/modules/thread-inspector.js:356:    state.threadInspectorPointerInside = false;
js/modules/thread-inspector.js:393:    state.pinnedThreadIndex = null;
js/modules/thread-inspector.js:394:    state.inspectedThreadIndex = index;
js/modules/three-search-animations.js:390:    state.searchCorridorGroup = corridorGroup;
js/modules/three-search-animations.js:443:        state.searchCorridorGroup = null;
js/modules/three-interaction-visuals.js:183:        state.semanticManifold = null;
js/modules/three-interaction-visuals.js:187:        state.semanticLensGroup = null;
js/modules/three-interaction-visuals.js:191:        state.focusLens = null;
js/modules/three-interaction-visuals.js:193:    state.semanticLensGlow = null;
js/modules/three-interaction-visuals.js:194:    state.semanticLensSpokes = null;
js/modules/three-interaction-visuals.js:254:    state.semanticManifold = new THREE.Mesh(manifoldGeo, manifoldMat);
js/modules/three-interaction-visuals.js:261:    state.semanticLensGroup = new THREE.Group();
js/modules/three-interaction-visuals.js:298:    state.semanticLensGlow = new THREE.Mesh(glowGeo, glowMat);
js/modules/three-interaction-visuals.js:334:    state.semanticLensSpokes = new THREE.LineSegments(spokeGeo, spokeMat);
js/modules/three-interaction-visuals.js:370:    state.focusLens = new THREE.Mesh(focusLensGeo, focusLensMat);
js/modules/three-interaction-visuals.js:378:    state.anchorBloomLight = anchorBloomLight;
js/modules/three-interaction-visuals.js:402:        const isInside = state.trailDepth === 2;
js/modules/three-interaction-visuals.js:458:        const isInside = state.trailDepth === 2;
js/modules/three-interaction-visuals.js:556:        const isInside = state.trailDepth === 2;
js/modules/three-search-animations.ts:397:    state.searchCorridorGroup = corridorGroup;
js/modules/three-search-animations.ts:450:        state.searchCorridorGroup = null;
js/modules/three-thread-manager.ts:152:    state.myceliumDirty = true;
js/modules/three-engine.ts:146:    state.scene = null;
js/modules/three-engine.ts:147:    state.camera = null;
js/modules/three-engine.ts:148:    state.renderer = null;
js/modules/three-engine.ts:149:    state.controls = null;
js/modules/three-engine.ts:215:    diagnostics.active = !!(state.renderer && state.scene && state.camera && state.currentView === 'galaxy');
js/modules/three-engine.ts:296:    state.scene = scene;
js/modules/three-engine.ts:302:    state.camera = camera;
js/modules/three-engine.ts:332:    state.renderer = renderer;
js/modules/three-engine.ts:362:    state.controls = controls;
js/modules/three-engine.ts:365:        state.autoRotate = false;
js/modules/three-engine.ts:384:    state.hemiLight = hemiLight;
js/modules/three-engine.ts:390:    state.dirLight = dirLight;
js/modules/three-engine.ts:423:    state.pointsMesh = webglContext.pointsMesh;
js/modules/three-engine.ts:424:    state.pointsMaterial = webglContext.pointsMaterial;
js/modules/three-engine.ts:425:    state.nodeSporeMesh = webglContext.nodeSporeMesh;
js/modules/three-engine.ts:426:    state.nodeSporeHitMesh = webglContext.nodeSporeHitMesh;
js/modules/three-engine.ts:427:    state.nodeSporeMaterial = webglContext.nodeSporeMaterial;
js/modules/three-engine.ts:429:    state.myceliumGroup = webglContext.myceliumGroup;
js/modules/three-engine.ts:430:    state.myceliumCoreLines = webglContext.myceliumCoreLines;
js/modules/three-engine.ts:431:    state.myceliumWispyLines = webglContext.myceliumWispyLines;
js/modules/three-engine.ts:432:    state.myceliumBridgeLines = webglContext.myceliumBridgeLines;
js/modules/three-engine.ts:433:    state.myceliumConnectionPairs = webglContext.myceliumConnectionPairs;
js/modules/three-engine.ts:437:    state.semanticLensGroup = webglContext.semanticLensGroup;
js/modules/three-engine.ts:438:    state.semanticLensGlow = webglContext.semanticLensGlow;
js/modules/three-engine.ts:439:    state.semanticLensSpokes = webglContext.semanticLensSpokes;
js/modules/three-engine.ts:440:    state.semanticManifold = webglContext.semanticManifold;
js/modules/three-engine.ts:480:    state.scene = null;
js/modules/three-engine.ts:481:    state.camera = null;
js/modules/three-engine.ts:482:    state.controls = null;
js/modules/three-engine.ts:490:    state.renderer = null;
js/modules/three-engine.ts:491:    state.pointsMesh = null;
js/modules/three-engine.ts:492:    state.pointsMaterial = null;
js/modules/three-engine.ts:493:    state.nodeSporeMesh = null;
js/modules/three-engine.ts:494:    state.nodeSporeHitMesh = null;
js/modules/three-engine.ts:495:    state.nodeSporeMaterial = null;
js/modules/three-engine.ts:510:    state.sceneRevealActive = false;
js/modules/three-engine.ts:511:    state.sceneRevealCameraStart = null;
js/modules/three-engine.ts:512:    state.sceneRevealCameraEnd = null;
js/modules/three-engine.ts:580:            state.myceliumDirty = true;
js/modules/three-engine.ts:584:    if (state.sceneRevealActive && state.sceneRevealCameraStart && state.sceneRevealCameraEnd && state.focusedNode === null) {
js/modules/three-engine.ts:590:            state.sceneRevealActive = false;
js/modules/three-engine.ts:592:            state.sceneRevealCameraStart = null;
js/modules/three-engine.ts:593:            state.sceneRevealCameraEnd = null;
js/modules/three-engine.ts:630:    state.pulsePhase = (state.pulsePhase + pulseIncrement) % (Math.PI * 2);
js/modules/three-thread-manager.js:131:        state.myceliumGroup = null;
js/modules/three-thread-manager.js:133:    state.myceliumCoreLines = null;
js/modules/three-thread-manager.js:134:    state.myceliumWispyLines = null;
js/modules/three-thread-manager.js:135:    state.myceliumBridgeLines = null;
js/modules/three-thread-manager.js:136:    state.myceliumConnectionPairs = [];
js/modules/three-thread-manager.js:150:    state.myceliumDirty = true;
js/modules/three-thread-manager.js:197:    state.myceliumGroup = new THREE.Group();
js/modules/three-thread-manager.js:199:    state.myceliumCoreLines = createLineSegments(coreConnections, coreColors, profile.core);
js/modules/three-thread-manager.js:200:    state.myceliumWispyLines = createLineSegments(wispyConnections, wispyColors, profile.wispy);
js/modules/three-thread-manager.js:201:    state.myceliumBridgeLines = createLineSegments(bridgeConnections, bridgeColors, profile.bridge);
js/modules/ui-feedback.ts:32:    state.experienceResetToastTimer = window.setTimeout(() => {
js/modules/ui-feedback.ts:38:        state.experienceResetToastTimer = null;
js/modules/ui-feedback.js:38:    state.experienceResetToastTimer = window.setTimeout(() => {
js/modules/ui-feedback.js:44:        state.experienceResetToastTimer = null;
js/modules/url-state.js:50:    state._deferredUrlState = null;
js/modules/url-state.js:76:    state.focusedNode = null;
js/modules/url-state.js:77:    state.selectedPoint = null;
js/modules/url-state.js:86:    state.currentSearchSummary = null;
js/modules/url-state.js:88:    state.trailDepth = 0;
js/modules/url-state.js:89:    state.myceliumMode = 'default';
js/modules/url-state.js:105:    state.applyingUrlState = true;
js/modules/url-state.js:106:    state.restoringBrowserHistory = !!options.fromHistory;
js/modules/url-state.js:182:                state._deferredUrlState = { params: Object.fromEntries(params.entries()), timestamp: Date.now() };
js/modules/url-state.js:187:                state._deferredUrlStateHandler = () => {
js/modules/url-state.js:193:                state.applyingUrlState = false;
js/modules/url-state.js:207:                state._deferredUrlState = { params: Object.fromEntries(params.entries()), timestamp: Date.now() };
js/modules/url-state.js:211:                state._deferredUrlStateHandler = () => {
js/modules/url-state.js:217:                state.applyingUrlState = false;
js/modules/url-state.js:245:            state.applyingUrlState = false;
js/modules/url-state.js:246:            state.restoringBrowserHistory = priorRestoringBrowserHistory;
js/modules/view-controller.ts:73:        state.viewHandoffTimer = null;
js/modules/view-controller.ts:99:        state.viewHandoffTimer = null;
js/modules/view-controller.ts:105:    state.viewHandoffTimer = window.setTimeout(() => {
js/modules/view-controller.ts:109:        state.viewHandoffTimer = null;
js/modules/view-controller.ts:140:        state.viewSwitchPreludeTimer = null;
js/modules/view-controller.ts:167:        state.viewSwitchPreludeTimer = window.setTimeout(() => {
js/modules/view-controller.ts:168:            state.viewSwitchPreludeTimer = null;
js/modules/view-controller.ts:233:        state.viewSwitchPreludeTimer = null;
js/modules/view-controller.ts:240:            state.clockTimer = null;
js/modules/view-controller.ts:245:            state.semanticLaneMonitorTimer = null;
js/modules/view-controller.ts:249:            state.semanticLaneOpsRefreshTimer = null;
js/modules/view-controller.js:39:        state.viewHandoffTimer = null
js/modules/view-controller.js:65:        state.viewHandoffTimer = null
js/modules/view-controller.js:71:    state.viewHandoffTimer = window.setTimeout(() => {
js/modules/view-controller.js:75:        state.viewHandoffTimer = null
js/modules/view-controller.js:106:        state.viewSwitchPreludeTimer = null
js/modules/view-controller.js:133:        state.viewSwitchPreludeTimer = window.setTimeout(() => {
js/modules/view-controller.js:134:            state.viewSwitchPreludeTimer = null
js/modules/view-controller.js:197:        state.viewSwitchPreludeTimer = null
js/modules/view-controller.js:204:            state.clockTimer = null
js/modules/view-controller.js:209:            state.semanticLaneMonitorTimer = null
js/modules/view-controller.js:213:            state.semanticLaneOpsRefreshTimer = null
js/modules/url-state.ts:108:    state.focusedNode = null;
js/modules/url-state.ts:109:    state.selectedPoint = null;
js/modules/url-state.ts:118:    state.currentSearchSummary = null;
js/modules/url-state.ts:120:    state.trailDepth = 0;
js/modules/url-state.ts:121:    state.myceliumMode = 'default';
js/modules/url-state.ts:137:    state.applyingUrlState = true;
js/modules/url-state.ts:138:    state.restoringBrowserHistory = !!options.fromHistory;
js/modules/url-state.ts:226:                state.applyingUrlState = false;
js/modules/url-state.ts:251:                state.applyingUrlState = false;
js/modules/url-state.ts:279:            state.applyingUrlState = false;
js/modules/url-state.ts:280:            state.restoringBrowserHistory = priorRestoringBrowserHistory;
js/modules/weather.js:28:    state.weatherInitialized = true;
js/modules/weather.js:38:    state.weatherInitialized = false;
js/modules/weather.js:44:        state.weather = normalizeWeatherPayload(payload);
js/modules/weather.js:46:        state.lastSuccessfulFetch = Date.now();
js/modules/weather.js:56:        state.weather = null;
js/modules/weather.ts:55:    state.weatherInitialized = true;
js/modules/weather.ts:65:    state.weatherInitialized = false;
js/modules/weather.ts:71:        state.weather = normalizeWeatherPayload(payload);
js/modules/weather.ts:73:        state.lastSuccessfulFetch = Date.now();
js/modules/weather.ts:82:        state.weather = null;

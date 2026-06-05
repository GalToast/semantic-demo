// js/state/selectors/filter-mode.js
// Read-only selectors for active filters, cluster filter, mycelium mode, bloom/bridge indices.
import { state } from '../../state.js';

// ── Active Filters ──
export const getActiveFilters = () => state.activeFilters;

// ── Active Cluster Filter ──
export const getActiveClusterFilter = () => state.activeClusterFilter;

// ── Filter Version ──
export const getFilterVersion = () => state.filterVersion;
export const getFilterColorVersion = () => state.filterColorVersion;

// ── Registered Events ──
export const getRegisteredEvents = () => state.registeredEvents;

// ── Active Story Prompt ──
export const getActiveStoryPrompt = () => state.activeStoryPrompt;

// ── Mycelium Mode ──
export const getMyceliumMode = () => state.myceliumMode;

// ── Bloom / Bridge Indices ──
export const getBloomIndices = () => state.bloomIndices;
export const getBridgeIndices = () => state.bridgeIndices;

// ── Bridge / Signal Scores ──
export const getBridgeScores = () => state.bridgeScores;
export const getSignalScores = () => state.signalScores;

// ── Point Color State ──
export const getPointColorStateVersion = () => state.pointColorStateVersion;
export const getPointBaseColors = () => state.pointBaseColors;

// ── Recent Arrangements ──
export const getRecentArrangements = () => state.recentArrangements;

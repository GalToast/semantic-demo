// js/state/selectors/filter-mode.js
// Read-only selectors for active filters, cluster filter, mycelium mode, bloom/bridge indices.
// Now reads from appState (Svelte 5) instead of legacy state singleton.
import { appState } from '@lib/state/app.svelte.ts';

// ── Active Filters ──
export const getActiveFilters = () => appState.activeFilters;

// ── Active Cluster Filter ──
export const getActiveClusterFilter = () => appState.activeClusterFilter;

// ── Filter Version ──
export const getFilterVersion = () => appState.filterVersion;
export const getFilterColorVersion = () => appState.filterColorVersion;

// ── Registered Events ──
export const getRegisteredEvents = () => appState.registeredEvents;

// ── Active Story Prompt ──
export const getActiveStoryPrompt = () => appState.activeStoryPrompt;

// ── Mycelium Mode ──
export const getMyceliumMode = () => appState.myceliumMode;

// ── Bloom / Bridge Indices ──
export const getBloomIndices = () => appState.bloomIndices;
export const getBridgeIndices = () => appState.bridgeIndices;

// ── Bridge / Signal Scores ──
export const getBridgeScores = () => appState.bridgeScores;
export const getSignalScores = () => appState.signalScores;

// ── Point Color State ──
export const getPointColorStateVersion = () => appState.pointColorStateVersion;
export const getPointBaseColors = () => appState.pointBaseColors;

// ── Recent Arrangements ──
export const getRecentArrangements = () => appState.recentArrangements;

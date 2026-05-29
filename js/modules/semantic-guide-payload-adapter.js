// js/modules/semantic-guide-payload-adapter.js
// Thin adapter seam: decouples semantic-guide payload builders from raw state shape.
// Provides state snapshots and derived values so payload builders remain stateless
// relative to the global state object.

import { state } from '../state.js';
import { formatBusinessName, cleanPublicNoteText, getPublicRecordStatusLabel } from './utils/dom-formatters.js';
import { describeCluster } from './utils/ui-presentation.js';

export { formatBusinessName };

/**
 * Returns a snapshot of the search-context fields used by payload builders.
 * @returns {{ currentSearchSummary: object|null, currentView: string }}
 */
export function getSearchContextSnapshot() {
    return {
        currentSearchSummary: state.currentSearchSummary,
        currentView: state.currentView,
    };
}

/**
 * Returns the points array reference.
 * @returns {Array}
 */
export function getPoints() {
    return state.points;
}

/**
 * Returns the semanticResultContextByLeadId map reference.
 * @returns {Map}
 */
export function getResultContextMap() {
    return state.semanticResultContextByLeadId;
}

/**
 * Builds a semantic guide result object for a given index.
 * Exposed so callers (like connection-analysis.js) can construct payloads
 * without reading state directly.
 *
 * @param {number} index
 * @param {Array} points
 * @param {Map} contextMap
 * @returns {object|null}
 */
export function buildSemanticGuidePayloadResult(index, points, contextMap) {
    if (!points) return null;
    if (!(Number.isFinite(index) && index >= 0 && index < points.length)) return null;
    const point = points[index];
    if (!point) return null;
    const context = contextMap?.get?.(String(point.lead_id)) || {};

    return {
        lead_id: point.lead_id,
        name: formatBusinessName(point.name),
        city: cleanPublicNoteText(point.city || context.city || ''),
        cluster_label: describeCluster(point.cluster),
        status: getPublicRecordStatusLabel(point.status),
        public_note: cleanPublicNoteText(context.public_note || point.what || ''),
        public_detail: cleanPublicNoteText(context.public_detail || ''),
        address: cleanPublicNoteText(context.address || ''),
        naics: cleanPublicNoteText(context.naics || '')
    };
}

/**
 * Maps result indices to payload result objects.
 * @param {number[]} resultIndices
 * @param {Array} points
 * @param {Map} contextMap
 * @returns {object[]}
 */
export function mapResultIndicesToPayloadResults(resultIndices, points, contextMap) {
    if (!resultIndices?.length) return [];
    return resultIndices.slice(0, 6).map(idx => buildSemanticGuidePayloadResult(idx, points, contextMap)).filter(Boolean);
}

/**
 * Returns the anchor point for the current search summary.
 * @param {object|null} currentSearchSummary
 * @param {Array} points
 * @returns {object|null}
 */
export function getAnchorPoint(currentSearchSummary, points) {
    const idx = currentSearchSummary?.anchorIndex;
    if (!Number.isFinite(idx) || !points) return null;
    return points[idx] || null;
}
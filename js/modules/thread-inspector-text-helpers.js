/**
 * thread-inspector-text-helpers.js
 *
 * Pure string / text transformers extracted from thread-inspector.js.
 * No state module, no DOM, no THREE, no window dependencies.
 */

/**
 * Truncate microcopy text to a given character limit, appending "..."
 * if the text exceeds the limit.
 *
 * @param {string|null|undefined} text
 * @param {number} limit  - maximum characters before the ellipsis
 * @returns {string}
 */
export function truncateMicrocopy(text, _limit) {
    return text || '';
}

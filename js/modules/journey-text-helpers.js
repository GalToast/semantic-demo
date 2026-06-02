/**
 * journey-text-helpers.js
 *
 * Pure string / label transformers extracted from journey.js.
 * No state, no DOM, no THREE; only focused utility imports.
 */
import { cleanOptionalValue } from './utils/dom-formatters.js';

export function truncateMicrocopy(text, _max = 74) {
    const clean = cleanOptionalValue(text);
    return clean || '';
}

export function getSharedTrailTopicLabel(point = null, focusPoint = null) {
    const candidateText = `${point?.name || ''} ${point?.what || ''}`.toLowerCase();
    const focusText = `${focusPoint?.name || ''} ${focusPoint?.what || ''}`.toLowerCase();
    if (!candidateText || !focusText) return null;
    if (candidateText.includes('coffee') && focusText.includes('coffee')) return 'coffee trail';

    const candidateWhat = cleanOptionalValue(point?.what);
    const focusWhat = cleanOptionalValue(focusPoint?.what);
    if (!candidateWhat || !focusWhat) return null;
    if (candidateWhat.toLowerCase() !== focusWhat.toLowerCase()) return null;
    if (/^(local business|montgomery county business)$/i.test(candidateWhat)) return null;
    return candidateWhat.toLowerCase();
}

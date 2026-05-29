/**
 * journey-text-helpers.js
 *
 * Pure string / label transformers extracted from journey.js.
 * No state, no DOM, no THREE; only focused utility imports.
 */
import { cleanOptionalValue } from './utils/dom-formatters.js';

export function truncateMicrocopy(text, max = 74) {
    const clean = cleanOptionalValue(text);
    if (!clean || clean.length <= max) return clean || '';
    const slice = clean.slice(0, max + 1);
    const boundary = Math.max(slice.lastIndexOf(', '), slice.lastIndexOf('; '), slice.lastIndexOf(' '));
    const cutAt = boundary > Math.floor(max * 0.62) ? boundary : max;
    return `${slice.slice(0, cutAt).replace(/[,\s;:.]+$/, '')}...`;
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

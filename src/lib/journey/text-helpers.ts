/**
 * journey-text-helpers.ts — TypeScript shadow of journey-text-helpers.js
 * Pure string / label transformers extracted from journey.js.
 * No state, no DOM, no THREE; only focused utility imports.
 */
import { cleanOptionalValue } from '@lib/utils/dom-formatters';

export function truncateMicrocopy(text: string | null | undefined, _max: number = 74): string {
    const clean = cleanOptionalValue(text);
    return clean || '';
}

export function getSharedTrailTopicLabel(
    point: { name?: string; what?: string } | null = null,
    focusPoint: { name?: string; what?: string } | null = null
): string | null {
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

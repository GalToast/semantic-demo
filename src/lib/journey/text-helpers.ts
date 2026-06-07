/**
 * @lib/journey/text-helpers.ts — Microcopy truncation and label transformers
 *
 * Ported from: js/modules/journey-text-helpers.js
 *
 * Pure string / label transformers. No state, no DOM, no THREE.
 */

import { cleanOptionalValue } from '@lib/utils/dom-formatters';

/**
 * Truncate microcopy text for display in constrained UI.
 * Ported from journey-text-helpers.js truncateMicrocopy().
 *
 * When the cleaned text exceeds `_max` characters, it is truncated at a
 * natural word/phrase boundary (comma, semicolon, or space) when one is
 * found past 62% of the max length; otherwise hard-truncated. Trailing
 * punctuation is stripped and an ellipsis is appended.
 */
export function truncateMicrocopy(text: string | null | undefined, _max = 74): string {
  const clean = cleanOptionalValue(text);
  if (!clean || clean.length <= _max) return clean || '';

  const slice = clean.slice(0, _max + 1);
  const boundary = Math.max(
    slice.lastIndexOf(', '),
    slice.lastIndexOf('; '),
    slice.lastIndexOf(' ')
  );
  const cutAt = boundary > Math.floor(_max * 0.62) ? boundary : _max;
  return `${slice.slice(0, cutAt).replace(/[,\s;:.]+$/, '')}...`;
}

/**
 * Get shared trail topic label between a point and focus point.
 * Ported from journey-text-helpers.js getSharedTrailTopicLabel().
 */
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



/**
 * src/lib/ui-renderers.ts
 *
 * UI rendering utilities for selected business card.
 * Shadow of js/modules/ui-renderers.js + focus-stage-renderer.js
 */

import type { BusinessRecord } from './types/business';
import { appState } from './state/app.svelte.ts';

/** Blocklist for filtering business trivia. */
export const TRIVIA_BLOCKLIST = Object.freeze({
    exact: Object.freeze([
        'Pending research.',
        'Pending research'
    ]),
    equals: Object.freeze([
        'Has both email and phone.',
        'Website only — no direct contact on file.'
    ]),
    prefixes: Object.freeze([
        'no ',
        'none',
        'no verifiable',
        'unable to',
        'could not'
    ]),
    substrings: Object.freeze([
        'SearXNG',
        'Insufficient evidence',
        'exact entity name',
        'verified official',
        'entity confirmed',
        'Registry-only',
        'FMCSA carrier',
        'USDOT',
        'SAFER snapshot',
        'Texas Comptroller',
        'Research check',
        'MapQuest',
        'GoDaddy',
        'WordPress site on Cloudflare',
        'Hotel page is active',
        'Local dirt track',
        'carrier records',
        'carrier lookup',
        'via carrier',
        'via lookup',
        'contact found',
        'Verified phone',
        'Verified email',
        'formerly ',
        'formerly known',
        'renamed',
        'rebranded as',
        'retail chain location',
        'brand location',
        'chain location',
        'operating as',
        'operated as',
        'dba',
        'also known as',
        'doing business as',
        'Disqualified',
        'SKIP',
        'DO NOT',
        'REDACTED',
        ' Omits ',
        'NAICS',
        '**Industry**',
        '**Service**',
        'SIC ',
        'SIC:',
        'New lead profile',
        'directory:',
        'from directory',
        'created from'
    ]),
    minLength: 20
});

/** Check if trivia should be rejected. */
export function rejectsTrivia(trivia = ''): boolean {
    const trimmed = String(trivia || '').trim();
    if (!trimmed) return true;
    if (TRIVIA_BLOCKLIST.exact.includes(trimmed)) return true;
    if (TRIVIA_BLOCKLIST.equals.includes(trimmed)) return true;
    if (trimmed.length < TRIVIA_BLOCKLIST.minLength) return true;
    const lower = trimmed.toLowerCase();
    if (TRIVIA_BLOCKLIST.prefixes.some((prefix) => lower.startsWith(prefix))) return true;
    return TRIVIA_BLOCKLIST.substrings.some((substring) => trimmed.includes(substring));
}

/** Get interesting business note from point. */
export function getInterestingBusinessNote(point: BusinessRecord | null): string | null {
    if (!point) return null;
    
    // Use trivia field from the record
    if (point.trivia) {
        const t = point.trivia.trim();
        if (rejectsTrivia(t)) return null;
        return t;
    }
    
    // Fallback heuristics
    if (point.email && point.phone) return null;
    if (point.website && !point.email && !point.phone) return null;
    return null;
}

/** Build selected match narrative copy. */
export function buildSelectedMatchNarrative(point: BusinessRecord | null): string {
    if (!point) return '';
    const summary = appState.currentSearchSummary;
    if (summary?.reason) return summary.reason;
    return '';
}

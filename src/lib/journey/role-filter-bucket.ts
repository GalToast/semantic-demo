/**
 * @lib/journey/role-filter-bucket.ts — Collapse the 26-role relationship enum
 * into the 3 filter buckets the JourneyChrome chips expose.
 *
 * Extracted from JourneyChrome.svelte so the mapping is unit-testable. The
 * component owns the 'all' UI option; this module only deals with the three
 * real buckets (direct / support / civic).
 */

import type { RelationshipRole } from '@lib/utils/relationship-roles';

export type RoleFilterBucket = 'direct' | 'support' | 'civic';

// Indirect/contextual connections — same area/market, complements, and bridges
// across categories or cities. Bucketed as the "Supporting link" chip.
export const SUPPORT_BUCKET_ROLES: ReadonlySet<RelationshipRole> = new Set([
    'support',
    'complement',
    'same_market',
    'geo_echo',
    'bridge',
    'semantic_bridge',
    'category_bridge',
    'city_bridge'
]);

/**
 * Map any of the 26 relationship roles into one of the 3 filter buckets the
 * chips expose.
 *
 * Pocket candidates carry the fine-grained 26-role enum (core_peer, upstream,
 * complement, …), but the chips expose only 3 buckets. A strict-equality
 * filter (role === 'direct') matched almost nothing and silently emptied the
 * rail. This collapses the enum honestly: civic stays civic, the
 * indirect/contextual roles bucket as support, and everything else (direct
 * peers, supply chain, ownership, identity matches, referrals, competition,
 * and unclassified as the catch-all) buckets as direct.
 */
export function roleToFilterBucket(role: RelationshipRole): RoleFilterBucket {
    if (role === 'civic') return 'civic';
    if (SUPPORT_BUCKET_ROLES.has(role)) return 'support';
    return 'direct';
}

/**
 * relationship-roles.ts — TypeScript shadow of relationship-roles.js
 * Relationship role normalization and copy.
 *
 * COEXISTENCE PLAN (Ticket 4 — 2026-06-13)
 * ──────────────────────────────────────────
 * This legacy file holds an 8-role vocabulary (trail/peer semantics).
 * The Svelte superset at src/lib/utils/relationship-roles.ts has 27 roles.
 * Both files are alive and actively imported. No deletion until all UI
 * consumers migrate to the Svelte vocabulary.
 *
 * LEGACY CALLERS (5 files) — migrate each to src/lib/utils/relationship-roles:
 *   js/modules/journey-thread-model.ts    — normalizeRelationshipRole
 *   js/modules/journey-focus-ui.ts        — getRelationshipRoleLabel, normalizeRelationshipRole
 *   js/modules/semantic-threads.ts        — normalizeRelationshipRole
 *   js/modules/thread-inspector.ts        — getRelationshipRoleLabel, normalizeRelationshipRole
 *   js/modules/journey-thread-settler.ts  — normalizeRelationshipRole, getRelationshipRoleCopy,
 *                                           describeRelationshipRoleReason, getRelationshipRoleLabel
 *
 * SVELTE CALLERS (4 import sites, 3 files) — already on Svelte vocabulary:
 *   src/lib/data-loader.ts
 *   src/lib/journey/thread-model.ts
 *   src/lib/types/business.ts (type-only)
 *   src/lib/semantic-threads.ts
 *
 * MIGRATION ORDER: journey-thread-settler → thread-inspector → journey-focus-ui →
 *                   semantic-threads → journey-thread-model
 * DELETE after last consumer migrates. Estimated: 1-2 days across future PRs.
 */

export const UNCLASSIFIED_RELATIONSHIP_ROLE = 'unclassified';

export interface RelationshipRoleCopy {
    rail: string;
    title: string;
    inside: string;
    reason: string;
}

const RELATIONSHIP_ROLE_COPY: Readonly<Record<string, RelationshipRoleCopy>> = Object.freeze({
    core_peer: { rail: 'Peer', title: 'Same beat', inside: 'same beat', reason: 'Same trail. Same trade.' },
    upstream: { rail: 'Anchor', title: 'Anchors the trail', inside: 'anchors the trail', reason: 'Holds up the trail here.' },
    downstream: { rail: 'Served by', title: 'Served by trail', inside: 'served by trail', reason: 'Served by this trail.' },
    complement: { rail: 'Pairs', title: 'Pairs with trail', inside: 'pairs with trail', reason: 'Same journey, different stop.' },
    same_market: { rail: 'Same lane', title: 'Same lane', inside: 'same lane', reason: 'Same trade. Same town.' },
    geo_echo: { rail: 'Echo', title: 'Echo elsewhere', inside: 'echo elsewhere', reason: 'Same trade. Another town.' },
    bridge: { rail: 'Bridge', title: 'Bridges towns', inside: 'bridges towns', reason: 'Bridges this trail to the next.' },
    [UNCLASSIFIED_RELATIONSHIP_ROLE]: { rail: 'Trail neighbor', title: 'Unclassified', inside: 'unclassified', reason: 'No clear thread yet.' }
});

const ROLE_REASON_REWRITES: readonly [RegExp, string][] = Object.freeze([
    [/high-similarity peer in the same business ecosystem/i, 'Same trail. Same trade.'],
    [/same market signal with local context/i, 'Same trade. Same town.'],
    [/same market signal across different towns/i, 'Same trade. Another town.'],
    [/candidate looks like an input, infrastructure, or support provider/i, 'Holds up the trail here.'],
    [/candidate looks like a customer, beneficiary, or demand-side market/i, 'Served by this trail.'],
    [/construction\/trade work points toward property or rural demand/i, 'Draws the trail outward.'],
    [/candidate looks like trade infrastructure for the selected market/i, 'Carries the trail forward.'],
    [/adjacent sectors that often appear in the same customer journey/i, 'Same journey, different stop.'],
    [/nearby semantic neighbor with adjacent business signals/i, 'Adjacent on the route.'],
    [/shared support node in the local semantic neighborhood/i, 'Backs up this trail.'],
    [/cross-market semantic bridge/i, 'Bridges this trail to the next.']
]);

export function normalizeRelationshipRole(role: string | null | undefined): string {
    const normalized = String(role || '').trim();
    return (RELATIONSHIP_ROLE_COPY as Record<string, RelationshipRoleCopy>)[normalized] ? normalized : UNCLASSIFIED_RELATIONSHIP_ROLE;
}

export function getRelationshipRoleCopy(role: string | null | undefined): RelationshipRoleCopy {
    const fallback = RELATIONSHIP_ROLE_COPY.unclassified!;
    return RELATIONSHIP_ROLE_COPY[normalizeRelationshipRole(role)] ??
        fallback;
}

export function getRelationshipRoleLabel(role: string | null | undefined, surface: string = 'title'): string {
    const copy = getRelationshipRoleCopy(role);
    return surface in copy ? copy[surface as keyof RelationshipRoleCopy] : copy.title;
}

export function describeRelationshipRoleReason(role: string | null | undefined, rawReason: string = ''): string {
    const cleaned = String(rawReason || '').trim();
    if (!cleaned) return getRelationshipRoleCopy(role).reason;
    for (const [pattern, replacement] of ROLE_REASON_REWRITES) {
        if (pattern.test(cleaned)) return replacement;
    }
    return cleaned
        .replace(/^candidate looks like\s+/i, '')
        .replace(/\s+/g, ' ')
        .replace(/\.$/, '');
}

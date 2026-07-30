/**
 * @lib/utils/relationship-roles.ts — Relationship role normalization
 *
 * Ported from:
 *
 * Shared relationship role normalization used by journey, thread inspector,
 * and semantic threads.
 */

export const UNCLASSIFIED_RELATIONSHIP_ROLE = 'unclassified'

export const RELATIONSHIP_ROLES = [
    'unclassified',
    'core_peer',
    'upstream',
    'downstream',
    'complement',
    'same_market',
    'geo_echo',
    'bridge',
    'direct',
    'support',
    'civic',
    'competitor',
    'vendor',
    'client',
    'partner',
    'referral_source',
    'referral_target',
    'same_owner',
    'shared_principal',
    'address_match',
    'phone_match',
    'web_match',
    'category_peer',
    'local_peer',
    'semantic_bridge',
    'category_bridge',
    'city_bridge'
] as const

export type RelationshipRole = (typeof RELATIONSHIP_ROLES)[number]

const ROLE_COPY: Record<RelationshipRole, { label: string; title: string; reason: string }> = {
    unclassified: {
        label: 'Connection',
        title: 'Nearby connection',
        reason: 'These businesses appear near each other in the local market.'
    },
    direct: {
        label: 'Direct link',
        title: 'Direct link',
        reason: 'These businesses share a strong, direct match — often the same type, nearby, with complementary services.'
    },
    support: {
        label: 'Supporting link',
        title: 'Supporting link',
        reason: 'A weaker but meaningful connection — same area or sector, with some shared service language.'
    },
    civic: {
        label: 'Civic anchor',
        title: 'Civic anchor',
        reason: 'A government, nonprofit, or community institution that anchors the local business ecosystem.'
    },
    competitor: {
        label: 'Competitor',
        title: 'Competitor',
        reason: 'Direct competitors in the same category and service area.'
    },
    vendor: {
        label: 'Vendor',
        title: 'Vendor relationship',
        reason: 'Likely supplier or vendor relationship based on category pairing.'
    },
    client: {
        label: 'Client',
        title: 'Client relationship',
        reason: 'Likely client relationship based on category pairing.'
    },
    partner: {
        label: 'Partner',
        title: 'Strategic partner',
        reason: 'Complementary businesses that frequently collaborate or cross-refer.'
    },
    referral_source: {
        label: 'Refers to',
        title: 'Refers business to',
        reason: 'This business likely refers customers to the connected business.'
    },
    referral_target: {
        label: 'Referred by',
        title: 'Receives referrals from',
        reason: 'This business likely receives referrals from the connected business.'
    },
    same_owner: {
        label: 'Same owner',
        title: 'Common ownership',
        reason: 'Shared principal or ownership structure identified in public filings.'
    },
    shared_principal: {
        label: 'Shared principal',
        title: 'Shared principal',
        reason: 'A named individual appears as principal or officer for both businesses.'
    },
    address_match: {
        label: 'Same address',
        title: 'Co-located',
        reason: 'Both businesses register the same physical address.'
    },
    phone_match: {
        label: 'Same phone',
        title: 'Shared contact number',
        reason: 'Both businesses list the same phone number.'
    },
    web_match: {
        label: 'Same web',
        title: 'Shared web presence',
        reason: 'Both businesses share a domain or web infrastructure signature.'
    },
    category_peer: {
        label: 'Category peer',
        title: 'Same category',
        reason: 'Same primary business category in the same service area.'
    },
    local_peer: {
        label: 'Local peer',
        title: 'Neighborhood peer',
        reason: 'Nearby business in the same category or complementary sector.'
    },
    semantic_bridge: {
        label: 'Cross-category link',
        title: 'Cross-category link',
        reason: 'Links two different business categories through shared services.'
    },
    category_bridge: {
        label: 'Category bridge',
        title: 'Cross-category link',
        reason: 'Spans two distinct business categories with strong shared vocabulary.'
    },
    city_bridge: {
        label: 'City bridge',
        title: 'Cross-city link',
        reason: 'Connects businesses across city boundaries with shared service patterns.'
    },
    core_peer: {
        label: 'Peer',
        title: 'Similar local business',
        reason: 'A close match — a similar business in the same area.'
    },
    upstream: {
        label: 'Input-type',
        title: 'Local input-type business',
        reason: 'A nearby business in an input or supply-type field.'
    },
    downstream: {
        label: 'Customer-type',
        title: 'Local customer-type business',
        reason: 'A nearby business that buys from local suppliers.'
    },
    complement: {
        label: 'Complements',
        title: 'Complements this business',
        reason: 'A nearby business in a field that serves the same customers.'
    },
    same_market: {
        label: 'Same market',
        title: 'Same local market',
        reason: 'Another business serving the same local customers.'
    },
    geo_echo: {
        label: 'Nearby elsewhere',
        title: 'Also in other towns',
        reason: 'A similar business in another nearby town.'
    },
    bridge: {
        label: 'Bridge',
        title: 'Connects areas',
        reason: 'Links different parts of the local market.'
    }
}

/**
 * Normalize a raw relationship role string to a known role.
 */
export function normalizeRelationshipRole(role: string | null | undefined): RelationshipRole {
    if (!role) return UNCLASSIFIED_RELATIONSHIP_ROLE
    const normalized = role
        .trim()
        .toLowerCase()
        .replace(/[-\s]+/g, '_')
    if (RELATIONSHIP_ROLES.includes(normalized as RelationshipRole)) {
        return normalized as RelationshipRole
    }
    return UNCLASSIFIED_RELATIONSHIP_ROLE
}

/**
 * Get the label for a role (short form for UI).
 */
export function getRelationshipRoleLabel(
    role: RelationshipRole,
    variant: 'rail' | 'title' | 'inside' = 'title'
): string {
    const copy = ROLE_COPY[role] || ROLE_COPY[UNCLASSIFIED_RELATIONSHIP_ROLE]
    if (variant === 'rail') return copy.label
    if (variant === 'inside') return copy.label
    return copy.title
}

/**
 * Get the full copy object for a role.
 */
export function getRelationshipRoleCopy(role: RelationshipRole): { label: string; title: string; reason: string } {
    return ROLE_COPY[role] || ROLE_COPY[UNCLASSIFIED_RELATIONSHIP_ROLE]
}

/**
 * Describe the role reason in a human-friendly way.
 */
export function describeRelationshipRoleReason(role: RelationshipRole, _roleReason?: string): string {
    // The raw data-derived roleReason asserts business relationships (e.g.
    // "input provider") that the source data cannot verify — it is inferred
    // from co-location + industry similarity only. Always surface the honest,
    // defensible copy instead of the over-claimed raw text.
    const copy = ROLE_COPY[role] || ROLE_COPY[UNCLASSIFIED_RELATIONSHIP_ROLE]
    return copy.reason
}

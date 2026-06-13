/**
 * @lib/utils/relationship-roles.ts — Relationship role normalization
 *
 * Ported from: js/modules/relationship-roles.js
 *
 * Shared relationship role normalization used by journey, thread inspector,
 * and semantic threads.
 */

export const UNCLASSIFIED_RELATIONSHIP_ROLE = 'unclassified';

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
] as const;

export type RelationshipRole = (typeof RELATIONSHIP_ROLES)[number];

const ROLE_COPY: Record<RelationshipRole, { label: string; title: string; reason: string }> = {
	unclassified: {
		label: 'Connection',
		title: 'Connection',
		reason: 'This connection was identified through semantic similarity, but the specific relationship type is not classified.'
	},
	direct: {
		label: 'Direct link',
		title: 'Direct link',
		reason: 'These businesses share a direct, strong semantic signal — often the same category, city, and complementary services.'
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
		reason: 'Shared principal or ownership structure detected in public records.'
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
		label: 'Semantic bridge',
		title: 'Semantic bridge',
		reason: 'Connects two otherwise separate semantic clusters through shared language.'
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
		title: 'Same beat',
		reason: 'High-similarity peer in the same local business ecosystem.'
	},
	upstream: {
		label: 'Anchor',
		title: 'Anchors the trail',
		reason: 'Likely input, infrastructure, or support provider for this trail.'
	},
	downstream: {
		label: 'Served by',
		title: 'Served by trail',
		reason: 'Likely customer, beneficiary, or demand-side market for this trail.'
	},
	complement: {
		label: 'Pairs',
		title: 'Pairs with trail',
		reason: 'Adjacent sector that often appears in the same customer journey.'
	},
	same_market: {
		label: 'Same lane',
		title: 'Same lane',
		reason: 'Same market signal with local context.'
	},
	geo_echo: {
		label: 'Echo',
		title: 'Echo elsewhere',
		reason: 'Same market signal across different towns.'
	},
	bridge: {
		label: 'Bridge',
		title: 'Bridges towns',
		reason: 'Cross-market or cross-city semantic bridge.'
	}
};

/**
 * Normalize a raw relationship role string to a known role.
 */
export function normalizeRelationshipRole(role: string | null | undefined): RelationshipRole {
	if (!role) return UNCLASSIFIED_RELATIONSHIP_ROLE;
	const normalized = role.trim().toLowerCase().replace(/[-\s]+/g, '_');
	if (RELATIONSHIP_ROLES.includes(normalized as RelationshipRole)) {
		return normalized as RelationshipRole;
	}
	return UNCLASSIFIED_RELATIONSHIP_ROLE;
}

/**
 * Get the label for a role (short form for UI).
 */
export function getRelationshipRoleLabel(role: RelationshipRole, variant: 'rail' | 'title' | 'inside' = 'title'): string {
	const copy = ROLE_COPY[role] || ROLE_COPY[UNCLASSIFIED_RELATIONSHIP_ROLE];
	if (variant === 'rail') return copy.label;
	if (variant === 'inside') return copy.label;
	return copy.title;
}

/**
 * Get the full copy object for a role.
 */
export function getRelationshipRoleCopy(role: RelationshipRole): { label: string; title: string; reason: string } {
	return ROLE_COPY[role] || ROLE_COPY[UNCLASSIFIED_RELATIONSHIP_ROLE];
}

/**
 * Describe the role reason in a human-friendly way.
 */
export function describeRelationshipRoleReason(role: RelationshipRole, roleReason?: string): string {
	const copy = ROLE_COPY[role] || ROLE_COPY[UNCLASSIFIED_RELATIONSHIP_ROLE];
	if (roleReason && roleReason.trim()) {
		return roleReason.trim();
	}
	return copy.reason;
}

/**
 * @js/modules/relationship-roles.js — Relationship role normalization shim
 *
 * Re-exports canonical logic with the original legacy API surface that
 * tests and legacy consumers expect.
 */
export const UNCLASSIFIED_RELATIONSHIP_ROLE = 'unclassified';

const KNOWN_ROLES = [
	'core_peer',
	'upstream',
	'downstream',
	'complement',
	'same_market',
	'geo_echo',
	'bridge',
	'unclassified'
];

const ROLE_COPY = {
	core_peer: { rail: 'Peer', title: 'Same beat', reason: 'Same trail. Same trade.' },
	upstream: { rail: 'Anchor', title: 'Anchors the trail', reason: 'Holds up the trail here.' },
	downstream: { rail: 'Served by', title: 'Served by trail', reason: 'Rides this trail downstream.' },
	complement: { rail: 'Pairs', title: 'Pairs with trail', reason: 'Same journey, different stop.' },
	same_market: { rail: 'Same lane', title: 'Same lane', reason: 'Same lane, same game.' },
	geo_echo: { rail: 'Echo', title: 'Echo elsewhere', reason: 'Same signal, different town.' },
	bridge: { rail: 'Bridge', title: 'Bridges towns', reason: 'Connects two scenes.' },
	unclassified: { rail: 'Trail neighbor', title: 'Unclassified', reason: 'No classifier yet.' }
};

// Derive inside field as title.toLowerCase() so getRelationshipRoleCopy
// returns the full expected shape { rail, title, inside, reason }.
for (const entry of Object.values(ROLE_COPY)) {
	entry.inside = entry.title.toLowerCase();
}

// Known verbose reason -> concise rewrite map for describeRelationshipRoleReason.
const REASON_REWRITES = {
	'high-similarity peer in the same business ecosystem': 'Same trail. Same trade.',
	'adjacent sectors that often appear in the same customer journey': 'Same journey, different stop.'
};

// Prefix to strip from unknown reasons.
const REASON_CANDIDATE_PREFIX = 'candidate looks like ';

/**
 * Normalize a raw relationship role string to a known role.
 */
export function normalizeRelationshipRole(role) {
	if (!role) return UNCLASSIFIED_RELATIONSHIP_ROLE;
	const trimmed = role.trim();
	if (KNOWN_ROLES.includes(trimmed)) return trimmed;
	return UNCLASSIFIED_RELATIONSHIP_ROLE;
}

/**
 * Get the full copy object for a role.
 */
export function getRelationshipRoleCopy(role) {
	return ROLE_COPY[role] || ROLE_COPY[UNCLASSIFIED_RELATIONSHIP_ROLE];
}

/**
 * Get the label for a role variant.
 */
export function getRelationshipRoleLabel(role, surface) {
	const copy = ROLE_COPY[role] || ROLE_COPY[UNCLASSIFIED_RELATIONSHIP_ROLE];
	if (surface === 'rail') return copy.rail;
	if (surface === 'inside') return copy.inside;
	return copy.title;
}

/**
 * Describe the role reason in a human-friendly way.
 */
export function describeRelationshipRoleReason(role, rawReason) {
	const copy = ROLE_COPY[role] || ROLE_COPY[UNCLASSIFIED_RELATIONSHIP_ROLE];
	if (!rawReason || !rawReason.trim()) return copy.reason;

	const trimmed = rawReason.trim();
	const lower = trimmed.toLowerCase();

	// Check known verbose→concise rewrites.
	for (const [pattern, rewrite] of Object.entries(REASON_REWRITES)) {
		if (lower === pattern) return rewrite;
	}

	// Strip known prefix.
	let cleaned = trimmed;
	if (lower.startsWith(REASON_CANDIDATE_PREFIX)) {
		cleaned = trimmed.slice(REASON_CANDIDATE_PREFIX.length);
	}

	// Remove trailing period.
	cleaned = cleaned.replace(/\.$/, '');

	// Collapse internal whitespace.
	cleaned = cleaned.replace(/\s+/g, ' ').trim();

	return cleaned;
}

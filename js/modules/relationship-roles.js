export const UNCLASSIFIED_RELATIONSHIP_ROLE = 'unclassified';

const RELATIONSHIP_ROLE_COPY = Object.freeze({
    core_peer: {
        rail: 'Peer',
        title: 'Close peer',
        inside: 'close peer',
        reason: 'strong shared-market signal'
    },
    upstream: {
        rail: 'Support',
        title: 'Support provider',
        inside: 'support provider',
        reason: 'support or infrastructure signal'
    },
    downstream: {
        rail: 'Market',
        title: 'Served market',
        inside: 'served market',
        reason: 'demand-side market signal'
    },
    complement: {
        rail: 'Pairs',
        title: 'Complementary fit',
        inside: 'complementary fit',
        reason: 'adjacent customer-journey signal'
    },
    same_market: {
        rail: 'Same lane',
        title: 'Same market',
        inside: 'same market',
        reason: 'shared market signal'
    },
    geo_echo: {
        rail: 'Echo',
        title: 'Similar elsewhere',
        inside: 'similar elsewhere',
        reason: 'same-market signal in another town'
    },
    bridge: {
        rail: 'Bridge',
        title: 'Cross-market bridge',
        inside: 'cross-market bridge',
        reason: 'cross-market semantic bridge'
    },
    [UNCLASSIFIED_RELATIONSHIP_ROLE]: {
        rail: 'Unclassified',
        title: 'Unclassified relationship',
        inside: 'unclassified relationship',
        reason: 'missing relationship classification'
    }
});

const ROLE_REASON_REWRITES = Object.freeze([
    [/high-similarity peer in the same business ecosystem/i, 'strong shared-market signal'],
    [/same market signal with local context/i, 'shared local-market signal'],
    [/same market signal across different towns/i, 'same-market signal in another town'],
    [/candidate looks like an input, infrastructure, or support provider/i, 'support or infrastructure signal'],
    [/candidate looks like a customer, beneficiary, or demand-side market/i, 'demand-side market signal'],
    [/construction\/trade work points toward property or rural demand/i, 'property or rural demand signal'],
    [/candidate looks like trade infrastructure for the selected market/i, 'trade infrastructure signal'],
    [/adjacent sectors that often appear in the same customer journey/i, 'adjacent customer-journey signal'],
    [/nearby semantic neighbor with adjacent business signals/i, 'adjacent business signal'],
    [/shared support node in the local semantic neighborhood/i, 'shared local-neighborhood support'],
    [/cross-market semantic bridge/i, 'cross-market semantic bridge']
]);

export function normalizeRelationshipRole(role) {
    const normalized = String(role || '').trim();
    return RELATIONSHIP_ROLE_COPY[normalized] ? normalized : UNCLASSIFIED_RELATIONSHIP_ROLE;
}

export function getRelationshipRoleCopy(role) {
    return RELATIONSHIP_ROLE_COPY[normalizeRelationshipRole(role)];
}

export function getRelationshipRoleLabel(role, surface = 'title') {
    const copy = getRelationshipRoleCopy(role);
    return copy[surface] || copy.title;
}

export function describeRelationshipRoleReason(role, rawReason = '') {
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

export const UNCLASSIFIED_RELATIONSHIP_ROLE = 'unclassified';

const RELATIONSHIP_ROLE_COPY = Object.freeze({
    core_peer: {
        rail: 'Peer',
        title: 'Same beat',
        inside: 'same beat',
        reason: 'Same trail. Same trade.'
    },
    upstream: {
        rail: 'Anchor',
        title: 'Anchors the trail',
        inside: 'anchors the trail',
        reason: 'Holds up the trail here.'
    },
    downstream: {
        rail: 'Served by',
        title: 'Served by trail',
        inside: 'served by trail',
        reason: 'Served by this trail.'
    },
    complement: {
        rail: 'Pairs',
        title: 'Pairs with trail',
        inside: 'pairs with trail',
        reason: 'Same journey, different stop.'
    },
    same_market: {
        rail: 'Same lane',
        title: 'Same lane',
        inside: 'same lane',
        reason: 'Same trade. Same town.'
    },
    geo_echo: {
        rail: 'Echo',
        title: 'Echo elsewhere',
        inside: 'echo elsewhere',
        reason: 'Same trade. Another town.'
    },
    bridge: {
        rail: 'Bridge',
        title: 'Bridges towns',
        inside: 'bridges towns',
        reason: 'Bridges this trail to the next.'
    },
    [UNCLASSIFIED_RELATIONSHIP_ROLE]: {
        rail: 'Trail neighbor',
        title: 'Unclassified',
        inside: 'unclassified',
        reason: 'No clear thread yet.'
    }
});

const ROLE_REASON_REWRITES = Object.freeze([
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

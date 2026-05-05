// js/utils.js — pure utility functions, no global state dependencies
// All needed values come from function parameters.

export function describeCluster(cluster) {
    const CLUSTER_NAMES = [
        'General Business',
        'Professional Services',
        'Food & Hospitality',
        'Construction & Trades',
        'Retail & Shops',
        'Beauty & Wellness',
        'Real Estate & Property',
        'Industrial & Logistics',
        'Agriculture & Ranching',
        'Automotive',
        'Healthcare & Medical',
        'Therapy & Counseling',
        'Education & Childcare',
        'Churches',
        'Faith Ministries',
        'Community Nonprofits',
        'Foundations',
        'Arts & Culture',
        'Economic Development',
        'Public Agencies',
        'Enterprise Brands'
    ];
    return CLUSTER_NAMES[cluster] || 'Other';
}

export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function cleanPublicNoteText(value) {
    return String(value || '')
        .replace(/\*\*/g, '')
        .replace(/\s+/g, ' ')
        .replace(/^[-•*]+\s*/, '')
        .replace(/`+/g, '')
        .trim()
        .replace(/\s+([,.;:!?])/g, '$1');
}

export function isPrivateResearchNote(value) {
    const text = String(value || '').toLowerCase();
    if (!text) return false;
    return [
        'disqualified:',
        'duplicate of lead',
        'double outreach',
        'qualified candidate',
        'during research',
        'public direct email',
        'public contact email',
        'same public contact info',
        'canonical record',
        'no active business presence',
        'contact info found',
        'residential address',
        'keeping a single canonical record'
    ].some((marker) => text.includes(marker));
}

export function sanitizePublicFacingNote(value) {
    const text = cleanPublicNoteText(value);
    if (!text || isPrivateResearchNote(text)) return '';
    return text;
}

export function getBusinessNamePresentation(name) {
    if (name === null || name === undefined) {
        return { display: 'Unknown business', raw: null, showRaw: false };
    }

    let raw = String(name)
        .trim()
        .replace(/^Lead\s+Profile:\s*/i, '');
    raw = raw.replace(/^\d{3,6}[-_]+/, '');
    if (!raw) {
        return { display: 'Unknown business', raw: null, showRaw: false };
    }

    const slugLike = !/\s/.test(raw) && /[-_]/.test(raw);
    let text = raw;

    if (slugLike) {
        text = text.replace(/[-_]+/g, ' ');
    } else {
        text = text.replace(/_+/g, ' ');
    }

    text = text.replace(/([a-z])([A-Z])/g, '$1 $2');

    const attachedSuffixes = ['PLLC', 'LLLP', 'LLC', 'LLP', 'CORP', 'INC', 'LTD', 'PLC', 'LP', 'PC', 'PA', 'CO'];
    attachedSuffixes.forEach((suffix) => {
        text = text.replace(new RegExp(`([A-Za-z])(${suffix})(?=$|\\b|[.,])`, 'g'), `$1 $2`);
    });

    const preserveUpper = new Set([
        'LLC',
        'LLP',
        'LP',
        'INC',
        'LTD',
        'CORP',
        'CO',
        'PLC',
        'PLLC',
        'PC',
        'PA',
        'TX',
        'USA',
        'DBA',
        'CPA',
        'DDS',
        'MD',
        'DO',
        'POA',
        'HOA',
        'HVAC',
        'AC'
    ]);

    const display =
        text
            .replace(/\s+/g, ' ')
            .trim()
            .split(' ')
            .filter(Boolean)
            .map((token) => {
                const parts = token.match(/^([^A-Za-z0-9&]*)([A-Za-z0-9&'.]+)([^A-Za-z0-9&]*)$/);
                if (!parts) return token;
                const [, prefix, core, suffix] = parts;
                const upper = core.toUpperCase();

                let normalizedCore = core;
                if (preserveUpper.has(upper) || /^[A-Z]{2,4}$/.test(core)) {
                    normalizedCore = upper;
                } else if (/^\d+[A-Za-z]+$/.test(core)) {
                    normalizedCore = core.toLowerCase();
                } else if (/^[a-z][a-z0-9&'.]*$/.test(core) || /^[A-Z][A-Z0-9&'.]{3,}$/.test(core)) {
                    normalizedCore = core
                        .toLowerCase()
                        .replace(/(^|['(])([a-z])/g, (_, separator, char) => `${separator}${char.toUpperCase()}`);
                }

                return `${prefix}${normalizedCore}${suffix}`;
            })
            .join(' ') || 'Unknown business';

    const cleanedDisplay = display.replace(/^Lead\s+Profile:\s*/i, '').trim();
    const rawComparable = raw.replace(/\s+/g, ' ').trim().toLowerCase();
    const displayComparable = cleanedDisplay.replace(/\s+/g, ' ').trim().toLowerCase();
    const showRaw = rawComparable !== displayComparable && (slugLike || /[_-]/.test(raw) || /[A-Z]{5,}/.test(raw));

    return { display: cleanedDisplay, raw, showRaw };
}

export function formatBusinessName(name) {
    return getBusinessNamePresentation(name).display;
}

export function cleanOptionalValue(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    if (!text) return null;
    if (['unknown', 'not found', 'none', 'none detected', 'n/a', 'null'].includes(text.toLowerCase())) {
        return null;
    }
    return text;
}

export function parseFiniteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

export function isCompactFocusStageViewport() {
    return window.matchMedia('(max-width: 768px)').matches;
}

export function isCompactMapViewport() {
    // Depends on currentView — caller should pass it as parameter when available
    return window.matchMedia('(max-width: 768px)').matches;
}

export function isCompactSearchViewport() {
    // Depends on currentView — caller should pass it as parameter when available
    return window.matchMedia('(max-width: 768px)').matches;
}

export function stripTerminalPunctuation(text = '') {
    const clean = cleanOptionalValue(text);
    return clean ? clean.replace(/[.\s]+$/g, '') : '';
}

export function pointHasGeocode(point) {
    return Number.isFinite(point?.lat) && Number.isFinite(point?.lng);
}

export function isPointVisible(index, points, activeClusterFilter, activeFilters) {
    if (index < 0 || index >= points.length) return false;
    const point = points[index];
    if (activeClusterFilter !== null && point.cluster !== activeClusterFilter) return false;
    if (activeFilters.status !== 'all' && point.status !== activeFilters.status) return false;
    if (activeFilters.city !== 'all' && normalizeCityForFilter(point.city) !== activeFilters.city) return false;
    if (activeFilters.website && !point.website) return false;
    if (activeFilters.email && !point.email) return false;
    if (activeFilters.geocoded && !pointHasGeocode(point)) return false;
    return true;
}

export function normalizeCityForFilter(city) {
    const clean = cleanOptionalValue(city) || 'Montgomery County';
    if (/[0-9]/.test(clean) || clean.includes('(') || clean.length > 28) {
        return 'Other / Unparsed';
    }
    return clean;
}

export function calculateSignalScore(point) {
    let score = 0;
    if (point.website) score += 1.35;
    if (point.email) score += 1.0;
    if (point.phone) score += 0.45;
    if (pointHasGeocode(point)) score += 1.25;
    if (point.status === 'active') score += 0.55;
    if (point.trivia) score += 0.35;
    return score;
}

const SEARCH_STOP_WORDS = new Set([
    'a',
    'an',
    'and',
    'are',
    'at',
    'by',
    'for',
    'from',
    'in',
    'into',
    'is',
    'me',
    'my',
    'of',
    'on',
    'or',
    'place',
    'places',
    'take',
    'the',
    'to',
    'with',
    'your'
]);

const SEARCH_INTENT_EXPANSIONS = [
    {
        matchAny: ['alcohol', 'booze', 'drink', 'drinks', 'liquor', 'spirits'],
        aliases: [
            'alcohol',
            'liquor',
            'spirits',
            'tequila',
            'whiskey',
            'vodka',
            'beer',
            'wine',
            'brewery',
            'distillery',
            'cocktail',
            'cantina',
            'pub',
            'tavern',
            'bar',
            'lounge',
            'saloon'
        ]
    },
    {
        matchAny: ['dog', 'dogs', 'pet', 'pets', 'puppy', 'animal', 'animals'],
        aliases: [
            'dog',
            'dogs',
            'pet',
            'pets',
            'puppy',
            'animal',
            'animals',
            'grooming',
            'groomer',
            'groomers',
            'kennel',
            'kennels',
            'boarding',
            'daycare',
            'vet',
            'veterinary',
            'wash',
            'trainer',
            'trainers',
            'park'
        ]
    },
    {
        matchPhrases: ['places to take dogs', 'dog friendly', 'take dogs'],
        aliases: [
            'dog',
            'dogs',
            'pet',
            'pets',
            'park',
            'boarding',
            'daycare',
            'wash',
            'grooming',
            'veterinary',
            'vet',
            'trainer'
        ]
    }
];

export function highlightMatch(text, query) {
    if (!text) return '';
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
        text.substring(0, idx) +
        '<mark style="background:rgba(78,205,196,0.3);color:#fff;padding:0 2px;border-radius:2px">' +
        text.substring(idx, idx + query.length) +
        '</mark>' +
        text.substring(idx + query.length)
    );
}

export function tokenizeSearchText(text) {
    return [
        ...new Set(
            (
                String(text || '')
                    .toLowerCase()
                    .match(/[a-z0-9]+/g) || []
            )
                .filter(Boolean)
                .filter((token) => token.length > 1 && !SEARCH_STOP_WORDS.has(token))
        )
    ];
}

export function expandSearchIntent(query, queryTokens) {
    const expanded = new Set(queryTokens);
    const lowerQuery = String(query || '').toLowerCase();

    SEARCH_INTENT_EXPANSIONS.forEach((intent) => {
        const phraseMatch = (intent.matchPhrases || []).some((phrase) => lowerQuery.includes(phrase));
        const tokenMatch = (intent.matchAny || []).some((token) => queryTokens.includes(token));
        if (!phraseMatch && !tokenMatch) return;
        (intent.aliases || []).forEach((alias) => {
            if (alias && !SEARCH_STOP_WORDS.has(alias)) expanded.add(alias);
        });
    });

    return [...expanded];
}

export function countTokenMatches(fieldTokens, queryTokens) {
    let exact = 0;
    let prefix = 0;
    queryTokens.forEach((token) => {
        if (fieldTokens.includes(token)) exact += 1;
        else if (fieldTokens.some((entry) => entry.startsWith(token) || token.startsWith(entry))) prefix += 1;
    });
    return { exact, prefix };
}

export function findClusterByKeyword(keyword) {
    const CLUSTER_NAMES = [
        'General Business',
        'Professional Services',
        'Food & Hospitality',
        'Construction & Trades',
        'Retail & Shops',
        'Beauty & Wellness',
        'Real Estate & Property',
        'Industrial & Logistics',
        'Agriculture & Ranching',
        'Automotive',
        'Healthcare & Medical',
        'Therapy & Counseling',
        'Education & Childcare',
        'Churches',
        'Faith Ministries',
        'Community Nonprofits',
        'Foundations',
        'Arts & Culture',
        'Economic Development',
        'Public Agencies',
        'Enterprise Brands'
    ];
    const lower = keyword.toLowerCase();
    const idx = CLUSTER_NAMES.findIndex((name) => String(name).toLowerCase().includes(lower));
    return idx >= 0 ? idx : null;
}

export function getPublicRecordStatusLabel(status) {
    const normalized = String(status || 'active')
        .trim()
        .toLowerCase();
    if (normalized === 'disqualified') return 'Archive layer';
    return 'County record';
}

export function easeInOutSine(t) {
    return -(Math.cos(Math.PI * t) - 1) / 2;
}

export function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function quadraticBezierComponent(a, b, c, t) {
    const inverse = 1 - t;
    return inverse * inverse * a + 2 * inverse * t * b + t * t * c;
}

export function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function easeOutQuint(t) {
    return 1 - Math.pow(1 - t, 5);
}

export function clampNumber(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

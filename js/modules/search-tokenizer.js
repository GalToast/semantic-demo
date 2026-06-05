/**
 * search-tokenizer.js
 *
 * Pure functions and constants for search query tokenization and intent expansion.
 */

const SEARCH_STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'at', 'by', 'for', 'from', 'in', 'into', 'is', 'me', 'my', 'of', 'on', 'or', 'place', 'places', 'take', 'the', 'to', 'with', 'your'
]);

const SEARCH_INTENT_EXPANSIONS = [
    {
        matchAny: ['alcohol', 'booze', 'drink', 'drinks', 'liquor', 'spirits'],
        aliases: [
            'alcohol', 'liquor', 'spirits', 'tequila', 'whiskey', 'vodka', 'beer', 'wine', 'brewery',
            'distillery', 'cocktail', 'cantina', 'pub', 'tavern', 'bar', 'lounge', 'saloon'
        ]
    },
    {
        matchAny: ['dog', 'dogs', 'pet', 'pets', 'puppy', 'animal', 'animals'],
        aliases: [
            'dog', 'dogs', 'pet', 'pets', 'puppy', 'animal', 'animals', 'grooming', 'groomer', 'groomers',
            'kennel', 'kennels', 'boarding', 'daycare', 'vet', 'veterinary', 'wash', 'trainer', 'trainers', 'park'
        ]
    },
    {
        matchPhrases: ['places to take dogs', 'dog friendly', 'take dogs'],
        aliases: [
            'dog', 'dogs', 'pet', 'pets', 'park', 'boarding', 'daycare', 'wash', 'grooming', 'veterinary', 'vet', 'trainer'
        ]
    }
];

export function tokenizeSearchText(text) {
    // Normalize to NFC first so combining characters (e.g. e + ◌́ = é) are
    // merged with their base code-point.  Without this, the regex fallback
    // would split "café" (NFD) into "caf" and "e", producing false matches.
    const input = String(text || '').normalize('NFC').toLowerCase();

    let words;
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        // Word-level segmentation respects grapheme boundaries, so
        // multi-code-point characters like "é" (whether NFC or NFD) are
        // kept as a single token.
        const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
        words = Array.from(segmenter.segment(input))
            .filter((s) => s.isWordLike)
            .map((s) => s.segment);
    } else {
        // Fallback for environments without Intl.Segmenter — the NFC
        // normalization above already prevents most splitting issues.
        words = input.match(/[a-z0-9]+/g) || [];
    }

    return [
        ...new Set(
            words
                .filter(Boolean)
                .filter((token) => token.length > 1 && !SEARCH_STOP_WORDS.has(token))
        )
    ];
}

export function expandSearchIntent(query, queryTokens) {
    const safeQueryTokens = Array.isArray(queryTokens) ? queryTokens : [];
    const expanded = new Set(safeQueryTokens);
    const lowerQuery = String(query || '').toLowerCase();

    SEARCH_INTENT_EXPANSIONS.forEach((intent) => {
        const phraseMatch = (intent.matchPhrases || []).some((phrase) => lowerQuery.includes(phrase));
        const tokenMatch = (intent.matchAny || []).some((token) => safeQueryTokens.includes(token));
        if (!phraseMatch && !tokenMatch) return;
        (intent.aliases || []).forEach((alias) => {
            if (alias && !SEARCH_STOP_WORDS.has(alias)) expanded.add(alias);
        });
    });

    return [...expanded];
}

export function countTokenMatches(fieldTokens, queryTokens) {
    if (!Array.isArray(fieldTokens)) fieldTokens = [];
    if (!Array.isArray(queryTokens)) queryTokens = [];
    let exact = 0,
        prefix = 0;
    queryTokens.forEach((token) => {
        if (fieldTokens.includes(token)) exact += 1;
        else if (fieldTokens.some((e) => e.startsWith(token) || token.startsWith(e))) prefix += 1;
    });
    return { exact, prefix };
}

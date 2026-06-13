/**
 * search-tokenizer.ts
 *
 * Pure functions and constants for search query tokenization and intent expansion.
 * Typed sibling of search-tokenizer.js.
 */

const SEARCH_STOP_WORDS: ReadonlySet<string> = new Set([
    'a', 'an', 'and', 'are', 'at', 'by', 'for', 'from', 'in', 'into', 'is', 'me', 'my', 'of', 'on', 'or', 'place', 'places', 'take', 'the', 'to', 'with', 'your'
]);

interface IntentExpansion {
    matchAny?: string[];
    matchPhrases?: string[];
    aliases: string[];
}

const SEARCH_INTENT_EXPANSIONS: readonly IntentExpansion[] = [
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

export function tokenizeSearchText(text: unknown): string[] {
    // Normalize to NFC first so combining characters (e.g. e + ◌́ = é) are
    // merged with their base code-point.  Without this, the regex fallback
    // would split "café" (NFD) into "caf" and "e", producing false matches.
    //
    // Pre-process special chars BEFORE word segmentation so they don't
    // become part of tokens (e.g., "O'Brien" → "obrien", "AT&T" → "att",
    // "co-op" → "co op").  This keeps query tokens aligned with field tokens
    // that won't carry punctuation.
    const input: string = String(text || '')
        .normalize('NFC')
        .toLowerCase()
        .replace(/[''\u2019]/g, '')          // strip smart/straight quotes
        .replace(/[&]/g, ' ')               // ampersand → space
        .replace(/[/\\]/g, ' ')             // slash/backslash → space
        .replace(/[-_]+/g, ' ')             // hyphens/underscores → space
        .replace(/[@#]/g, ' ')              // at/hash → space
        .replace(/\s+/g, ' ')               // collapse all whitespace
        .trim();

    if (!input) return [];

    let words: string[];
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
        words = input.match(/[\p{L}0-9]+/gu) || [];
    }

    return [
        ...new Set(
            words
                .filter(Boolean)
                .filter((token) => token.length > 1 && !SEARCH_STOP_WORDS.has(token))
        )
    ];
}

export function expandSearchIntent(query: unknown, queryTokens: unknown): string[] {
    const safeQueryTokens: string[] = Array.isArray(queryTokens) ? queryTokens : [];
    const expanded: Set<string> = new Set(safeQueryTokens);
    const lowerQuery: string = String(query || '').toLowerCase();

    SEARCH_INTENT_EXPANSIONS.forEach((intent: IntentExpansion) => {
        const phraseMatch: boolean = (intent.matchPhrases || []).some((phrase: string) => lowerQuery.includes(phrase));
        const tokenMatch: boolean = (intent.matchAny || []).some((token: string) => safeQueryTokens.includes(token));
        if (!phraseMatch && !tokenMatch) return;
        (intent.aliases || []).forEach((alias: string) => {
            if (alias && !SEARCH_STOP_WORDS.has(alias)) expanded.add(alias);
        });
    });

    return [...expanded];
}

interface TokenMatchCounts {
    exact: number;
    prefix: number;
}

export function countTokenMatches(fieldTokens: unknown, queryTokens: unknown): TokenMatchCounts {
    if (!Array.isArray(fieldTokens)) fieldTokens = [];
    if (!Array.isArray(queryTokens)) queryTokens = [];
    let exact = 0,
        prefix = 0;
    (queryTokens as string[]).forEach((token: string) => {
        if ((fieldTokens as string[]).includes(token)) exact += 1;
        else if ((fieldTokens as string[]).some((e: string) => e.startsWith(token) || token.startsWith(e))) prefix += 1;
    });
    return { exact, prefix };
}

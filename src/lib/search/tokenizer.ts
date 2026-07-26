/**
 * @lib/search/tokenizer.ts — Search query tokenization and intent expansion
 *
 * Port of
 *
 * Unicode fix: the legacy regex /[a-z0-9]+/g only matched ASCII letters,
 * silently dropping accented characters in business names like "Fiancée".
 * The new regex uses Unicode property escapes (\p{L}) so all letter
 * characters are tokenized correctly regardless of script.
 */

export interface IntentExpansion {
    matchAny?: readonly string[]
    matchPhrases?: readonly string[]
    aliases: readonly string[]
}

export interface TokenMatchResult {
    exact: number
    prefix: number
}

/** English-only stop words.
 *
 * Intentionally monolingual until i18n support is required. The current dataset
 * (Montgomery County TX businesses) is US-English dominant, and adding per-locale
 * stop-word lists would be scope-creep without a concrete i18n requirement.
 * When i18n is added, this set should become a locale-keyed map and
 * `tokenizeSearchText` should accept an optional locale parameter. */
export const SEARCH_STOP_WORDS: ReadonlySet<string> = new Set([
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
])

export const SEARCH_INTENT_EXPANSIONS: readonly IntentExpansion[] = [
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
] as const

// Detect-once flag: Intl.Segmenter is not available in all environments
// (older browsers, some jsdom/test runners).  A single check at module init
// avoids re-evaluating the condition on each call, ensuring the chosen
// word-segmentation path is deterministic for the lifetime of the module.
const _hasIntlSegmenter = typeof Intl !== 'undefined' && !!Intl.Segmenter

export function tokenizeSearchText(text: unknown, stopWords: ReadonlySet<string> = SEARCH_STOP_WORDS): string[] {
    // Pre-process special chars BEFORE word segmentation so they don't
    // become part of tokens (e.g., "O'Brien" → "obrien", "AT&T" → "att",
    // "co-op" → "co op").  This keeps query tokens aligned with field tokens
    // that won't carry punctuation.
    const input = String(text || '')
        .normalize('NFC')
        .toLowerCase()
        .replace(/[''\u2019]/g, '') // strip smart/straight quotes
        .replace(/[&]/g, ' ') // ampersand → space
        .replace(/[/\\]/g, ' ') // slash/backslash → space
        .replace(/[-_]+/g, ' ') // hyphens/underscores → space
        .replace(/[@#]/g, ' ') // at/hash → space
        .replace(/\s+/g, ' ') // collapse all whitespace
        .trim()

    if (!input) return []

    // Word-level segmentation via Intl.Segmenter when available — respects
    // grapheme boundaries so multi-code-point characters (NFC or NFD) stay
    // as single tokens. Falls back to the Unicode-aware regex path.
    // The detect-once flag (`_hasIntlSegmenter`) is set at module init so the
    // chosen path is stable for the module's lifetime.
    let words: string[]
    if (_hasIntlSegmenter) {
        const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })
        words = Array.from(segmenter.segment(input) as Iterable<{ segment: string; isWordLike: boolean }>)
            .filter((s) => s.isWordLike)
            .map((s) => s.segment)
    } else {
        words = (input.match(/[\p{L}0-9]+/gu) || []) as string[]
    }

    return [...new Set(words.filter(Boolean).filter((token) => token.length > 1 && !stopWords.has(token)))]
}

export function expandSearchIntent(query: unknown, queryTokens: readonly string[]): string[] {
    const safeQueryTokens = Array.isArray(queryTokens) ? queryTokens : []
    const expanded = new Set<string>(safeQueryTokens)
    const lowerQuery = String(query || '').toLowerCase()

    for (const intent of SEARCH_INTENT_EXPANSIONS) {
        const phraseMatch = (intent.matchPhrases ?? []).some((phrase) => lowerQuery.includes(phrase))
        const tokenMatch = (intent.matchAny ?? []).some((token) => safeQueryTokens.includes(token))
        if (!phraseMatch && !tokenMatch) continue
        for (const alias of intent.aliases) {
            if (alias && !SEARCH_STOP_WORDS.has(alias)) expanded.add(alias)
        }
    }

    return [...expanded]
}

export function countTokenMatches(fieldTokens: readonly string[], queryTokens: readonly string[]): TokenMatchResult {
    const safeField = Array.isArray(fieldTokens) ? fieldTokens : []
    const safeQuery = Array.isArray(queryTokens) ? queryTokens : []
    let exact = 0
    let prefix = 0
    for (const token of safeQuery) {
        if (safeField.includes(token)) exact += 1
        else if (safeField.some((e) => e.startsWith(token) || token.startsWith(e))) prefix += 1
    }
    return { exact, prefix }
}

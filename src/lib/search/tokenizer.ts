/**
 * @lib/search/tokenizer.ts — Search query tokenization and intent expansion
 *
 * Port of js/modules/search-tokenizer.js
 *
 * Unicode fix: the legacy regex /[a-z0-9]+/g only matched ASCII letters,
 * silently dropping accented characters in business names like "Fiancée".
 * The new regex uses Unicode property escapes (\p{L}) so all letter
 * characters are tokenized correctly regardless of script.
 */

export interface IntentExpansion {
	matchAny?: readonly string[];
	matchPhrases?: readonly string[];
	aliases: readonly string[];
}

export interface TokenMatchResult {
	exact: number;
	prefix: number;
}

export const SEARCH_STOP_WORDS: ReadonlySet<string> = new Set([
	'a', 'an', 'and', 'are', 'at', 'by', 'for', 'from',
	'in', 'into', 'is', 'me', 'my', 'of', 'on', 'or',
	'place', 'places', 'take', 'the', 'to', 'with', 'your'
]);

export const SEARCH_INTENT_EXPANSIONS: readonly IntentExpansion[] = [
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
			'dog', 'dogs', 'pet', 'pets', 'puppy', 'animal', 'animals', 'grooming', 'groomer',
			'groomers', 'kennel', 'kennels', 'boarding', 'daycare', 'vet', 'veterinary', 'wash',
			'trainer', 'trainers', 'park'
		]
	},
	{
		matchPhrases: ['places to take dogs', 'dog friendly', 'take dogs'],
		aliases: [
			'dog', 'dogs', 'pet', 'pets', 'park', 'boarding', 'daycare', 'wash',
			'grooming', 'veterinary', 'vet', 'trainer'
		]
	}
] as const;

export function tokenizeSearchText(
	text: unknown,
	stopWords: ReadonlySet<string> = SEARCH_STOP_WORDS
): string[] {
	return [
		...new Set(
			(String(text || '')
				.normalize('NFC')
				.toLowerCase()
				.match(/[\p{L}0-9]+/gu) || []) as string[]
		)
	]
		.filter(Boolean)
		.filter((token) => token.length > 1 && !stopWords.has(token));
}

export function expandSearchIntent(
	query: unknown,
	queryTokens: readonly string[]
): string[] {
	const safeQueryTokens = Array.isArray(queryTokens) ? queryTokens : [];
	const expanded = new Set<string>(safeQueryTokens);
	const lowerQuery = String(query || '').toLowerCase();

	for (const intent of SEARCH_INTENT_EXPANSIONS) {
		const phraseMatch = (intent.matchPhrases ?? []).some((phrase) => lowerQuery.includes(phrase));
		const tokenMatch = (intent.matchAny ?? []).some((token) => safeQueryTokens.includes(token));
		if (!phraseMatch && !tokenMatch) continue;
		for (const alias of intent.aliases) {
			if (alias && !SEARCH_STOP_WORDS.has(alias)) expanded.add(alias);
		}
	}

	return [...expanded];
}

export function countTokenMatches(
	fieldTokens: readonly string[],
	queryTokens: readonly string[]
): TokenMatchResult {
	const safeField = Array.isArray(fieldTokens) ? fieldTokens : [];
	const safeQuery = Array.isArray(queryTokens) ? queryTokens : [];
	let exact = 0;
	let prefix = 0;
	for (const token of safeQuery) {
		if (safeField.includes(token)) exact += 1;
		else if (safeField.some((e) => e.startsWith(token) || token.startsWith(e))) prefix += 1;
	}
	return { exact, prefix };
}

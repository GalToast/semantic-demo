/**
 * @lib/search/index.ts — Barrel export for search modules
 */

export {
	SEARCH_STOP_WORDS,
	SEARCH_INTENT_EXPANSIONS,
	tokenizeSearchText,
	expandSearchIntent,
	countTokenMatches
} from './tokenizer';
export type { IntentExpansion, TokenMatchResult } from './tokenizer';

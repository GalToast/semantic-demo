/**
 * search-tokenizer.js — Delegation shim to canonical src/lib implementation.
 *
 * Legacy tests import from js/modules/search-tokenizer.js.
 * All logic lives in src/lib/search/tokenizer.ts.
 */
export {
  SEARCH_STOP_WORDS,
  SEARCH_INTENT_EXPANSIONS,
  tokenizeSearchText,
  expandSearchIntent,
  countTokenMatches,
} from '../../src/lib/search/tokenizer.ts';

You are a bug-hunting specialist. Read the following files thoroughly and identify real bugs, not style issues. Focus on: async race conditions (stale fetch responses overwriting newer ones), missing error handling in promise chains, state inconsistencies between search and UI, DOM injection without sanitization, and query tokenization edge cases.

Files to read:
- js/modules/search-state.js
- js/modules/semantic-search-api-cache.js
- js/modules/semantic-search-mock-catalog.js
- js/modules/semantic-search-scoring.js
- js/modules/semantic-search-cache.js
- js/modules/ui-renderers.js

For each bug found report:
1. File path and line number range
2. Bug category (race condition, unhandled error, XSS, logic error, etc.)
3. Severity (critical/high/medium/low)
4. Description of the bug and what goes wrong
5. Suggested fix (1-2 sentences)

Only report REAL bugs that cause incorrect behavior, crashes, or security issues at runtime. Do NOT report style issues, missing comments, or cosmetic observations. Return your findings as a structured list.

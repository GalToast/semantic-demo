# Retired Artifacts - 2026-06-13

This folder preserves stray working-tree artifacts retired during the Semantic Explorer Svelte/TypeScript migration checkpoint.

These files were archived instead of deleted outright:

- `tests/unit/search-cache-key.test.mjs` - orphaned `node:test` duplicate of the canonical Vitest test in `tests/unit-active/search-cache-key.test.ts`.
- `svelte-check` - zero-byte stray artifact.
- `semantic-explorer@1.0.0` - zero-byte stray artifact.
- `build_output.txt` - one-off build log.
- `tmp-bundle-scan.ps1` - one-off bundle diagnostic script.

Active verification after archival should continue to use:

- `npm run test:unit`
- `npm run test:unit:legacy`
- `npm run test`
- `npm run qa:contract:all`

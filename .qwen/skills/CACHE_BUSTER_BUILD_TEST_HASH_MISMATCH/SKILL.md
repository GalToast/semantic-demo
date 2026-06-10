---
name: Cache Buster Build-Test Hash Mismatch
description: When cache-buster tests report stale hashes after a clean build, the root cause is often that the build pipeline and the test pipeline invoke esbuild with different options/plugins, producing different output even from identical source.
source: auto-skill
extracted_at: '2026-06-08T16:09:25.446Z'
---

# Cache Buster Build-Test Hash Mismatch

Use when `npm run build && npm run refresh:cache` produces a cache-buster mismatch that "should" be fixed but isn't — or when fixing it makes the failure mode change from "stale" to "mismatched."

## Core Lesson

`npm run build` and `tests/cache-buster-check.js:verifyBundleFresh` both invoke esbuild to check freshness, but they may run with **different plugins or post-processing**. This means:

- Build hash ≠ Test hash ≠ Source hash
- `npm run refresh:cache` aligns CSS/HTML cache busters to the **test's** hash
- Next `npm run build` produces a **different** hash (because build has extra plugins)
- Result: cache busters forever chase a hash that changes every build

## How to Detect

### Symptom 1: "Stale bundle" → "Cache buster mismatched"
After `npm run build && npm run refresh:cache`:
```
- dist/bundle.js is stale relative to js/modules/app.ts and its imports; expected build hash X, found Y.
```
becomes:
```
- dist/bundle.js cache buster must be X, found Y.
```
The hash X or Y keeps changing. This means the test's esbuild output differs from the build's esbuild output.

### Symptom 2: Test says "Run npm run build, then npm run refresh:cache" but that doesn't fix it
The test's own error message is a trap — it assumes build and test produce the same hash.

## Root Cause Checklist

1. **Build has plugins the test doesn't**: e.g., `semantic-demo-bundle-hygiene` plugin that normalizes trailing whitespace via `onEnd`.
2. **Test has different esbuild options**: e.g., `minify`, `keepNames`, `target`, `format`, or missing plugins.
3. **Normalization runs in one path but not the other**: `normalizeGeneratedBundleText()` (trailing whitespace strip) is the most common culprit.
4. **Build writes back to the bundle** (`.onEnd`) but the test also writes back (`.finally`), causing a toggle between two hashes.

## Self-resolving transient mismatch (2026-06-10 observation)

In some cases the mismatch is transient and self-resolving:
- After `npm run build`, the test reports a stale hash.
- After `npm run refresh:cache` (which updates HTML/CSS cache busters), the next `npm run build` produces a hash that **does** match the test's expectation.
- The resolution happens because `refresh:cache` bumped surrounding assets, changing the effective input set so the scoped hash reads as current on the next build.

Detection signal:
- Failure alternates between "stale" and "mismatched" across build/refresh cycles, but settling after one refresh+rebuild cycle.
Root cause is still build/test hash divergence; use the patterns below to align the pipelines, or treat the refresh+rebuild cycle as the accepted cleanup pattern if that's the repo's convention.

## Fix Strategy

### Preferred: Make test use the SAME esbuild pipeline as build

The test should either:
- Import and reuse the build's `options` object (or a shared config function)
- Import the same `onEnd`/`onLoad` plugins
- Call the same `normalizeGeneratedBundle()` function

For `tests/cache-buster-check.js`:
1. Read `scripts/build-app.mjs` to identify what plugins/options the build uses
2. Mirror those in the test's `esbuild.build()` call
3. Ensure `normalizeGeneratedBundle()` runs in both paths

### Fallback: Make test deterministic without matching build exactly

If mirroring is too complex:
1. Add the missing normalization to the test's `onEnd`:
   ```js
   {
     name: 'semantic-demo-bundle-hygiene',
     setup(build) {
       build.onEnd(async (result) => {
         if (result.errors.length === 0) {
           const text = await fs.promises.readFile(currentBundlePath, 'utf8');
           const normalized = normalizeGeneratedBundleText(text);
           if (normalized !== text) await fs.promises.writeFile(currentBundlePath, normalized);
         }
       });
     }
   }
   ```
2. Ensure the test computes the hash from the **same output** it writes back.

## Verification Protocol

1. Run `npm run build` manually, note the bundle hash: `sha256sum dist/bundle.js | head -c 12`
2. Run `npm run check:cache` (not `refresh:cache`), capture the expected vs found hashes
3. If they differ, diff the esbuild options between `scripts/build-app.mjs` and `tests/cache-buster-check.js`
4. Apply the fix, re-run `npm run build`, then `npm run check:cache` — both should pass without `refresh:cache`

## What NOT to Do

- **Do NOT run `npm run refresh:cache` to "fix" a build-test hash mismatch.** It aligns to the test's hash, which is wrong if the test's esbuild options differ from the build's.
- **Do NOT change the build's plugins to match the test.** The build is the source of truth; the test should match the build.
- **Do NOT assume the error message is self-fixing.** The test's "Run npm run build" hint assumes parity that may not exist.

## Related Patterns

- **Falsification check**: Before fixing a cache-buster issue, verify whether the failure is actually a hash mismatch or a different bug (e.g., entry path typo, missing file, stale reference)
- **Build entry path drift**: `app.ts` may be deleted from git but present on disk; `app.js` may be the actual entry. Verify both exist before assuming one is wrong.

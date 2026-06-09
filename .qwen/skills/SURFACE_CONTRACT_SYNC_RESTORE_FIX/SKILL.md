---
name: SURFACE_CONTRACT_SYNC_RESTORE_FIX
description: Fix surface contract failures caused by URL/anchor-dependent Svelte state restoring too late, by adding one early synchronous restore path and removing any duplicate later restore that would double-populate the same stores.
source: auto-skill
extracted_at: '2026-06-09T18:55:37.726Z'
---

# Surface Contract Sync Restore Fix

## When to use

- A surface contract queries DOM immediately after load.
- The query depends on state derived from URL params such as `anchor`, `q`, or restored navigation/trail/focus.
- Source already contains the expected DOM element, but the element is not present during contract query time.
- Prior fixes added a synchronous publish/dispatch for URL restore, and later source inspection reveals another redundant publish/dispatch that can create duplicate state changes.

## Core pattern

1. Preserve the fallback or secondary restore dispatcher only if it is actually needed as a safety net.
2. Verify the current source does not contain a duplicate restore that fires after the early synchronous restore.
3. If a duplicate exists, remove it and keep the contract-gating early/sync restore as the single source of truth for that state initialization.

## Applied example

The map-trail surface failed because contract tests queried DOM after load before async `initData`/`applyUrlState` finished. Fixes already in place included:
- early URL-anchor publish before mount so `hasTrail()` is true for `dom:route-dots`
- URL restore dispatch inside search restoration
- missing overlay element added for `dom:trail-review-overlay`

The extra improvement on review was to remove the later duplicate `onMount` numeric-anchor publish from `src/App.svelte` so the URL restore path is not executed twice from two separate places.

## Verification steps

- Run `npm run check:svelte`
- Run `npm run build:svelte`
- Run the affected contract command, e.g. `npm run qa:contract:map-trail -- http://127.0.0.1:4175/?nodemo=1 --headless`
- Confirm the previously failing assertions now pass and no duplicate state changes are introduced
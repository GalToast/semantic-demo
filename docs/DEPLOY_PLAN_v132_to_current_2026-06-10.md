# Deploy Plan: v132 → current (2026-06-10)

## Context

The semantic-demo at `mccullough.cloud/semantic-demo/` still serves Bundle v132 from 2026-06-04 (per `CHANGELOG.md` and `DEPLOY_STATUS.md` — v132's own entry is marked "Committed, not yet deployed"). HEAD has accumulated ~100 commits since then. This plan captures the gap and the recommended sequence for landing everything.

## What's between v132 and current HEAD

The most consequential commits waiting to deploy (not exhaustive):

- **dde6e09** — feat(ts): add src/lib/ ports for map-state, focus-pocket, journey, cluster-labels (1525 insertions)
- **3729515** — fix(types): tighten FocusCameraState, semantic-search-cache, semantic-lane casts
- **4fecaf1** — Wire bridge adapters to TS engine ports, reduce legacy module loading
- **422add9** — Archive legacy JS modules before Phase 5B deletion
- **47a4e06** — Add TS engine ports: three-engine, camera-controls, node-manager, thread-manager
- **e109518** — Phase 5-6 Svelte migration: engine TS ports, bridge slim-down, build pass
- **102ac82** — fix(types): cast semanticSearchResultCache — 146→58 svelte-check errors
- **03a2485** — fix(types): add SemanticState index signature, Window augmentations — svelte-check 230→167
- **7761f6c** — feat(security,deploy): move backups outside public_html, add CSP header with importmap hash
- **Multiple `ts(strict)` batches** — removing `@ts-nocheck` from dozens of TS shadows
- **Multiple `fix(contracts)`** — assertion needle updates for TS migration
- **Multiple `fix(svelte,e2e)`** — render SearchBar on initial idle surface, restore view-toggle/share/reset controls
- **Scaffold expansion** — JourneyChrome, SearchChrome, FilterChrome, LegacyCompassSurface Svelte components

The 2026-06-09 svelte-check completion assessment said 132/0 contract surfaces green with TS migration "functionally complete" — the migration is landing in waves that are already on master.

## Build / deploy state at this writing

- `dist/svelte/index.html` last built: 1:18 PM 2026-06-10
- HEAD commit (dde6e09): 12:46 PM 2026-06-10
- **Build is current for HEAD + local worker edits.** `npm run check` rebuilt `dist/svelte/` successfully.
- Working tree: 33 modified tracked files plus this untracked deploy plan. The temporary Python log parsers were removed, and no external-subagent workers are currently running.
- Verification: `npm run check` passes (`svelte-check` 0 errors/0 warnings + Vite build). `npm run lint` passes with 101 known test warnings and 0 errors. `npm run check:shell`, `npm run check:cache`, and `npm run check:ts-progress` also pass.
- Entry-contract note: `check:shell` and deploy scripts confirm production is `src/index.html` -> `dist/svelte/index.html`; `check:ts-progress` still reports `js/modules/app.ts` for the separate legacy/native TS bundle readiness lane (`scripts/build-app.mjs`), not the deployed shell.
- Live server: still on v132 from 2026-06-04 (6 days stale).

## Shell Contract: Production QA vs Legacy Reference QA

**Critical distinction for QA and contract testing:**

| Shell | Path | What it loads | Deployed to live? | QA Target |
|-------|------|---------------|-------------------|-----------|
| **Svelte Production Shell** | `src/index.html` → `dist/svelte/index.html` | Vite-built Svelte 5 app (content-hashed assets) | **YES** — published as **both** `/semantic-demo/index.html` AND `/semantic-demo/vector-explorer-polished.html` | **Primary QA target** — `dist/svelte/index.html` (local build output) |
| **Legacy Reference Shell (repo)** | `vector-explorer-polished.html` (repo root) | `dist/bundle.js` (esbuild legacy bundle with inlined Svelte) | **NO** — overwritten by deploy scripts with the Svelte production shell | **Reference only** — for rollback comparison, NOT for production QA |

**Why this matters:**
- The repo's `vector-explorer-polished.html` still references `dist/bundle.js` and serves as a rollback reference.
- The **deployed** `/semantic-demo/vector-explorer-polished.html` is **identical to** `dist/svelte/index.html` (the Svelte production shell) — the deploy scripts copy the Vite build output to both URLs.
- All production QA (contract tests, visual QA, e2e) should target `dist/svelte/index.html` (local build) or the live deployed URLs, **not** the repo's legacy reference shell.
- `tests/shell-contract-check.js` validates the production shell contract (`src/index.html` → `dist/svelte/index.html`) and confirms the repo legacy shell still references `dist/bundle.js` as a rollback reference.

## Risk: this is a major version bump, not a hotfix

A single deploy would land:

1. **Full Svelte shell cutover** — the live app is now `dist/svelte/index.html` (Vite-built from `src/index.html`), published as both `/semantic-demo/index.html` and `/semantic-demo/vector-explorer-polished.html`. v132 was the first wave of Svelte islands; the post-v132 commits expand that substantially.
2. **TS migration near-completion** — large refactors of state, lifecycle, camera, three-engine. Multiple strictness-removal batches. New typed `types/state.d.ts` consumed across the codebase.
3. **100+ commits with no intermediate bundle tags** — there is no v133, v134, etc. The CHANGELOG.md jumps from v132 to "next" in one step.
4. **33 dirty tracked files from settled worker/main-lane edits** — these are not committed and not on the live server, but they are real source state.

This is closer to a v-next release than a patch. Treat it accordingly.

## Recommended sequence

1. **Classify the dirty tree.** Decide which local source edits are production fixes and which `.commandcode` taste notes are local workflow preference changes.
2. **Commit any safe remaining parallel work** if the user wants it included in this deploy. Anything not committed won't reach the live server.
3. **Run `npm run build` or `npm run check`** to refresh `dist/svelte/`. Verify the new mtime is later than the latest committed work.
4. **Run `npm run check:shell`** — `tests/shell-contract-check.js` validates the canonical shell contract. Deploy script also runs this.
5. **Run `npm run check:cache`** — `tests/cache-buster-check.js` validates cache busters. Deploy script also runs this.
6. **Run `npm run deploy:dryrun`** — preview the exact payload that will be SCP'd to `mccullough-cloud:public_html/semantic-demo/`. Look for: stale files left over from a prior deploy that should be cleaned up; missing files the new code expects; cache-buster hashes that no longer match the source.
7. **Run `npm run deploy`** (or `bash deploy.sh` on Linux). This:
   - Creates a remote rollback backup at `/home/u741831384/backups/semantic-demo/deploy-<timestamp>/`
   - SCPs the explicit payload (no wildcards): `index.html` (×2 URLs), `assets/`, `css/`, root CSS, `data.dat`, `data.dat.gz`, `semantic_threads*.dat`, `semantic_space_layout_manifest.json`, `scripts/leadEnrichment.public.json`, `.htaccess`
   - Syncs `../js/scanner.js` to both `/js/` and `/semantic-demo/js/` (skipped silently if sibling absent)
   - Sets chmod 644 on files, 755 on directories
8. **Manual post-deploy smoke** at:
   - `https://mccullough.cloud/semantic-demo/`
   - `https://mccullough.cloud/semantic-demo/vector-explorer-polished.html`

   Per DEPLOY.md, verify: search clear behavior, URL cleanup, console/network health, 3D Trail mode markers.

## Optional: split into intermediate bundles

If the v132 → current jump feels too big, consider landing intermediate bundles:

- **v133**: Just the Svelte shell expansion (JourneyChrome complete, SearchChrome islands, FilterChrome islands) — that's `03a25bd` + `c04c3b1` + `e40e496` from the commit history. Lower risk, gives the live a working Svelte shell before the TS migration lands.
- **v134**: TS port stages 3b/3c/4a/4b/5a + barrel shims — `790f746`, `e4a3762`, `5c35c06`, `c310334`. Bigger, but mostly behind the scenes.
- **v135**: Type-safety and strictness removal — `66a660d`, `9a546b9`, `03a2485`, `102ac82`, `0421b9c`, `3729515`. Lighter on UI but heavy on svelte-check delta.
- **v136**: The current dde6e09 ports + whatever else is pending.

This is a release-engineering decision, not a code one. The user can choose to do it as one bundle (faster, higher risk) or split it (slower, lower risk per bundle, more deploys).

## Rollback

Each deploy prints the exact rollback command. It restores the `index.html`, `vector-explorer-polished.html`, root CSS files, `data.dat`, `data.dat.gz`, `semantic_threads*.dat`, `semantic_space_layout_manifest.json`, `scripts/leadEnrichment.public.json`, `assets/`, `css/`, `.htaccess`, and `js/scanner.js` from the backup directory. Restore is a single SSH + cp command — fast and idempotent.

## Open questions for the user

1. **Is the dirty working tree expected to be deployed, or is it WIP that should stay local?** The deploy pipeline will pick up everything in the working tree. If the dirty files are not intended for this deploy, the user should commit the desired subset and keep the rest out of the release build.
2. **Single bundle or split into v133/v134/v135?** This is a release plan question.
3. **Should the deploy happen now (with risks) or in a fresh session with a clean tree?** Now means the local dirty files are baked in. Fresh session means the work is committed first.

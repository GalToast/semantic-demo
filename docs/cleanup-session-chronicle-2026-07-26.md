# Cleanup Session Chronicle — 2026-07-26

## Context

Follow-up session to the 2026-07-25 Wave-3 race-fix session (HEAD `c4201964`).
Parallel session (Fred) actively committing throughout — HEAD moved from `c6f5bdd4`
to `c0ffc2c7` during this session (4+ parallel commits: Track A F2 demo-replay,
v2-failover Sprint-6, contract tests, campaign docs). 84+ parallel-WIP uncommitted
files preserved untouched.

## A — Full vitest sweep (verification, main-lane)

Ran `npx vitest run` against merged HEAD. **243 test files passed, 3122 tests passed
(4 todo), exit 0, 136s.** No parallel collisions broke anything. The Wave-3 race fix
(`c4201964`) + parallel's aligned regression test (`c9b9db4b`) are green together.

## B — pi-lens prettier-config investigation (main-lane, RESOLVED — not a bug)

**Finding**: The "pi-lens LSP daemon strips trailing commas + collapses multi-liners"
drift observed during the Wave-3 fix is **NOT a bug** — the daemon is correctly
enforcing the project's own `.prettierrc`:

```json
{ "singleQuote": true, "semi": false, "trailingComma": "none", "printWidth": 120, "tabWidth": 4, "useTabs": false }
```

`eslint.config.js` loads `eslint-config-prettier` (disables all conflicting rules) +
has NO `comma-dangle` rule. The daemon's churn on `keyboard-hint-panel-journey.spec.js`
during Wave-3 was a one-time correction of non-compliant pre-existing lines (the spec
had trailing commas from an earlier author). After commit `c4201964`, that file is
fully prettier-compliant (`prettier --check` confirms: "All matched files use Prettier
code style!").

**Residual**: 44 OTHER spec.js files in `tests/` are still non-compliant
(`keyboard-lock.spec.js`, `micro-demo.spec.js`, `live-reset-proof.spec.js`, etc.).
Those are the drift-risk files for future edits. Fix is routine: `npm run format`
(prettier --write on `{js,tests}/**/*.{js,ts,css}`) — but 3 of them are parallel WIP,
so a broad format sweep risks collision. Defer to a coordinated moment or format
per-file as touched.

**Correction to 2026-07-25 chronicle**: The prior chronicle's "Discovered facts" entry
claiming "pi-lens daemon auto-formats to 4-space + no-semi, opposite of the project
canonical 2-space + semicolon" is **factually wrong** — the project's `.prettierrc`
IS 4-space + no-semi. The daemon is aligned. (Memory saved as
`pi-lens-prettier-churn-not-a-bug`.)

## C — Manifest orphans cleanup (Subagent A, deepseek-v4-flash-free, COMPLETED)

Dispatched Subagent A (`ocw_c1d944cb`, `opencode-zen/deepseek-v4-flash-free`, 600s)
to clean up `tests/contracts.manifest.json` orphans. **Worker succeeded** — committed
`57ab3d4f chore(tests): cleanup contracts manifest orphans (mycelium-logic +
svelte-style-token + 25 spec.js)`.

**Resolution** (mixed approach, worker's own reasoning):

- Removed dead `mycelium-logic-contract.mjs` from `scene` group (file doesn't exist
  on disk — fixes `GROUP_FILE_MISSING` ERROR).
- Added `svelte-style-token-contract.mjs` to `quality` group (fixes
  `ORPHAN_MJS_CONTRACTS` WARN — file is a legitimate 89-line CSS token contract).
- Created new `journey` group with 23 legitimate spec files (fixes 23/25
  `ORPHAN_SPEC_CONTRACTS` WARN — design intent is for spec files to be in groups,
  per `discoverUnlistedContracts()` code comment).
- Added `tmp-diag-focus.spec.js` + `w51-diag.spec.js` to `specExclusions` Set in
  `run-all-contracts.js` (fixes remaining 2/25 — these are untracked temp/diag files,
  shouldn't be in the manifest).
- **Bonus insight** (worker's own): added `'journey'` to `SERVER_GROUPS` since journey
  tests are Playwright specs that need an HTTP server.

**Commit isolation**: 2 files only (`tests/contracts.manifest.json` +30/-1,
`tests/run-all-contracts.js` +3/-2). No parallel WIP collision. Validator:
"All validations passed. Pinned list: 68 files. Unlisted orphans: 0." REPORT at
`tmp/manifest-cleanup/REPORT.md`.

**Resolves the "Pre-existing manifest orphans" pending item from the 2026-07-25 chronicle.**

**Tool-quirk learned**: `external_subagent_poll`'s `last_text_preview` can show
mid-thinking text even when the worker SUCCEEDED. deepseek-v4-flash-free produces
200MB+ of verbose thinking tokens. When stdout hits the 200MB cap, the preview shows
truncated thinking-phase text — making it LOOK like the worker terminated before
executing. In reality, the worker continues executing AFTER thinking, lands edits,
commits, writes REPORT, exits 0. **Verify with `git log` + file inspection before
declaring failure.** (Memory saved as `subagent-poll-preview-misleading-200mb-stdout-cap`.)

## D — Journey-test gap audit (main-lane, 1 LOW-severity gap found)

Audited recent parallel commits for Svelte/UI touches per AGENTS.md hot rule
("user-visible features require a journey test before merge").

| Commit                              | Svelte/UI touch?                          | Journey test? |
| ----------------------------------- | ----------------------------------------- | ------------- |
| `90d62c3f` (Track A demo-replay F2) | YES — `DemoChoreography.svelte` (7 lines) | **GAP**       |
| `7b158883` (v2-failover Sprint-6)   | NO (tmp/ + harness only)                  | N/A           |
| `3dc0c995`, `c9b9db4b`, `93721ce2`  | NO (test/docs only)                       | N/A           |
| `c4201964` (main-lane Wave-3)       | YES — journey test ADDED                  | ✓ covered     |

**Gap**: `90d62c3f` adds `demo-replay-acknowledged` event dispatch to
`DemoChoreography.svelte`'s `replayListener`. Zero matches for "demo-replay" in ANY
spec.js. Severity LOW — companion contract test (`3dc0c995`) covers the dispatch
logic; user-visible impact is subtle (eliminates a confusing toast). REPORT at
`tmp/journey-test-audit/REPORT.md`.

## E — Search-layer Phase-A find (Subagent C, north-mini-code-free, IN PROGRESS)

Dispatched Subagent C (`ocw_4ea3e8bd`, `opencode-zen/north-mini-code-free`, 900s) to
run a Phase-A bugsweep find on `src/lib/search/`, cross-referencing against
`docs/cleanup-plans/search-layer-cleanup-plan.md`. Find-only — no edits. Output at
`tmp/search-layer-find/REPORT.md`. (Status at time of writing: running, no output yet.)

## Pending / follow-up

- **Journey-test gap** (commit `90d62c3f`): LOW severity. File as a follow-up ticket;
  not a blocker. Contract test covers the dispatch.
- **Prettier format sweep**: 44 non-compliant spec.js files. Defer to coordinated
  moment (3 are parallel WIP). Or format per-file as touched.
- **Upstream PR to `@earendil-works/pi-ai`**: propose adding `"streaming.?response.?failed"`
  to `RETRYABLE_PROVIDER_ERROR_PATTERN` (carried over from 2026-07-25 chronicle).
- **V2 failover material implementation**: `docs/v2-failover/spec.md` Sprint-1/2/3
  (carried over).

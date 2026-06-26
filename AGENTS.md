# Agents - Semantic Explorer

## Purpose

Semantic Explorer is a 3D semantic mycelium visualization for exploring Montgomery County TX business relationships.

This file is loaded into every Pi model call. Keep it concise. Detailed reference material belongs in `docs/`, not here.

## Prompt Budget

- Do not add large reference tables, historical wave notes, file inventories, or long command transcripts to `AGENTS.md`.
- Put bulky guidance in `docs/` and link to it from here.
- The previous full instruction/reference file is archived at `docs/archive/agents-full-reference-2026-06-19.md`.
- Before adding durable rules, ask whether the rule must be hot-path context for every turn.

## Operating Rules

- Check this repo-local `AGENTS.md` before repo-specific work.
- Prefer scoped reads/searches over broad recursive scans in this repo.
- Use `rg` for text search unless an ast-grep skill/tool is available and the task is structural TypeScript/Svelte matching.
- Do not kill broad `node`, PowerShell, browser, Claude, Gemini, Pi, or MCP process trees. Stop only exact PIDs with command-line evidence.
- Evaluate unfamiliar changes on their merits — good changes should stick, bad ones should be fixed. Don't reflexively revert a parallel-lane change just because it doesn't match your mental model; if it improves the code, keep it. Don't preserve bad code silently because authorship is murky either — if a change introduces an error or breaks an invariant, fix it (or revert it with a brief explanation, not as a stealth revert). When parallel sessions land conflicting changes, surface the conflict in chat rather than silently picking a side.
- If durable repo behavior changes, update the appropriate repo doc in the same turn.
- Before presenting work as finished, verify against the real success criteria and state what was run.
- **User-visible features require a journey test before merge.** Contract tests do not catch click-eating z-index layers, missing callbacks, or `Math.random()` stubs dressed as data. For any feature that touches a Svelte component, the desktop/mobile mount branches, or any DOM the user interacts with, add at least one test in `tests/widget-journey.spec.js` and run `npm run qa:journey:headless`. See `docs/session-coordination.md` → "The test-strategy gap" for the full rule and the W46 weather-widget case study. The pre-commit hook (`scripts/git-hooks/pre-commit` + PowerShell shim) **warns** when `src/components/*.svelte`, `src/App.svelte`, `src/lib/ui/*.ts`, or `src/lib/keyboard/*.ts` is staged without a journey test staged alongside. Override with `--SkipTestStrategyGapCheck` for pure internal refactors.

## Session Lock Protocol (multi-session coordination)

Before starting multi-commit work that will touch files another Pi/Codex/subagent session is likely working on, run `node scripts/session-lock.mjs acquire "<intent>"` (see `docs/session-coordination.md`). The lock is **advisory, not mandatory** — a stale lock (>30 min no heartbeat) can be taken over with `--force`. The lock file (`.session-lock`) is gitignored. Always release at end of session.

## Parallel Sessions

Multiple Pi/Codex/subagent sessions may share this repo.

Before any non-trivial commit or push:

```bash
git log --since="3 hours ago" --oneline
git status --short
```

- If 5+ unseen commits landed since last verified `HEAD`, queue work but do not commit until the stream quiesces.
- If tracked files you did not touch are modified, evaluate the diff on merit. Good changes stay; bad ones get fixed or reverted with an explanation. Pause and coordinate when the change is unclear-to-you-but-claimed-by-someone-else.
- For dirty worktrees, inspect before removal. Do not force-remove a worktree that may contain another session's WIP.

## Subagents

- Default to decomposition and delegation for meaningful multi-step work when the external-subagent tool is available.
- Keep the main lane responsible for user interaction, synthesis, and verification.
- Worker prompts must define scope, allowed files, no-revert boundaries, expected evidence, and verification commands.
- Have workers write reports/evidence under `tmp/` when practical; main lane reviews diffs and reruns deterministic checks.
- Lightly poll long-running workers (~every 2-3 min) when live steering is available — give them runway, don't micro-manage.
- Do not assume workers inherit browser/MCP tools. Have workers report exposed tools before artifact-producing work that depends on them.

**Runway / Rate / Polish rule (set 2026-06-26, persistent):**

1. **Runway** — Give subagents real space to cook. Don't cancel + take over before they've had 10-15 min on a meaningful task. Slow streaming is normal for the kilo/openrouter/owl-alpha lane; agnes-2.0-flash can also be slow. Only intervene on evidence the worker is truly wedged (no progress for several minutes, repeated identical tool errors).
2. **Rate quality** — When the worker finishes, evaluate the diff against the brief. Score 1-10. Look for: scope creep, broken types/tests, missing a11y, formatting drift, half-applied edits, parallel-session interference, missing evidence in `tmp/`.
3. **Polish to 10/10** — If the score is below 10, take over on the main lane and finish the gap. Do **not** hand the gap back to the user. Examples: missing styles → add them; failing test → fix it; scope creep → revert and re-apply tightly; whitespace drift in unrelated files → revert that drift.
4. **End result is what matters** — Don't preserve bad work quietly because authorship is murky. If something is wrong, fix or revert with a brief explanation in chat.

Subagent lane inventory (from `model-providers.json` → `allowed_models`):

- Primary: `kilo/openrouter/owl-alpha`
- Registered alt the user explicitly named: `agnes-2.0-flash`
- Free fallbacks: `mimo-v2.5-free`, `deepseek-v4-flash-free`, `nemotron-3-ultra-free`, `qwen3.6-plus-free`, `north-mini-code-free`

**Always delegate (set 2026-06-26, persistent):**

We always delegate work to increase throughput and quality. Default mode is decomposition + delegation via `external_subagent_*`. Don't ask "should I delegate?" — assume yes. Only do main-lane work directly when the task is trivial (single edit, single command), needs sub-second response, or the user explicitly asked for main-lane execution.

Delegate → runway → rate 1-10 → polish to 10/10 on main lane → ship.

**Delegation lifecycle (behavioral rule, persistent):**

When a task arrives, run this loop on the main lane before touching anything:

1. **Investigate** — read files, search for the relevant patterns, identify the seam. Use `rg` for text search, `ast-grep` for structural TypeScript/Svelte, `ctx_*` for output-heavy probes, `memory_search` for durable context. Note: parallel-session dirty files, recent commits touching the same surface, contract tests that will gate the work.
2. **Plan** — design the solution in main-lane head. Identify scope, allowed files, no-revert boundaries, verification commands. Write the design to a `tmp/<topic>-<date>/worker-prompt.md` if it will be delegated.
3. **Decompose** — split into sub-tasks. For each sub-task, ask: is this bigger than ~50 LOC of code or ~100 LOC of test, OR does it require more than one read cycle of investigation? If yes → delegate. If no → main-lane is faster. Don't ask permission, just decide.
4. **Delegate** — `external_subagent_start` with `model: kilo/openrouter/owl-alpha` (primary) or `agnes-2.0-flash` (registered) or a free fallback. Provide: scope, allowed files, no-revert boundaries, expected evidence (diff + verification output + tmp/report.md), verification commands. `timeout_seconds: 900`. `mode: yolo`. `mcp_profile: subagent`. `owner_tag: kimi-main`. Acquire session lock if multi-commit.
5. **Judge** — when the worker finishes, read `tmp/<topic>/report.md` + `git diff`. Score 1-10 against the brief. Look for: scope creep, broken types/tests, missing a11y, formatting drift, half-applied edits, parallel-session interference, missing evidence.
6. **Polish** — if score <10, take over on the main lane and finish the gap. Examples: missing styles → add them; failing test → fix it; scope creep → revert and re-apply tightly; whitespace drift in unrelated files → revert that drift. If score =10, ship (commit + push).

Discriminator for main-lane vs delegate: smaller tasks (single edit, single command, <50 LOC, scoped to 1-2 files) go main-lane because the delegation overhead (worker ramp-up, evidence roundtrip, judge step) costs more than the time saved. Everything else delegates.

**Parallel divide-and-conquer (set 2026-06-26, persistent):**

Subagents aren't only for implementation — they're for ANY cognitive work: research, investigation, planning, design, review, implementation, polish. Use them as 2nd/3rd/4th/... parallel "me" to divide and conquer.

When to parallelize:

- Multi-file investigation → multiple subagents, each a slice
- Independent features → multiple subagents, each one
- Research questions → multiple subagents, then synthesize
- Competing designs → 2-3 workers explore alternatives, pick winner
- Wide task → N workers in parallel on different surfaces

How:

- Fire N `external_subagent_start` calls in one turn (no waiting between)
- Each gets its own `worker_id`, `owner_tag` (e.g. `kimi-research-N`), `tmp/` subdir
- Each gets a tight scoped prompt with allowed files + no-revert boundaries
- Main lane synthesizes results + judges + polishes

Examples:

- "Investigate Phase 9a error boundary" + "Investigate Phase 9c cancel UX" → 2 parallel investigations
- "Implement error store" + "Install handlers" + "Write contract tests" → 3 parallel implementations (independent files only)
- "Research Svelte 5 patterns" + "Research React patterns" → parallel research, synthesize

CONSTRAINT: independent scopes only. If two tasks touch the same files, serialize or merge into one worker.

## Key Product Invariants

- The 8,406-point mycelium data lives in `state.rawPositionsBuffer` as `[0,1]^3` positions. W7-B Pair 2 prep preserved the unit-cube invariant via the canonical `seededUnit` re-export from `@lib/utils/seeded-random`.
- `getPointBoundsCenter(points, positionBuffer)` in `src/lib/engine/node-manager.ts` must receive the raw position buffer. Passing only point objects mis-centers the network.
- `src/lib/state/app.svelte.ts` is the Svelte 5 global state source of truth.
- `js/workers/data-worker.ts` is active runtime via `data-worker-url-bridge.ts`.
- `micro-demo.js` / `src/lib/demo/choreography.ts` is the sole demo entry point and owns first-visit eligibility.
- CSS ownership is split by ordered modules under `css/`; use the ownership docs before editing mobile/surface styles.

## Reference Docs

Read these only when relevant:

- CSS ownership: `docs/archive/semantic-demo-css-authority-map.md`, `docs/archive/semantic-demo-mobile-state-ownership.md`
- State transitions: `docs/semantic-demo-state-transition-table.md`
- Design tokens: `docs/semantic-demo-design-tokens.md`
- Surface style matrix: `docs/semantic-demo-surface-style-matrix.md`
- Window/global policy: `docs/window-global-allowlist.md`
- Migration plan: `docs/migration-plan.md`
- Performance: `docs/performance-budget.md`, `docs/w44-performance-attack-plan.md`
- Type discipline: `docs/typing-contract.md` — global `as any` budget, typing-contract tests, and file-specific tightening rules.
- Session coordination: `docs/session-coordination.md` — when to acquire/release the multi-session lock before multi-commit work.
- Historical full agent reference: `docs/archive/agents-full-reference-2026-06-19.md`

If a referenced doc is missing, use the archived full reference as fallback and consider restoring a concise dedicated doc.

## Important Files

- Engine: `src/lib/engine/three-engine.ts`, `src/lib/engine/node-manager.ts`, `src/lib/engine/mycelium-engine.ts`, `src/lib/engine/three-thread-manager.ts`, `src/lib/engine/resource-tracker.ts`
- Journey: `src/lib/journey/journey.ts`, `src/lib/journey/compass-state.ts`, `src/lib/journey/selected-card.ts`, `src/lib/journey/thread-inspector.ts`
- Focus: `src/lib/focus/pocket.ts`, `src/lib/focus/geometry.ts`, `src/lib/focus/stage-renderer.ts`
- Orchestration: `src/lib/orchestration/app-init.ts`, `src/lib/orchestration/lifecycle.ts`, `src/lib/orchestration/view-controller.ts`, `src/lib/orchestration/event-bus.ts`
- State/data: `src/lib/state/app.svelte.ts`, `src/lib/state/state-types.ts`, `src/lib/data-store.ts`, `src/lib/data-loader.ts`, `src/lib/semantic-threads.ts`, `src/lib/search-engine.ts`
- Search: `src/lib/search/index.ts`, `src/lib/search/tokenizer.ts`, `src/lib/search/scoring.ts`, `src/lib/search/orchestration.ts`
- UI/chrome: `src/lib/ui-renderers.ts`, `src/lib/navigation-actions.ts`, `src/lib/z-index.ts`

## Dev Commands

```bash
npm run build
npm run lint
npm run test
npm run test:unit
npm run test:contract
npm run qa:contract
npm run qa:surface:all
npm run qa:surface:mobile-idle
npm run test:microdemo
npm run serve
npm run audit:a11y           # a11y lint for src/components/*.svelte (tabulated)
npm run audit:a11y:strict    # same, exit 1 on any HIGH finding
npm run audit:a11y:json      # same, machine-readable JSON
```

`scripts/audit-a11y.mjs` checks 8 rules: button type, button aria-label, form input id/aria, interactive non-semantic containers, image alt, low-alpha colors, outline suppression, aria-hidden wrapping focusable children. Use `--file=<Substring>` and `--severity=HIGH|MED|LOW` to filter.

Use narrower checks when validating a scoped change.

## Surface Tests

`tests/surface-contract-check.mjs` runs DOM/layout assertions for named surfaces such as `mobile-idle`, `desktop-idle`, `launch-focus`, `search-error`, `map-trail`, `focus-pocket`, `field-node`, `info-panel-empty`, `compass-rail`, `loading-overlay`, `mode-grid`, `filters`, `thread-inspector`, `controls`, `search-chrome`, `info-panel-populated`, and `global-spacing`.

`tests/visual-state-audit.mjs` captures screenshots for visual QA.

## Edit Safety

- Prefer the established Svelte/TypeScript patterns in nearby files.
- Keep edits scoped to the requested seam.
- Preserve JS/TS bridge behavior unless the task is explicitly migration cleanup.
- For UI work, verify at desktop and mobile sizes when layout can change.
- For engine/WebGL work, verify that the canvas renders nonblank and resources are disposed.

## Pi Harness Notes

- `memory_write` is broken at the gateway layer until `~/.pi/agent/extensions/pi-hermes-memory-writer.ts` is loaded — a one-time repair Pi performs at session start. If you ever see `pi_tool memory_write → Tool not found`, run `/reload-runtime` or restart once. See `~/.pi/agent/patches/pi-hermes-memory-writer.md` for the failure mode + verification recipe.
- Pi harness self-improvement is allowed when friction reveals a safe, scoped upgrade.
- Keep reusable Pi harness rules in global Pi docs/skills where appropriate, not in this repo file unless they are repo-specific.
- For JavaScript scratch work, prefer the `js-repl` skill/tool when available instead of embedding REPL rules here.

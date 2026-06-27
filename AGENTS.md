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
- **Always consider whether delegation would improve throughput or end-result quality** — if yes, delegate (a subagent, deeper search, or external verification). Main-lane speedup is only a win when the alternative blocks the user; default to delegating when it is reasonable.
- **User-visible features require a journey test before merge.** Contract tests do not catch click-eating z-index layers, missing callbacks, or `Math.random()` stubs dressed as data. For any feature that touches a Svelte component, the desktop/mobile mount branches, or any DOM the user interacts with, add at least one test in `tests/widget-journey.spec.js` and run `npm run qa:journey:headless`. See `docs/session-coordination.md` → "The test-strategy gap" for the full rule and the W46 weather-widget case study. The pre-commit hook (`scripts/git-hooks/pre-commit` + PowerShell shim) **warns** when `src/components/*.svelte`, `src/App.svelte`, `src/lib/ui/*.ts`, or `src/lib/keyboard/*.ts` is staged without a journey test staged alongside. Override with `--SkipTestStrategyGapCheck` for pure internal refactors.

## Session Lock Protocol

Before starting multi-commit work that will touch files another Pi/Codex/subagent session is likely working on, run `node scripts/session-lock.mjs acquire "<intent>"` (see `docs/session-coordination.md`). The lock is **advisory, not mandatory** — a stale lock (>30 min no heartbeat) can be taken over with `--force`. The lock file (`.session-lock`) is gitignored. Always release at end of session.

## Parallel Sessions

See `docs/session-coordination.md` — session lock + parallel-session coordination rules.

## Subagents

- Default to decomposition and delegation for meaningful multi-step work when the external-subagent tool is available.
- Keep the main lane responsible for user interaction, synthesis, and verification.
- Worker prompts must define scope, allowed files, no-revert boundaries, expected evidence, and verification commands.
- Have workers write reports/evidence under `tmp/` when practical; main lane reviews diffs and reruns deterministic checks.
- Lightly poll long-running workers (~every 2-3 min) when live steering is available — give them runway, don't micro-manage.
- Do not assume workers inherit browser/MCP tools. Have workers report exposed tools before artifact-producing work that depends on them.

**Delegation rules:** Full lifecycle, rate/polish, parallel divide-and-conquer, visual verification, and vision capability matrix are in `docs/subagent-delegation.md`.

**Lane inventory (from `model-providers.json`):**

- Primary: `kilo/openrouter/owl-alpha`
- Registered alt: `agnes-2.0-flash`
- Free fallbacks: `mimo-v2.5-free`, `deepseek-v4-flash-free`, `nemotron-3-ultra-free`, `qwen3.6-plus-free`, `north-mini-code-free`

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
- Session coordination: `docs/session-coordination.md` — session lock, parallel-session rules, test-strategy gap.
- Subagent delegation: `docs/subagent-delegation.md` — delegation lifecycle, rate/polish, vision matrix, lane inventory.
- Important files: `docs/important-files.md` — canonical file inventory by module.
- Historical full agent reference: `docs/archive/agents-full-reference-2026-06-19.md`

If a referenced doc is missing, use the archived full reference as fallback and consider restoring a concise dedicated doc.

## Important Files

See `docs/important-files.md` for the canonical file inventory by module (Engine, Journey, Focus, Orchestration, State/Data, Search, UI/Chrome).

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

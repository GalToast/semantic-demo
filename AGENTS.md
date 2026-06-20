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
- Never revert user or parallel-session changes unless explicitly asked.
- If durable repo behavior changes, update the appropriate repo doc in the same turn.
- Before presenting work as finished, verify against the real success criteria and state what was run.

## Parallel Sessions

Multiple Pi/Codex/subagent sessions may share this repo.

Before any non-trivial commit or push:

```bash
git log --since="3 hours ago" --oneline
git status --short
```

- If 5+ unseen commits landed since last verified `HEAD`, queue work but do not commit until the stream quiesces.
- If tracked files you did not touch are modified, avoid those files or pause and coordinate.
- For dirty worktrees, inspect before removal. Do not force-remove a worktree that may contain another session's WIP.

## Subagents

- Default to decomposition and delegation for meaningful multi-step work when the external-subagent tool is available.
- Keep the main lane responsible for user interaction, synthesis, and verification.
- Worker prompts must define scope, allowed files, no-revert boundaries, expected evidence, and verification commands.
- Have workers write reports/evidence under `tmp/` when practical; main lane reviews diffs and reruns deterministic checks.
- Poll/steer long-running workers every 60-90 seconds when live steering is available.
- Do not assume workers inherit browser/MCP tools. Have workers report exposed tools before artifact-producing work that depends on them.

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
```

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

- Pi harness self-improvement is allowed when friction reveals a safe, scoped upgrade.
- Keep reusable Pi harness rules in global Pi docs/skills where appropriate, not in this repo file unless they are repo-specific.
- For JavaScript scratch work, prefer the `js-repl` skill/tool when available instead of embedding REPL rules here.

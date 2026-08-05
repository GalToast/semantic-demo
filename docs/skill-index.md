# Skill Index — progressive disclosure map

Every session loads only skill **name + description**; bodies load on demand when the description matches the task. This index is the discovery layer — scan here (or the session's `available_skills` block) and open the matching SKILL.md. Keep this index updated when skills change (see `skill-authoring` skill).

## Global — Design / UI / UX (harness-wide)

| Skill                                  | Trigger (description keywords)                                                                        | Source                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `frontend-design`                      | distinctive/non-templated visual design, anti-AI-slop, palette/typography/layout decisions            | Anthropic official + impeccable ⭐ NEW                    |
| `ui-animation`                         | animation/transition/motion design, prefers-reduced-motion, transform/opacity                         | mblode + Anthropic ⭐ NEW                                 |
| `web-quality-audit`                    | pre-delivery audit, Core Web Vitals, WCAG 2.1/2.2, Lighthouse targets, bounded verify loop            | addyosmani + web-design-reviewer + ui-ux-pro-max ⭐ NEW   |
| `threejs-webgl-practices`              | Three.js/WebGL loops, clips, culling, LOD, testing                                                    | cloudai-x/threejs + playwright ⭐ NEW                     |
| `canvas-webgl-a11y`                    | canvas/WebGL accessibility: off-DOM data table, keyboard parallel DOM, role=img, reduced-motion scene | a11y-perf-viz research ⭐ NEW                             |
| `css-architecture`                     | @layer cascade, container queries, semantic tokens, OKLCH/contrast-first, specificity wars            | Mindrally + antfu + meodai ⭐ NEW                         |
| `svelte-5-runes-practices`             | Svelte 5 runes, $state/$derived/$effect, reactivity bugs, lockstep gating                             | sveltejs/ai-tools + semantic-explorer field-proven ⭐ NEW |
| `skill-authoring`                      | create/edit skills, progressive disclosure, lean bodies + trigger descriptions                        | Anthropic skill-creator + harness model ⭐ NEW            |
| `ux-copywriting`                       | user-facing copy, banned AI-isms, outcome CTAs, state copy, before/after audit                        | mblode copywriting + product-design + Anthropic ⭐ NEW    |
| `design-taste`                         | typography/color/layout taste, AI-slop checklist, restraint, tabular figures                          | mblode typography-audit/ui-design + Anthropic ⭐ NEW      |
| `svelte-extract-scoped-css-reactivity` | Svelte component extraction regressions (scoped CSS, store snapshots)                                 | repo-proven                                               |
| `tostore-migration-pattern`            | toStore bridges → writable+notify migration                                                           | repo-proven (project)                                     |
| `visual-qa-critique`                   | structured visual QA critique for 3D/web apps                                                         | repo-proven                                               |
| `vision-audit-with-model-jury`         | vision model jury, screenshot QA, image diff, VLM                                                     | repo-proven                                               |

## Global — Dev workflow

| Skill                                            | Trigger                                                                                               |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `code-diff-review`                               | review diff/PR, security+correctness review                                                           |
| `code-review-discipline`                         | severity tiers, risk-first triage, blast radius, evidence-before-claims ⭐ NEW                        |
| `agent-security-guardrails`                      | harness hardening: runtime tool gates, untrusted content, least privilege, MCP vetting ⭐ NEW         |
| `episodic-memory-implementation`                 | episode tuples, session-end distillation, golden sets, cross-session recall ⭐ NEW                    |
| `memory-retrieval-discipline`                    | write/retrieval discipline: high-signal entries, ≤5 chunk injections, semantic+lexical fusion ⭐ NEW  |
| `context-engineering`                            | context rot, prompt caching (stable prefix), structured note-taking, token budgets ⭐ NEW             |
| `multi-agent-orchestration`                      | orchestrator-worker, structured handoffs, maker-checker, model economics, budget caps ⭐ NEW          |
| `agent-ux-hitl`                                  | permission tiers, reversibility marking, blast-radius preview, autonomy budgets, OTEL tracing ⭐ NEW  |
| `ambiguity-resolution`                           | grill-me, ask-if-underspecified, anti-over-engineering ⭐ NEW                                         |
| `subagent-role-templates`                        | worker role anatomy: frontmatter scope/no_revert + comms + quality bar; role-vs-skill layering ⭐ NEW |
| `boundary-validation`                            | Zod at every boundary (API/worker/URL params), fail-fast, branded types ⭐ NEW                        |
| `store-mutation-discipline`                      | single-write mutation path, components dispatch, store mutates ⭐ NEW                                 |
| `differential-review`                            | review the diff + git-history lens, context of change ⭐ NEW                                          |
| `testing-anti-patterns`                          | no private-state asserts, no self-mocking, property fuzz for invariants ⭐ NEW                        |
| `threat-modeling`                                | OWASP + STRIDE before building user-touching surfaces ⭐ NEW                                          |
| `large-file-edit-discipline`                     | surgical SEARCH/REPLACE over full rewrites for >300-line files ⭐ NEW                                 |
| `api-approval-write`                             | propose public API changes in review BEFORE implementing ⭐ NEW                                       |
| `dependency-discipline`                          | npm ls audit, unused-dep checks, no phantom imports, pinned versions ⭐ NEW                           |
| `concise-agent-communication`                    | caveman: cut noise, evidence-first findings, brevity budgets ⭐ NEW                                   |
| `test-driven-development`                        | red-green-refactor, Iron Law (delete code written before failing test) ⭐ NEW                         |
| `skill-discovery-meta`                           | find the right skill: index scan, trigger keywords, create-vs-reuse ⭐ NEW                            |
| `live-docs-lookup`                               | context7-style: prefer live docs over training memory for versioned APIs ⭐ NEW                       |
| `persistent-planning-files`                      | task_plan/findings/progress survive context loss; update-before-pause ⭐ NEW                          |
| `context-ledger`                                 | serialize key state around compactions + subagent handoffs ⭐ NEW                                     |
| `annotated-screenshots-qa`                       | numbered element labels for vision QA + covering-element fail-fast ⭐ NEW                             |
| `webgl-performance-discipline`                   | BatchedMesh, buffer reuse, dispose pools, GC pressure, pixel-ratio caps ⭐ NEW                        |
| `mcp-builder`                                    | build MCP servers/tools: workflow tools, actionable errors, streamable HTTP, Zod schemas ⭐ NEW       |
| `tool-use-discipline`                            | parallel calls, self-correct on errors, summarize results, validate shapes ⭐ NEW                     |
| `data-viz-encoding`                              | pre-attentive attributes, CVD-safe palettes, label management, affordances ⭐ NEW                     |
| `interactive-web-artifacts`                      | self-contained prototypes, screenshot+vision review, port on success ⭐ NEW                           |
| `subagent-role-templates`                        | worker role anatomy: frontmatter scope/no_revert + comms + quality bar; role-vs-skill layering ⭐ NEW |
| `verification-before-completion`                 | Iron Law TDD, red-green verification, done-claims need evidence ⭐ NEW                                |
| `pr-description-writer`                          | write a PR description                                                                                |
| `second-opinion-review`                          | independent review from a different model                                                             |
| `changelog-release-notes`                        | changelog/release notes from git history                                                              |
| `flaky-test-triage`                              | intermittent test failures                                                                            |
| `performance-optimization-review`                | measured latency/memory/CPU bottleneck                                                                |
| `git-worktree-management` / `git-branch-cleanup` | worktrees, branch tidy                                                                                |
| `structured-bugsweep`                            | comprehensive codebase analysis                                                                       |
| `test-baseline-sync`                             | invariant-test baselines during migrations                                                            |
| `dependency-supply-chain-audit`                  | dependency risk/health                                                                                |
| `skill-self-review`                              | audit a SKILL.md                                                                                      |
| `skill-authoring`                                | create/edit skills, progressive disclosure ⭐ NEW                                                     |

## Global — Pi harness / environment

| Skill                                                                                                                              | Trigger                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `mcp-subagent-dispatch-routing`                                                                                                    | where are subagent tools, No such tool, dispatch routing                                         |
| `subagent-websearch-access`                                                                                                        | websearch not found in worker, connect cached websearch MCP, research worker needs search ⭐ NEW |
| `subagent-*` (timeout, followup, spawn-wedge, workspace-sweep, build-task, mcp-browser)                                            | worker stuck/quiet/recovery/cleanup                                                              |
| `worker-timeout-on-disk-edits-takeover`                                                                                            | worker exit 124, edits landed but no report                                                      |
| `pi-harness-self-upgrade` / `local-package-idempotency-audit` / `model-config-sync` / `pi-harness-subagent-model-capability-split` | harness upgrades, model config                                                                   |
| `memory-routing-policy`                                                                                                            | which memory store, size/scope                                                                   |
| `js-repl`                                                                                                                          | quick JS/Python/PowerShell experiments                                                           |
| `write-node-script-on-windows` / `write-tool-debug` / `context-mode-windows-shell-path` / `bash-detach-handling`                   | Windows shell/tool quirks                                                                        |
| `tool-retry-exponential-backoff`                                                                                                   | cascading tool retries after errors                                                              |
| `parallel-session-watch`                                                                                                           | git drift before commits                                                                         |
| `harness-hook-patterns`                                                                                                            | harness internals, extensions, hooks, compaction, ledgering, plugin bundling ⭐ NEW              |
| `pi-harness-conventions`                                                                                                            | OUR runtime: pi main lane + external_subagents (pi harness), pi_tool/mcp routing, key router, memory ⭐ NEW |
| `opencode-harness-patterns`                                                                                                         | opencode FALLBACK lane + key-router lineage reference (NOT primary runtime) ⭐ NEW               |
| `skill-benchmarks`                                                                                                                  | measurable skill quality: benchmark task, N trials, success/latency/cost, regression gate ⭐ NEW |
| `skill-discovery-precedence`                                                                                                       | tiered discovery (workspace>user>ext>builtin), .agents/skills alias, progressive activation ⭐ NEW |
| `ast-grep-decision-tree`                                                                                                           | which search tool (rg vs ast-grep vs ctx)                                                        |
| `mcp-playwright-wedge-resolution`                                                                                                  | Playwright MCP hangs                                                                             |

## Project — semantic-explorer

| Skill                                   | Trigger                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `ux-friendly-copy-audit`                | user-visible jargon, friendly copy                                             |
| `visual-audit-false-positive-watchlist` | VLM/capture flags before shipping                                              |
| `subagent-worker-health-forensics`      | worker quiet/stuck diagnosis                                                   |
| `safe-subagent-dispatch-and-cleanup`    | external_subagents in this repo                                                |
| `dev-server-drift-handling`             | unexpected Vite-modified files                                                 |
| `store-state-class-t4-regression-test`  | state-class migration regression tests                                         |
| `tostore-migration-pattern`             | toStore bridges                                                                |
| `bash-detach-handling`                  | 15s auto-detach                                                                |
| `switchboard-coordination`              | switchboard taskboard, parallel session coordination, resource locks, handoffs |

## Research digest sources (tmp/, 2026-08-05)

- `tmp/skill-digest-2026-08-05.md` (main lane — design)
- `tmp/skill-digest-backend.md` (lane: backend/dev)
- `tmp/skill-digest-ux.md` (lane: UX/design/taste)
- `tmp/skill-digest-novel.md` (lane: novel/cool)

## Additions policy

New skills: name by the job, trigger-rich description, lean body (see `skill-authoring`). Add a row here in the same edit. Public skill adaptations: note the source in the body.

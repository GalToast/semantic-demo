# semantic-explorer — Local Memory Index

Repo-local memory lives here (not in global QWEN.md or `.codex/`). Each file has a narrow role; keep them concise and update when the truth changes.

| File | Purpose | When to update |
|---|---|---|
| `canonical-truths.md` | Stable invariants: project overview, key file roles, state machines, storage keys, CSS architecture, durable code invariants | Only when architecture or conventions materially change |
| `active-context.md` | Current high-level state: migration progress, demo readiness, known blockers | Every session that changes project state; always date-stamp |
| `reusable-knowledge.md` | Durable workflow notes: dual-track dev, test commands, edit safety rules, worker patterns | When workflow conventions change |
| `environment.md` | Local dev commands, server URLs, debug flags, toolchain versions | When scripts, ports, or tooling change |

## Related surfaces
- `AGENTS.md` — repo-local agent directives (primary behavioral contract)
- `docs/migration-plan.md` — phased JS→TS+Svelte migration plan
- `docs/semantic-demo-bugsweep-2026-06-05.md` — verified bug catalog

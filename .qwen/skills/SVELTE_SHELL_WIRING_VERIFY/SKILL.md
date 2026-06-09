---
name: SVELTE_SHELL_WIRING_VERIFY
description: Verify whether flipping Svelte component visibility booleans will produce a working UI, including template guard analysis, runtime data-flow tracing through stores and legacy bridges, and the unlock procedure when verification confirms safe wiring.
source: auto-skill
extracted_at: '2026-06-09T01:37:25.808Z'
---

# Svelte Shell Wiring Verification

Use this when asked "what happens if we flip `visible={false}` to `true`" or "are the Svelte components actually wired?" in a partially-migrated Svelte+legacy app.

## Trigger

- User asks about wiring, visibility, or enabling hidden Svelte components
- User wants to know if the Svelte shell will render real data
- Investigating a partially-migrated Svelte+legacy codebase where hidden components exist alongside active legacy UI

## Two-lane parallel verification

Launch two read-only subagents in parallel using `nvidia/nemotron-3-ultra-550b-a55b:free` (direct NVIDIA route works; do NOT use `openrouter/...` or `kilo/...` prefixed refs — they are rejected by the allowlist with `Unsupported external subagent model`).

Both workers should use:
- `mode: "readonly"`
- `timeout_seconds: 900` (15 min)
- `mcp_profile: "default"` (no mcp_profile none)
- `cwd` set to the project root (Windows paths with spaces are accepted)
- `prompt_path` or `prompt_text` with scoped read-only instructions

### Worker A — Template Verify

Prompt: "Read these 4 files IN FULL and report how `visible`/`open` props are used in the templates: [FocusCard, JourneyChrome, CompassRail, Filters] (or the actual hidden components in the project's App.svelte). For each, report: line number, usage form ({#if} guard / attribute binding / CSS class / passed to child), whether combined with store conditions, and whether it will render when prop=true + stores populated. End with a verdict table."

Skip: stores, App.svelte, CSS, build commands.

### Worker B — Dataflow Verify

Prompt: "Trace the runtime data flow from user actions to store mutations. Read: main.ts, App.svelte (onMount), data-store.ts, lifecycle-bridge.ts (if exists), and the Svelte stores that hidden components import from. For each store, report exports, initial state, and whether it has runtime writers. Then trace 3 user actions (canvas click → focus, search input → results, journey mode activation). Identify gaps where legacy events don't reach Svelte stores."

Skip: .svelte templates, CSS, package.json, build commands.

## Output expected

| Category | Detail |
|---|---|
| store population | which stores are populated at runtime vs. empty |
| template wiring | whether each `visible={false}` component will render when flipped |
| bridge gaps | which user actions don't update Svelte stores |
| verdict | "render with real data / render with empty data / fail silently" per component |

## Common finding

In Svelte+legacy hybrids, the typical pattern is:
- Templates are correctly wired with `{#if visible && storeCondition()}`
-但在 runtime, only 1-3 legacy events are bridged (node focus, camera arrived, view changed)
- Focus, journey, filter, and thread inspector stores start empty and have no writers
- Flipping booleans makes components render, but they show empty/default data

## Failure modes

- `openrouter/nvidia/...:free` or `kilo/nvidia/...:free` model refs → REJECTED by allowlist with "Refusing to launch because Qwen Code may fall back to its default model"
- Use ONLY `nvidia/nemotron-3-ultra-550b-a55b:free` (direct NVIDIA route)
- 15 min is sufficient for verification tasks (templates worker: ~3 min, dataflow worker: ~7 min)
- Workers respect read-only constraint when `mode: "readonly"` is set

## Related skills

- `LEGACY_SHELL_SVELTE_GAP_FIX` — fixes the gaps this skill identifies
- `SVELTE_MIGRATION_STATE_BRIDGE_QA` — broader bridge audit
- `STUB_TO_REAL_SVELTE_PORT` — completing component ports

---

## Phase 2 — Unlock Procedure (implement after verification)

Once verification confirms that each component self-gates or has a usable store derivation, apply the visibility unlock in `src/App.svelte` (or equivalent root template).

### Step 1 — Classify each hidden component by template guard pattern

For every component currently passed `visible={false}`:

1. Open the component file and locate the `{#if visible}` block (or equivalent `class:active` / CSS-driven guard).
2. Classify into one of three patterns:

| Pattern | Template form | Meaning |
|---|---|---|
| **Self-gating** | `{#if visible && storeCondition()}` or `let x = $derived(visible && storeCheck())` | The component internally decides whether to render based on store state. `visible` is a master on/off. |
| **Externally-gating** | `{#if visible}` with **no** store-derived condition in the same block | The component renders *everything* it owns whenever `visible` is truthy. Activation must be controlled from the parent. |
| **Attribute-pass-through** | `visible` is passed to a child or bound to a DOM `hidden`/`aria-hidden` attribute | Treat like externally-gating; the parent controls the boolean. |

### Step 2 — Choose the replacement prop value

| Pattern | Replacement | Example |
|---|---|---|
| Self-gating | `visible={true}` | Component shows only when its own store conditions are met. |
| Externally-gating | `visible={derivedStoreExpression}` | Parent must supply a meaningful condition. |
| Attribute-pass-through | `visible={derivedStoreExpression}` | Same as externally-gating. |

For `derivedStoreExpression`, prefer an **existing derived value** already computed in `App.svelte` (e.g., `focusActive`) rather than creating new inline derivations. If a new derivation is needed, compute it once at module scope or in a `$derived` block to avoid duplication.

### Step 3 — Apply changes in `App.svelte`

1. Change each `visible={false}` to its replacement value.
2. Do **not** change prop names, component wrapper structure, or surrounding layout unless the component itself requires it (per component slice rules).
3. Add a one-line HTML comment documenting the rationale: `<!-- ComponentName (self-gates via visible && storeCheck) -->` or `<!-- ComponentName (externally gated by focusActive) -->`.

### Step 4 — Verify no new imports are needed

Before running typecheck/build:
- Confirm the derived expressions used already exist in the file's scope.
- If a new store import is required, add it; if not, leave imports unchanged.
- Run shell-based `git diff` to verify only `visible` prop values changed (and comments).

### Step 5 — Run targeted verification

Per the repo's contract-test matrix:
```bash
npm run check
npm run qa:contract:mobile-idle
npm run qa:contract:focus-pocket
npm run qa:contract:compass-rail
npm run qa:contract:thread-inspector
npm run qa:contract:map-trail
```

### Known post-unlock failure modes

If a surface fails after unlock:
- **Pre-existing failure**: The component was hidden *because* it failed, not the other way around. Run the same contract test against the legacy shell (if available) or check memory for prior findings.
- **Store not yet populated**: The component is correctly wired but the data path from user action → store mutation → component render is not yet complete. This is a **cross-slice finding** — file it with path and description, do not patch legacy JS outside scope.
- **DOM ID/layout shift**: If the component now occupies space and pushes/overlaps another surface, that is a CSS ownership issue — apply the existing CSS ownership workflow (check `docs/semantic-demo-css-ownership-map.md`).

### Rule

- One file edited (`App.svelte` or root template) unless a component itself is buggy and in-scope.
- No new abstractions unless the component's existing prop/API is insufficient.
- Always verify with shell tools (`git diff`), not in-process reads.

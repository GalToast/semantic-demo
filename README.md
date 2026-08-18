# Semantic Explorer

![CI Status](https://github.com/GalToast/semantic-demo/actions/workflows/ci.yml/badge.svg)

A 3D semantic mycelium visualization for exploring business relationships in Montgomery County. Built with **Svelte 5**, **TypeScript**, and **Three.js**.

## Getting Started

```bash
npm install              # install dependencies
npm run dev:svelte       # start dev server (Vite + HMR) on http://127.0.0.1:5173
npm run build:svelte     # production build → dist/svelte/
```

Then open the **repo-root `index.html`** in a browser — it's a hub linking to both the built app and the case study. Or go directly to `http://127.0.0.1:5173` for the live dev app.

### Where things live

| What | Where |
|------|-------|
| App source (Vite root) | `src/index.html` |
| App build output | `dist/svelte/index.html` (serve this directory statically) |
| Repo-root front door | `index.html` (hub — no auto-redirect) |
| Case study page | `case-study.html` (untracked WIP, linked from hub) |

### Quick start (< 30 s)

```bash
npm install && npm run build:svelte
python3 -m http.server 8799 --bind 127.0.0.1   # from repo root
# open http://127.0.0.1:8799 — hub page with two buttons
```

## Architecture

```
src/
├── main.ts                  # Vite entry point
├── App.svelte               # Root component, body data-attribute sync
├── components/              # Svelte 5 UI surfaces (InfoPanel, SearchResults, etc.)
└── lib/
    ├── engine/              # Three.js engine layer (renderer, nodes, interactions)
    ├── state/               # Typed state management (Svelte stores + legacy bridge)
    ├── stores/              # Typed Svelte stores replacing legacy UI state
    ├── focus/               # Focus geometry and stage logic
    ├── journey/             # Journey compass, thread inspector, semantic overlay
    ├── search/              # Search engine and results UI
    ├── keyboard/            # Keyboard shortcut handling
    ├── audio/               # Sound design
    ├── css/                 # Modular CSS (17 ordered modules)
    └── types/               # Shared TypeScript types
```

**Key patterns:**

- `data-panel-surface` and related `data-*` body attributes are the canonical state interface between JS and CSS.
- Engine bridge layer in `src/lib/engine/` mediates between Svelte components and the Three.js rendering core.
- Typed Svelte stores in `src/lib/state/` and `src/lib/stores/` replace legacy UI state slices.

## Commands

| Command                              | Description                              |
| ------------------------------------ | ---------------------------------------- |
| `npm run dev:svelte`                 | Vite dev server with HMR                 |
| `npm run build:svelte`               | Production build (Vite)                  |
| `npm run serve`                      | Static server on `127.0.0.1:8795`        |
| `npm run test`                       | Shell, CSS ownership, and cache checks   |
| `npm run test:contract`              | Structural JS/DOM contract tests         |
| `npm run qa:contract:all`            | Fast DOM/layout assertions (17 surfaces) |
| `npm run qa:surface:all`             | Visual screenshot audit (22 states)      |
| `npm run qa:short-landscape:release` | Constrained layout + transition behavior |

## QA & Verification

**Contract tests** (`tests/surface-contract-check.mjs`) — fast DOM/layout assertions for named UI states. No screenshots.

**Visual audit** (`tests/visual-state-audit.mjs`) — captures screenshots and layout snapshots for all documented states. Output: `tmp/semantic-ui-visual-audit/<run-id>/`.

**Short-landscape QA** — run `npm run qa:short-landscape:release` for constrained layout and transition coverage.

## Deployment

Production builds output to `dist/svelte/`. The canonical local shell:

```text
src/index.html → dist/svelte/index.html
```

Live URL:

```text
https://mccullough.cloud/semantic-demo/vector-explorer-polished.html
```

## Documentation

- `docs/archive/w38-charter-2026-06-17.md` — current charter
- `docs/archive/w40-bundle-audit-2026-06-18.md` — bundle analysis
- `docs/performance-budget.md` — performance ceilings
- `docs/semantic-demo-design-tokens.md` — design token reference
- `docs/semantic-demo-state-transition-table.md` — state machine truth table
- `docs/semantic-demo-surface-style-matrix.md` — surface ↔ style mapping
- `docs/archive/bug-thread-inspector-baseline-and-activation-2026-06-18.md` — bug archive
- `docs/archive/a11y-baseline-2026-06-18.md` — accessibility baseline
- `docs/window-global-allowlist.md` — window/global policy
- `docs/archive/` — historical migration docs, charters, and audit reports
- `AGENTS.md` — local agent guidance
- `TEST_STRATEGY.md` — verification strategy

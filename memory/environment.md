# Environment — semantic-explorer

Local dev commands and environment details safe to store. No secrets.

## Dev servers
| Command | URL | Description |
|---|---|---|
| `npm run serve` | `http://127.0.0.1:8795` | Python static server (legacy JS track) |
| `npm run dev:svelte` | `http://localhost:5173` | Vite dev server (Svelte/TS track) |
| `npm run preview:svelte` | `http://localhost:4173` | Vite preview (production Svelte build) |

## Build commands
| Command | Output |
|---|---|
| `npm run build` | `dist/bundle.js` (esbuild, legacy JS) |
| `npm run build:svelte` | `dist/svelte/` (Vite, Svelte/TS) |
| `npm run watch` | esbuild watch mode (legacy JS) |

## Lint / format
| Command | Description |
|---|---|
| `npm run lint` | ESLint `js/` and `tests/` |
| `npm run lint:fix` | ESLint with auto-fix |
| `npm run format` | Prettier write |

## Typecheck
| Command | Description |
|---|---|
| `npm run check` | svelte-check + vite build (Svelte track) |
| `npm run typecheck` | tsc --noEmit (TS migration files) |

## Deploy
| Command | Description |
|---|---|
| `npm run deploy` | Production deploy via `deploy.ps1` |
| `npm run deploy:dryrun` | Dry-run deploy |

## Debug flags (URL params)
| Flag | Effect |
|---|---|
| `?demo=force` | Re-trigger micro-demo even if already seen |
| `?nodemo=1` | Suppress micro-demo entirely |

## Toolchain
- **Runtime:** Node.js (ESM via `"type": "module"`)
- **Bundler (legacy):** esbuild
- **Bundler (Svelte):** Vite
- **UI framework:** Svelte 5
- **3D engine:** Three.js (`three` package, matched `@types/three`)
- **Testing:** Vitest (unit), Playwright (contract/visual), Node contract checks
- **Linting:** ESLint flat config (`eslint.config.js`)
- **Formatting:** Prettier (`.prettierrc`)
- **Type checking:** TypeScript 6.x + svelte-check

## Key config files
| Path | Role |
|---|---|
| `vite.config.ts` | Vite config (root: `src/`, proxies `/api/*` to `127.0.0.1:8795`) |
| `tsconfig.json` | TypeScript config for Svelte track |
| `tsconfig.typecheck.json` | TS config for migration typechecking |
| `eslint.config.js` | ESLint flat config |
| `.prettierrc` | Prettier config |
| `.env.example` | Environment variable template (no secrets) |

# Environment — semantic-explorer

Local dev commands and environment details safe to store. No secrets.

## Dev servers

| Command | URL | Description |
|---|---|---|
| `php -S 127.0.0.1:8795 -t .` | `http://127.0.0.1:8795` | PHP CLI server (PR-N): executes `/api.php` AND serves static files. Replaces the legacy `npm run serve` for dev. PR-N auto-locates `data.dat` from `src/`. |
| `npm run dev:svelte` | `http://localhost:5173` | Vite dev server (Svelte/TS track, proxies `/api*` to 8795) |
| `npm run preview:svelte` | `http://localhost:4173` | Vite preview (production Svelte build) |
| `npm run serve` | `http://127.0.0.1:8795` | **DEPRECATED** for dev — Python static server returns `api.php` as raw text. Use `php -S` instead. Kept in `package.json` for legacy rollback only. |

## Build commands

| Command | Output |
|---|---|
| `npm run build` | `dist/svelte/` (Vite, Svelte/TS production shell) |
| `npm run build:svelte` | `dist/svelte/` (Vite, Svelte/TS) |
| `npm run watch` | Vite build watch mode |

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
- **Bundler:** Vite
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

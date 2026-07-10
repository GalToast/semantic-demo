# Deploy Checklist — Regenerate CSP + Align Svelte Build

**Target:** `mccullough.cloud/semantic-demo/` · **Updated:** 2026-07-09

Executes the "deploy gate" from project memory: when aligning the live site
with the current repo build, the `.htaccess` CSP and `csp-static` must be
updated **together** and shipped with the build.

## Topology (verified via SSH)

- **Live webroot:** `~/domains/mccullough.cloud/public_html/semantic-demo/`
  (Hostinger). **NOT** `~/public_html/semantic-demo/` — that path is a stale
  duplicate tree; ignore it.
- **Deploy command:** `npm run deploy` → `deploy.ps1` (PowerShell). SCP via
  port `65002` to the real webroot. Ships `dist/svelte/*` **and** repo
  `.htaccess`.
- **Obsolete:** the server-side `deploy.sh` (targets the stale path) — do not
  use.
- **Current live build:** the new Svelte build (asset-based
  `./assets/index-*.js`, no importmap, no `bundle.js`) is already deployed,
  but as an **older variant that pulls Google Fonts from `fonts.googleapis.com`**.
  The repo HEAD build uses **self-hosted fonts** + runtime **unpkg** (Leaflet)
    - **cartocdn** (map tiles).

## The gate (ship CSP with the build)

1. **Regenerate `repo .htaccess` CSP** to match the repo HEAD build:
    - **DROP:** `cdn.jsdelivr.net`, `fonts.googleapis.com`, `fonts.gstatic.com`,
      the dead `sha256-lGEOGK…` hash (matches no inline script in any build),
      `ai.api.nvidia.com` (no reranker hosted).
    - **ADD:** `https://unpkg.com` (Leaflet JS+CSS, injected at runtime),
      `https://basemaps.cartocdn.com` (map tiles).
    - **KEEP:** `'self'`, `'unsafe-inline'` (inline `<style>`), `data:`,
      `https://api.open-meteo.com` (weather widget), `worker-src 'self'`.
    - **Manifest:** `tests/csp-static-check.mjs` `knownOrigins` is authoritative.

2. **Update `tests/csp-static-check.mjs` `knownOrigins`:** drop
   `ai.api.nvidia.com` from `connect-src` (no reranker). It should then be
   **GREEN**.

3. **`node tests/csp-static-check.mjs`** → must be green.

4. **`npm run deploy`** — builds `dist/svelte`, refreshes cache busters, runs
   `check:shell` + `check:cache`, backs up the remote, and SCPs `dist/svelte/*`
    - `.htaccess` to the real webroot. No separate `.htaccess` SCP is needed
      (deploy.ps1 already ships it).

5. **Verify live:**
    - `curl -sI https://mccullough.cloud/semantic-demo/ | grep -i content-security-policy`
      → new CSP present.
    - Load the page; **console must show no CSP violations** (especially
      `unpkg` / `cartocdn`).
    - `node tests/csp-static-check.mjs` still green (reads repo `.htaccess`;
      deploy shipped it).
    - `npm run qa:reduced-motion-scene` (or the corrected `tmp/rm-investigate.mjs`)
      → scene renders, no white washout.

## Cleanup (defense-in-depth; not live but confusing)

- Stale duplicate `~/public_html/semantic-demo/` — leave or remove per
  preference (DEPLOY_STATUS warns it is stale and not served).
- Any graveyard bundle files in the real webroot `dist/` (if present).

## Notes

- `deploy.ps1` already ships `.htaccess`, so regenerating the repo `.htaccess`
    - `npm run deploy` is the entire fix — there is no separate "edit .htaccess
      on server" step.
- The reduced-motion diagnostic (`tests/reduced-motion-scene-diagnostic.mjs`)
  is currently **broken** (serves repo root instead of `dist/svelte`, never
  forces WebGL) → false `canvas-missing` failure. Corrected harness:
  `tmp/rm-investigate.mjs`. No actual reduced-motion rendering bug was found —
  the scene renders correctly under `prefers-reduced-motion`.
- No reranker is hosted. `rerank.ts` (NVIDIA NIM, off-by-default, client-side
  key) is effectively dead. `qwen-embed` (`:8019`, `Qwen3-Embedding-0.6B`) +
  `public_semantic_search` (`:8020`) are server-side (localhost), reached via
  `api.php` — no browser CSP entry.

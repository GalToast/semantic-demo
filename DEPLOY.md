# Deploying semantic-demo

## Prerequisites

- SSH alias `mccullough-cloud` configured in `~/.ssh/config` pointing to the live server on port 65002
- `npm install` run locally to install dependencies
- Canonical live path: `/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/`
- Do not deploy this project to `~/public_html/semantic-demo/`; that is a stale duplicate tree on this account.

## Svelte Production Entry Contract

The production app shell is `src/index.html`, built by Vite to `dist/svelte/index.html`.

Deploy scripts publish that built shell as both:

- `/semantic-demo/index.html`
- `/semantic-demo/vector-explorer-polished.html`

The second path preserves the historical URL while running the same Svelte build. The old root `index.html` in the repo remains a front door/case-study page and is not the app shell.

Before changing or deploying the live explorer, build and run the shell/build guards:

```bash
npm run build
npm run refresh:cache
npm run check:shell
npm run check:cache
```

`npm run refresh:cache` is now a compatibility no-op for production JS/CSS hashes because Vite emits content-hashed files under `dist/svelte/assets/`.

## Deploy Steps

1. **Build** - Generates `dist/svelte/` from the Svelte/Vite source:
   ```bash
   npm run build
   ```

2. **Verify shell and build output**:
   ```bash
   npm run check:shell
   npm run check:cache
   ```

3. **Create rollback backup** - The deploy scripts preserve the live payload before SCP outside `public_html` at:
   ```text
   /home/u741831384/backups/semantic-demo/deploy-YYYYMMDD-HHMMSS
   ```

4. **Push Vite output** - Deploy the explicit `dist/svelte` payload: `index.html`, `assets/`, `css/`, root CSS files, semantic data artifacts, `scripts/leadEnrichment.public.json`, `.htaccess`, and the scanner.js copies.

## Combined Deploy

```bash
npm run deploy
npm run deploy:dryrun
```

`npm run deploy` delegates to `deploy.ps1` on this Windows workspace. `deploy.ps1` and `deploy.sh` must remain equivalent: build, run shell/build guards, create a remote rollback backup, then push the explicit Svelte output payload to the canonical domain paths.

## Files Pushed

| Local File | Remote Destination |
|---|---|
| `dist/svelte/index.html` | `/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/index.html` |
| `dist/svelte/index.html` | `/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/vector-explorer-polished.html` |
| `dist/svelte/assets/*` | `/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/assets/*` |
| `dist/svelte/css/*` | `/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/css/*` |
| `dist/svelte/semantic-demo.css` | `/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/semantic-demo.css` |
| `dist/svelte/vector-explorer-pandora.css` | `/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/vector-explorer-pandora.css` |
| `dist/svelte/data.dat*` | `/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/data.dat*` |
| `dist/svelte/semantic_threads*.dat` | `/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/semantic_threads*.dat` |
| `dist/svelte/semantic_space_layout_manifest.json` | `/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/semantic_space_layout_manifest.json` |
| `dist/svelte/scripts/leadEnrichment.public.json` | `/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/scripts/leadEnrichment.public.json` |
| `.htaccess` | `/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/.htaccess` |
| `../js/scanner.js` | `/home/u741831384/domains/mccullough.cloud/public_html/js/scanner.js` |
| `../js/scanner.js` | `/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/js/scanner.js` |

## Notes

- `npm run build` is run inside both deploy scripts before SCP.
- Use `npm run deploy:dryrun`, `.\deploy.ps1 -DryRun`, or `bash deploy.sh --dryrun` before live pushes to confirm the target path.
- On Windows, use `npm run deploy`, `npm run deploy:dryrun`, or `.\deploy.ps1`.
- If a deploy ever writes to `~/public_html/semantic-demo/`, stop and audit before continuing; that path is not the canonical domain webroot.
- `build:legacy` preserves the old esbuild path for rollback/reference only; it is not the production runtime entry.

## Rollback

Rollback can restore the exact server-side payload that existed before a deploy. Each deploy prints the backup path and exact rollback command.

After rollback, re-check live hashes for the pushed files and record the rollback evidence in the related Switchboard task or release report.

## Post-Deploy Smoke

Check the live shell at:

```text
https://mccullough.cloud/semantic-demo/
https://mccullough.cloud/semantic-demo/vector-explorer-polished.html
```

Verify search clear behavior, URL cleanup, console/network health, and the recovered 3D Trail mode markers before calling the deploy complete.

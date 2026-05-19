# Deploying semantic-demo

## Prerequisites

- SSH alias `mccullough-cloud` configured in `~/.ssh/config` pointing to the live server on port 65002
- `npm install` run locally to install dependencies
- Canonical live path: `/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/`
- Do not deploy this project to `~/public_html/semantic-demo/`; that is a stale duplicate tree on this account.

## One App Shell Contract

`vector-explorer-polished.html` is the only browser application shell for the live explorer. It owns the WebGL DOM, the app CSS links, and `dist/bundle.js`. The legacy root stylesheet is `semantic-demo.css`; extracted CSS modules live under `css/` when the shell links them.

`index.html` is only a front door that routes default visitors toward `case-study.html` and links to `vector-explorer-polished.html`; it must not load the app bundle, app stylesheet, canvas DOM, or API behavior.

Before changing or deploying the live explorer, build the bundle and run the shell guard:

```
npm run build
npm run refresh:cache
npm run check:shell
npm run check:cache
```

The deploy scripts build first, refresh the shell cache-buster query strings from current asset hashes, then run these guards before uploading so agents cannot accidentally validate or ship the wrong shell or stale asset references.

## Deploy Steps

1. **Build** - Generates `dist/bundle.js` from source:
   ```
   npm run build
   ```

2. **Refresh cache busters** - Updates `vector-explorer-polished.html` query strings to match the current local CSS and bundle hashes:
   ```
   npm run refresh:cache
   npm run check:cache
   ```

3. **Create rollback backup** - The deploy scripts preserve the live payload before SCP at:
   ```
   /home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/backups/deploy-YYYYMMDD-HHMMSS
   ```

4. **Push bundle** - Upload the bundle to the canonical live server path:
   ```
   scp -P 65002 dist/bundle.js mccullough-cloud:/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/dist/bundle.js
   ```

5. **Push CSS** - Upload the stylesheets referenced by the live HTML:
   ```
   scp -P 65002 semantic-demo.css mccullough-cloud:/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/
   scp -P 65002 -r css mccullough-cloud:/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/
   ```

6. **Push HTML** - Upload the main HTML page:
   ```
   scp -P 65002 vector-explorer-polished.html mccullough-cloud:/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/
   ```

## Combined Deploy

Run both steps with one command:

```bash
# Via npm script
npm run deploy

# Or via platform script
./deploy.ps1
./deploy.sh
```

`npm run deploy` delegates to `deploy.ps1` on this Windows workspace. `deploy.ps1` and `deploy.sh` must remain equivalent: build, run the shell guard, create a remote rollback backup, then push `dist/bundle.js`, `semantic-demo.css`, `css/` modules when present, `vector-explorer-polished.html`, `.htaccess`, and the shared `scanner.js` copies to the canonical domain paths.

## Files Pushed

| Local File | Remote Destination |
|---|---|
| `dist/bundle.js` | `/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/dist/bundle.js` |
| `semantic-demo.css` | `/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/semantic-demo.css` |
| `css/*.css` | `/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/css/*.css` |
| `vector-explorer-pandora.css` | `/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/vector-explorer-pandora.css` |
| `vector-explorer-polished.html` | `/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/vector-explorer-polished.html` |
| `.htaccess` | `/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/.htaccess` |
| `../js/scanner.js` | `/home/u741831384/domains/mccullough.cloud/public_html/js/scanner.js` |
| `../js/scanner.js` | `/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/js/scanner.js` |

## Notes

- `npm run build` is run inside both deploy scripts before SCP.
- `npm run refresh:cache` may update `vector-explorer-polished.html`; it hashes every local `.css` and `.js` asset linked by the shell, including `css/` modules. Review and commit that change with the bundle/CSS release.
- Use `npm run deploy:dryrun`, `.\deploy.ps1 -DryRun`, or `bash deploy.sh --dryrun` before live pushes to confirm the target path.
- On Windows, use `npm run deploy`, `npm run deploy:dryrun`, or `.\deploy.ps1`.
- If a deploy ever writes to `~/public_html/semantic-demo/`, stop and audit before continuing; that path is not the canonical domain webroot.

## Rollback

Rollback can restore the exact server-side payload that existed before a deploy. Each deploy prints the backup path and exact rollback command.

The backup directory contains:

- `dist/bundle.js`
- `semantic-demo.css`
- `css/*.css` when CSS modules exist on the server
- `vector-explorer-polished.html`
- `.htaccess`
- `js/scanner.js`
- `scanner-root.js` for root `/js/scanner.js`

Manual rollback pattern:

```bash
ssh -p 65002 mccullough-cloud 'cp -p "/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/backups/deploy-STAMP/dist/bundle.js" "/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/dist/bundle.js" && cp -p "/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/backups/deploy-STAMP/semantic-demo.css" "/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/semantic-demo.css" && cp -p "/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/backups/deploy-STAMP/vector-explorer-polished.html" "/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/vector-explorer-polished.html" && cp -p "/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/backups/deploy-STAMP/.htaccess" "/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/.htaccess" && cp -p "/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/backups/deploy-STAMP/js/scanner.js" "/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/js/scanner.js" && cp -p "/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/backups/deploy-STAMP/scanner-root.js" "/home/u741831384/domains/mccullough.cloud/public_html/js/scanner.js"'
```

After rollback, re-check live hashes for the pushed files and record the rollback evidence in the related Switchboard task or release report.

## Post-Deploy Smoke

Check the live shell at:

```text
https://mccullough.cloud/semantic-demo/vector-explorer-polished.html
```

Verify search clear behavior, URL cleanup, console/network health, and the recovered 3D Trail mode markers before calling the deploy complete.

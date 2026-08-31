# npm Scripts Inventory

Generated from package.json (manually curated, update on script changes).

**Scale:** 94 scripts (pruned 2026-08-28: 51 verified-dead entries removed — see tmp/reports/script-audit-REPORT.md).

## Key entry points

| Script      | Purpose                                                                                 |
| ----------- | --------------------------------------------------------------------------------------- |
| `build`     | npm run build:svelte                                                                    |
| `test`      | npm run test:static && npm run test:unit                                                |
| `test:unit` | vitest run --config vitest.config.js                                                    |
| `test:fast` | npm run test:static                                                                     |
| `check`     | npm run verify:syntax && npm run check:svelte && npm run build:svelte                   |
| `lint`      | eslint "{js,tests}/**/\*.{js,ts}" && eslint "src/**/\*.{ts,svelte}" --max-warnings=9999 |
| `serve`     | php -S 127.0.0.1:8795 -t .                                                              |

## `audit:` family (3)

| Script              | Command (truncated)                    | Wired? |
| ------------------- | -------------------------------------- | ------ |
| `audit:a11y`        | `node scripts/audit-a11y.mjs`          | manual |
| `audit:a11y:json`   | `node scripts/audit-a11y.mjs --json`   | manual |
| `audit:a11y:strict` | `node scripts/audit-a11y.mjs --strict` | manual |

## `build:` family (3)

| Script         | Command (truncated)                                                    | Wired? |
| -------------- | ---------------------------------------------------------------------- | ------ |
| `build`        | `npm run build:svelte`                                                 | yes    |
| `build:svelte` | `vite build --config vite.config.ts && npm run check:data-compression` | yes    |

## `check:` family (26)

| Script                   | Command (truncated)                                                                                    | Wired? |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | ------ |
| `check`                  | `npm run verify:syntax && npm run check:svelte && npm run build:svelte`                                | yes    |
| `check:bridges`          | `node scripts/check-bridge-references.mjs`                                                             | yes    |
| `check:cache`            | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/cache-buster-check.js`                      | yes    |
| `check:config-topology`  | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/config-topology-env-contract.mjs`           | yes    |
| `check:data-compression` | `node scripts/check-data-compression.mjs`                                                              | yes    |
| `check:dist-integrity`   | `node scripts/qa-deploy-preflight.mjs --dist-only`                                                     | manual |
| `check:journey`          | `node scripts/qa-journey-gate.mjs`                                                                     | manual |
| `check:manifest`         | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/css-manifest-contract.mjs && node --loa...` | yes    |
| `check:model-catalog`    | `node tests/model-catalog-sweep.mjs`                                                                   | manual |
| `check:ownership`        | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/css-ownership-sweep.mjs`                    | yes    |
| `check:param-prop`       | `node tests/param-property-loader-sweep.mjs`                                                           | manual |
| `check:script-targets`   | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/package-script-targets-contract.mjs`        | yes    |
| `check:semantic-space`   | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/semantic-space-audit.mjs && node --load...` | yes    |
| `check:shell`            | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/shell-contract-check.js && node --loade...` | yes    |
| `check:skills`           | `node scripts/check-skill-loads.mjs`                                                                   | yes    |
| `check:surface-styles`   | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/surface-style-matrix-contract.mjs`          | yes    |
| `check:svelte`           | `svelte-check --workspace src --tsconfig tsconfig.json --diagnostic-sources svelte,css`                | yes    |
| `check:tdb-fidelity`     | `node scripts/tdb1-fidelity-ci.mjs`                                                                    | manual |
| `check:tokens`           | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/design-token-sweep.mjs`                     | yes    |
| `check:ts-progress`      | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/ts-js-drift-contract.mjs --progress`        | manual |

## `deploy:` family (2)

| Script          | Command (truncated)                                                      | Wired? |
| --------------- | ------------------------------------------------------------------------ | ------ |
| `deploy`        | `powershell -NoProfile -ExecutionPolicy Bypass -File deploy.ps1`         | manual |
| `deploy:dryrun` | `powershell -NoProfile -ExecutionPolicy Bypass -File deploy.ps1 -DryRun` | manual |

## `dev:` family (1)

| Script       | Command (truncated)            | Wired? |
| ------------ | ------------------------------ | ------ |
| `dev:svelte` | `vite --config vite.config.ts` | manual |

## `eval:` family (1)

| Script | Command (truncated) | Wired? |
| ------ | ------------------- | ------ |

## `format:` family (1)

| Script   | Command (truncated)                              | Wired? |
| -------- | ------------------------------------------------ | ------ |
| `format` | `prettier --write "{js,tests}/**/*.{js,ts,css}"` | manual |

## `gate:` family (1)

| Script | Command (truncated)           | Wired? |
| ------ | ----------------------------- | ------ |
| `gate` | `node scripts/smoke-gate.mjs` | manual |

## `git:` family (3)

| Script               | Command (truncated)                                                                                    | Wired? |
| -------------------- | ------------------------------------------------------------------------------------------------------ | ------ |
| `git:hook:check`     | `node -e "const {execSync}=require('child_process');const p=require('path');process.platform==='wi...` | manual |
| `git:hook:install`   | `pwsh -NoLogo -NoProfile -Command "Copy-Item -Path 'scripts/git-hooks/pre-commit' -Destination '.g...` | manual |
| `git:hook:uninstall` | `pwsh -NoLogo -NoProfile -Command "Remove-Item -Path '.git/hooks/pre-commit' -Force -ErrorAction S...` | manual |

## `lint:` family (3)

| Script            | Command (truncated)                                                                     | Wired? |
| ----------------- | --------------------------------------------------------------------------------------- | ------ |
| `lint`            | `eslint "{js,tests}/**/*.{js,ts}" && eslint "src/**/*.{ts,svelte}" --max-warnings=9999` | manual |
| `lint:nav-mirror` | `node scripts/ci-check-nav-mirror-pattern.mjs`                                          | manual |
| `lint:tests`      | `eslint "tests/**/*.{js,ts}" --no-warn-ignored`                                         | manual |

## `mcp:` family (1)

| Script        | Command (truncated)                                                           | Wired? |
| ------------- | ----------------------------------------------------------------------------- | ------ |
| `mcp:recover` | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/mcp-recover.ps1` | manual |

## `models:` family (6)

| Script                     | Command (truncated)                                                                                    | Wired? |
| -------------------------- | ------------------------------------------------------------------------------------------------------ | ------ |
| `models:canonical-catalog` | `node scripts/build-model-catalog.mjs --write-projection`                                              | manual |
| `models:capability-status` | `node scripts/build-model-capability-status.mjs --catalog=tmp/phone-model-parity/canonical-model-c...` | manual |
| `models:reconcile-runtime` | `node scripts/reconcile-model-catalog.mjs`                                                             | manual |
| `models:phone-health`      | `node scripts/phone-model-health.mjs --phone-router=http://127.0.0.1:18789 --limit=8 --markdown`       | manual |
| `models:verify-catalog`    | `node scripts/verify-model-catalog.mjs`                                                                | manual |

## `phone:` family (2)

| Script                 | Command (truncated)                           | Wired? |
| ---------------------- | --------------------------------------------- | ------ |
| `phone:deploy-catalog` | `node scripts/deploy-phone-model-catalog.mjs` | manual |

## `preview:` family (1)

| Script           | Command (truncated)                    | Wired? |
| ---------------- | -------------------------------------- | ------ |
| `preview:svelte` | `vite preview --config vite.config.ts` | manual |

## `prune:` family (2)

| Script | Command (truncated) | Wired? |
| ------ | ------------------- | ------ |

## `qa:` family (53)

| Script                          | Command (truncated)                                                                                    | Wired? |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ | ------ |
| `qa:3d`                         | `SEMANTIC_USE_D3D11=1 PLAYWRIGHT_STRICT_FRESH=1 npx playwright test tests/3d-*.spec.js --browser=c...` | yes    |
| `qa:3d:fresh`                   | `npm run build && npm run qa:3d`                                                                       | manual |
| `qa:adversarial`                | `npx playwright test tests/polish-adversarial.spec.js --browser=chromium --headed`                     | manual |
| `qa:android`                    | `node scripts/qa-android.mjs`                                                                          | manual |
| `qa:contract`                   | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/surface-contract-check.mjs --headed`        | manual |
| `qa:contract:mobile-critical`   | `node scripts/qa.mjs contract --preset=mobile-critical --headed`                                       | manual |
| `qa:journey`                    | `npx playwright test tests/widget-journey.spec.js tests/widget-journey-smoke.spec.js --browser=chr...` | yes    |
| `qa:journey:fresh`              | `npm run build && npm run qa:journey`                                                                  | manual |
| `qa:journey:headless`           | `node scripts/qa-journey-headless.mjs`                                                                 | yes    |
| `qa:journey:smoke`              | `npx playwright test tests/widget-journey-smoke.spec.js --browser=chromium`                            | yes    |
| `qa:live-reset`                 | `npx playwright test tests/live-reset-clear-demo-proof.spec.js --browser=chromium --headed`            | manual |
| `qa:mapview-placeholder`        | `npx playwright test tests/mapview-placeholder-journey.spec.js --browser=chromium`                     | manual |
| `qa:paint-budget`               | `node tests/paint-metrics-gate.mjs`                                                                    | manual |
| `qa:product-playthrough`        | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/product-playthrough-audit.mjs --headed`     | yes    |
| `qa:scene-health`               | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/three-scene-playtest.mjs`                   | manual |
| `qa:server`                     | `node scripts/qa-server.mjs start`                                                                     | manual |
| `qa:server:ensure`              | `node scripts/qa-server.mjs ensure`                                                                    | manual |
| `qa:server:status`              | `node scripts/qa-server.mjs status`                                                                    | manual |
| `qa:server:stop`                | `node scripts/qa-server.mjs stop`                                                                      | manual |
| `qa:short-landscape`            | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/short-landscape-layout-contract.mjs && ...` | yes    |
| `qa:short-landscape:release`    | `npm run qa:short-landscape && npm run qa:short-landscape:transition`                                  | manual |
| `qa:short-landscape:transition` | `npx playwright test tests/short-landscape-transition-ui-paths.spec.js --browser=chromium --worker...` | yes    |
| `qa:visual`                     | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/visual-state-audit.mjs --headed`            | manual |

## `refresh:` family (1)

| Script          | Command (truncated)                                                                     | Wired? |
| --------------- | --------------------------------------------------------------------------------------- | ------ |
| `refresh:cache` | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/cache-buster-check.js --fix` | manual |

## `report:` family (1)

| Script             | Command (truncated)                      | Wired? |
| ------------------ | ---------------------------------------- | ------ |
| `report:artifacts` | `node scripts/report-artifact-volume.js` | manual |

## `serve:` family (1)

| Script  | Command (truncated)          | Wired? |
| ------- | ---------------------------- | ------ |
| `serve` | `php -S 127.0.0.1:8795 -t .` | manual |

## `sg:` family (1)

| Script | Command (truncated) | Wired? |
| ------ | ------------------- | ------ |
| `sg`   | `ast-grep`          | manual |

## `sweep:` family (1)

| Script  | Command (truncated)                                                                  | Wired? |
| ------- | ------------------------------------------------------------------------------------ | ------ |
| `sweep` | `node scripts/tmp-ttl-sweep.mjs --apply --days=14 && node scripts/harness-sweep.mjs` | manual |

## `test:` family (18)

| Script                  | Command (truncated)                                                                                    | Wired? |
| ----------------------- | ------------------------------------------------------------------------------------------------------ | ------ |
| `test`                  | `npm run test:static && npm run test:unit`                                                             | manual |
| `test:a11y`             | `playwright test tests/integration/a11y-baseline.spec.js --browser=chromium`                           | manual |
| `test:contract`         | `node tests/run-all-contracts.js`                                                                      | manual |
| `test:contract:core`    | `node tests/run-all-contracts.js --group=core`                                                         | manual |
| `test:contract:smoke`   | `node tests/run-all-contracts.js --group=smoke`                                                        | yes    |
| `test:fast`             | `npm run test:static`                                                                                  | manual |
| `test:help`             | `node scripts/test-help.mjs`                                                                           | manual |
| `test:static`           | `npm run check:shell && npm run check:skills && npm run check:manifest && npm run check:cache && n...` | yes    |
| `test:svelte-migration` | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/verify-svelte-migration.mjs`                | manual |
| `test:unit`             | `vitest run --config vitest.config.js`                                                                 | yes    |
| `test:visual`           | `npx tsx tests/visual-regression.test.ts`                                                              | manual |

## `typecheck:` family (2)

| Script      | Command (truncated)                       | Wired? |
| ----------- | ----------------------------------------- | ------ |
| `typecheck` | `tsc --noEmit -p tsconfig.typecheck.json` | yes    |

## `verify:` family (2)

| Script            | Command (truncated)                         | Wired? |
| ----------------- | ------------------------------------------- | ------ |
| `verify:3d-tests` | `node scripts/verify-3d-test-admission.mjs` | manual |
| `verify:syntax`   | `node scripts/verify-syntax.mjs`            | yes    |

## `watch:` family (1)

| Script  | Command (truncated)                          | Wired? |
| ------- | -------------------------------------------- | ------ |
| `watch` | `vite build --config vite.config.ts --watch` | manual |

_Inventory generated from package.json definitions; `Wired?` = referenced by another npm script (verify/CI chains)._

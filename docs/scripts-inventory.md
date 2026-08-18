# npm Scripts Inventory

Generated from package.json (manually curated, update on script changes).

**Scale:** 136 scripts \| 29 invoked-by-other-scripts \| 107 manual/orphan entries.

## Key entry points

| Script      | Purpose                                                                                |
| ----------- | -------------------------------------------------------------------------------------- |
| `build`     | npm run build:svelte                                                                   |
| `test`      | npm run test:static && npm run test:unit                                               |
| `test:unit` | vitest run --config vitest.config.js                                                   |
| `test:fast` | npm run test:static                                                                    |
| `check`     | npm run verify:syntax && npm run check:svelte && npm run build:svelte                  |
| `lint`      | eslint "{js,tests}/**/\*.{js,ts}" && eslint "src/**/*.{ts,svelte}" --max-warnings=9999 |
| `serve`     | python -m http.server 8795 --bind 127.0.0.1                                            |

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
| `build:safe`   | `npm run check`                                                        | manual |
| `build:svelte` | `vite build --config vite.config.ts && npm run check:data-compression` | yes    |

## `check:` family (26)

| Script                          | Command (truncated)                                                                                    | Wired? |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ | ------ |
| `check`                         | `npm run verify:syntax && npm run check:svelte && npm run build:svelte`                                | yes    |
| `check:android`                 | `node tests/qa-android-contract.mjs`                                                                   | manual |
| `check:bridges`                 | `node scripts/check-bridge-references.mjs`                                                             | yes    |
| `check:cache`                   | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/cache-buster-check.js`                      | yes    |
| `check:config-topology`         | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/config-topology-env-contract.mjs`           | yes    |
| `check:css-minified`            | `node tests/css-minification-build-output-contract.mjs`                                                | manual |
| `check:data-compression`        | `node scripts/check-data-compression.mjs`                                                              | yes    |
| `check:dist-integrity`          | `node scripts/qa-deploy-preflight.mjs --dist-only`                                                     | manual |
| `check:journey`                 | `node scripts/qa-journey-gate.mjs`                                                                     | manual |
| `check:legacy-budget`           | `node scripts/check-legacy-ts-budget.mjs`                                                              | manual |
| `check:manifest`                | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/css-manifest-contract.mjs && node --loa...` | yes    |
| `check:model-capability-status` | `node tests/model-capability-status-sweep.mjs`                                                         | manual |
| `check:model-catalog`           | `node tests/model-catalog-sweep.mjs`                                                                   | manual |
| `check:ownership`               | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/css-ownership-sweep.mjs`                    | yes    |
| `check:param-prop`              | `node tests/param-property-loader-sweep.mjs`                                                           | manual |
| `check:phone-farm`              | `node tests/phone-model-sweep.mjs && node tests/model-capability-status-sweep.mjs && node tests/mo...` | manual |
| `check:phone-model-parity`      | `node tests/phone-model-sweep.mjs`                                                                     | manual |
| `check:script-targets`          | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/package-script-targets-contract.mjs`        | yes    |
| `check:semantic-space`          | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/semantic-space-audit.mjs && node --load...` | yes    |
| `check:shell`                   | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/shell-contract-check.js && node --loade...` | yes    |
| `check:skills`                  | `node scripts/check-skill-loads.mjs`                                                                   | yes    |
| `check:surface-styles`          | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/surface-style-matrix-contract.mjs`          | yes    |
| `check:svelte`                  | `svelte-check --workspace src --tsconfig tsconfig.json --diagnostic-sources svelte,css`                | yes    |
| `check:tdb-fidelity`            | `node scripts/tdb1-fidelity-ci.mjs`                                                                    | manual |
| `check:tokens`                  | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/design-token-sweep.mjs`                     | yes    |
| `check:ts-progress`             | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/ts-js-drift-contract.mjs --progress`        | manual |

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

| Script    | Command (truncated)                                                                                    | Wired? |
| --------- | ------------------------------------------------------------------------------------------------------ | ------ |
| `eval:ci` | `node scripts/eval-harness.mjs --ci=tmp/eval-manifest.ci.json && node scripts/eval-harness.mjs --s...` | manual |

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

## `models:` family (5)

| Script                     | Command (truncated)                                                                                    | Wired? |
| -------------------------- | ------------------------------------------------------------------------------------------------------ | ------ |
| `models:canonical-catalog` | `node scripts/build-model-catalog.mjs --write-projection`                                              | manual |
| `models:capability-status` | `node scripts/build-model-capability-status.mjs --catalog=tmp/phone-model-parity/canonical-model-c...` | manual |
| `models:phone-health`      | `node scripts/phone-model-health.mjs --phone-router=http://127.0.0.1:18789 --limit=8 --markdown`       | manual |
| `models:phone-parity`      | `node scripts/phone-model-parity.mjs`                                                                  | manual |
| `models:verify-catalog`    | `node scripts/verify-model-catalog.mjs`                                                                | manual |

## `phone:` family (2)

| Script                    | Command (truncated)                              | Wired? |
| ------------------------- | ------------------------------------------------ | ------ |
| `phone:deploy-catalog`    | `node scripts/deploy-phone-model-catalog.mjs`    | manual |
| `phone:deploy-projection` | `node scripts/deploy-phone-model-projection.mjs` | manual |

## `preview:` family (1)

| Script           | Command (truncated)                    | Wired? |
| ---------------- | -------------------------------------- | ------ |
| `preview:svelte` | `vite preview --config vite.config.ts` | manual |

## `prune:` family (2)

| Script                | Command (truncated)                                                      | Wired? |
| --------------------- | ------------------------------------------------------------------------ | ------ |
| `prune:artifacts`     | `node scripts/report-artifact-volume.js --prune-dry-run`                 | manual |
| `prune:artifacts:now` | `node scripts/report-artifact-volume.js --prune-dry-run --execute --yes` | manual |

## `qa:` family (53)

| Script                               | Command (truncated)                                                                                    | Wired? |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------ |
| `qa:3d`                              | `SEMANTIC_USE_D3D11=1 PLAYWRIGHT_STRICT_FRESH=1 npx playwright test tests/3d-*.spec.js --browser=c...` | yes    |
| `qa:3d:fresh`                        | `npm run build && npm run qa:3d`                                                                       | manual |
| `qa:adversarial`                     | `npx playwright test tests/polish-adversarial.spec.js --browser=chromium --headed`                     | manual |
| `qa:android`                         | `node scripts/qa-android.mjs`                                                                          | manual |
| `qa:camera-ownership`                | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/focus-camera-ownership-contract.mjs`        | manual |
| `qa:canvas-hit-test`                 | `npx playwright test tests/canvas-hit-test-interaction.spec.js --browser=chromium --headed`            | manual |
| `qa:contract`                        | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/surface-contract-check.mjs --headed`        | manual |
| `qa:contract:mobile-critical`        | `node scripts/qa.mjs contract --preset=mobile-critical --headed`                                       | manual |
| `qa:contract:phase-a`                | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/surface-contract-check.mjs --surfaces=i...` | manual |
| `qa:contract:phase-b`                | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/surface-contract-check.mjs --surfaces=f...` | manual |
| `qa:desktop-critical`                | `node scripts/qa.mjs visual --states=07-desktop-idle,08-desktop-search-coffee,11-desktop-selected-...` | manual |
| `qa:focus-readability`               | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/focus-camera-readability-contract.mjs`      | manual |
| `qa:focus-stage-render`              | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/focus-stage-render-contract.mjs`            | manual |
| `qa:interaction-ownership`           | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/focus-interaction-ownership-contract.mjs`   | manual |
| `qa:journey`                         | `npx playwright test tests/widget-journey.spec.js tests/widget-journey-smoke.spec.js --browser=chr...` | yes    |
| `qa:journey:fresh`                   | `npm run build && npm run qa:journey`                                                                  | manual |
| `qa:journey:fresh:headless`          | `npm run build && npm run qa:journey:headless`                                                         | manual |
| `qa:journey:fresh:smoke`             | `npm run build && npm run qa:journey:smoke`                                                            | manual |
| `qa:journey:headless`                | `node scripts/qa-journey-headless.mjs`                                                                 | yes    |
| `qa:journey:live`                    | `npx playwright test tests/widget-journey.spec.js --browser=chromium --workers=1 --grep @live`         | manual |
| `qa:journey:smoke`                   | `npx playwright test tests/widget-journey-smoke.spec.js --browser=chromium`                            | yes    |
| `qa:live-reset`                      | `npx playwright test tests/live-reset-clear-demo-proof.spec.js --browser=chromium --headed`            | manual |
| `qa:live-reset-interaction`          | `npx playwright test tests/live-ui-reset-interaction.spec.js --browser=chromium --headed`              | manual |
| `qa:live-semantic-roles`             | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/live-semantic-roles-contract.mjs`           | manual |
| `qa:live-step-inside`                | `npx playwright test tests/live-step-inside-url-body-state-sync.spec.js --browser=chromium --headed`   | manual |
| `qa:mapview-placeholder`             | `npx playwright test tests/mapview-placeholder-journey.spec.js --browser=chromium`                     | manual |
| `qa:micro-interactions`              | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/micro-surface-interactions-contract.mjs`    | manual |
| `qa:mobile-visual`                   | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/mobile-visual-qa-contract.mjs`              | manual |
| `qa:mode-chip`                       | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/mode-chip-state-render-contract.mjs`        | manual |
| `qa:motion-state`                    | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/motion-state-contract.mjs`                  | manual |
| `qa:product-playthrough`             | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/product-playthrough-audit.mjs --headed`     | yes    |
| `qa:real-route:visual`               | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/product-playthrough-audit.mjs --real-ro...` | manual |
| `qa:reduced-motion-scene`            | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/reduced-motion-scene-diagnostic.mjs`        | manual |
| `qa:reduced-motion-transition`       | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/reduced-motion-transition-contract.mjs`     | manual |
| `qa:release-mobile-ownership`        | `npm run qa:ui-quality && node scripts/qa.mjs visual --states=11-mobile-selected-card-map-trail,24...` | manual |
| `qa:release-mobile-ownership:headed` | `npm run qa:ui-quality && node scripts/qa.mjs visual --states=11-mobile-selected-card-map-trail,24...` | manual |
| `qa:reset-map-ownership`             | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/reset-map-interaction-ownership-contrac...` | manual |
| `qa:role-traversal`                  | `npx playwright test tests/semantic-role-traversal.spec.js --browser=chromium --workers=1 --headed`    | manual |
| `qa:route-ergonomics`                | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/product-playthrough-audit.mjs --real-ro...` | manual |
| `qa:scene-health`                    | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/three-scene-playtest.mjs`                   | manual |
| `qa:semantic-guide-fallback`         | `npx playwright test tests/semantic-guide-fallback-contract.spec.js --browser=chromium --headed`       | manual |
| `qa:serve`                           | `node scripts/qa-serve.mjs`                                                                            | manual |
| `qa:server`                          | `node scripts/qa-server.mjs start`                                                                     | manual |
| `qa:server:ensure`                   | `node scripts/qa-server.mjs ensure`                                                                    | manual |
| `qa:server:status`                   | `node scripts/qa-server.mjs status`                                                                    | manual |
| `qa:server:stop`                     | `node scripts/qa-server.mjs stop`                                                                      | manual |
| `qa:short-landscape`                 | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/short-landscape-layout-contract.mjs && ...` | yes    |
| `qa:short-landscape:release`         | `npm run qa:short-landscape && npm run qa:short-landscape:transition`                                  | manual |
| `qa:short-landscape:transition`      | `npx playwright test tests/short-landscape-transition-ui-paths.spec.js --browser=chromium --worker...` | yes    |
| `qa:surface-redundancy`              | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/surface-redundancy-contract.mjs`            | manual |
| `qa:ui-quality`                      | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/ui-quality-contract.mjs --headed`           | yes    |
| `qa:ui-renderers-seam`               | `npx playwright test tests/ui-renderers-validation.spec.js --browser=chromium --headed`                | manual |
| `qa:visual`                          | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/visual-state-audit.mjs --headed`            | manual |

## `refresh:` family (1)

| Script          | Command (truncated)                                                                     | Wired? |
| --------------- | --------------------------------------------------------------------------------------- | ------ |
| `refresh:cache` | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/cache-buster-check.js --fix` | manual |

## `report:` family (1)

| Script             | Command (truncated)                      | Wired? |
| ------------------ | ---------------------------------------- | ------ |
| `report:artifacts` | `node scripts/report-artifact-volume.js` | manual |

## `serve:` family (1)

| Script  | Command (truncated)                           | Wired? |
| ------- | --------------------------------------------- | ------ |
| `serve` | `python -m http.server 8795 --bind 127.0.0.1` | manual |

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
| `test:contract:full`    | `node tests/run-all-contracts.js --group=full`                                                         | manual |
| `test:contract:smoke`   | `node tests/run-all-contracts.js --group=smoke`                                                        | yes    |
| `test:e2e:click-flow`   | `npx playwright test tests/e2e-click-flow.spec.js --browser=chromium --headed`                         | manual |
| `test:fast`             | `npm run test:static`                                                                                  | manual |
| `test:help`             | `node scripts/test-help.mjs`                                                                           | manual |
| `test:live:e2e`         | `TEST_BASE_URL=http://127.0.0.1:8797 npx playwright test tests/e2e-click-flow.spec.js --browser=ch...` | manual |
| `test:smoke`            | `npm run test:contract:smoke`                                                                          | manual |
| `test:static`           | `npm run check:shell && npm run check:skills && npm run check:manifest && npm run check:cache && n...` | yes    |
| `test:stress`           | `playwright test tests/heavy-stress-leak.spec.js --browser=chromium`                                   | manual |
| `test:svelte-migration` | `node --loader ./tests/helpers/ts-resolve-loader.mjs tests/verify-svelte-migration.mjs`                | manual |
| `test:unit`             | `vitest run --config vitest.config.js`                                                                 | yes    |
| `test:unit:watch`       | `vitest --config vitest.config.js`                                                                     | manual |
| `test:visual`           | `npx tsx tests/visual-regression.test.ts`                                                              | manual |
| `test:visual:update`    | `UPDATE_SNAPSHOTS=true npx playwright test tests/integration/visual-state-snapshots.spec.js --brow...` | manual |

## `typecheck:` family (2)

| Script            | Command (truncated)                       | Wired? |
| ----------------- | ----------------------------------------- | ------ |
| `typecheck`       | `tsc --noEmit -p tsconfig.typecheck.json` | yes    |
| `typecheck:tests` | `tsc --noEmit -p tsconfig.tests.json`     | manual |

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

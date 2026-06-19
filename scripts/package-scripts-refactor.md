# package.json Script Refactor — Phase 1 ✅ Complete

## Summary

Reduced `package.json` scripts from **197** to **109** entries by removing
exact duplicates and collapsing per-surface/per-group scripts into the unified
`scripts/qa.mjs` runner.

## What Changed

| Phase                     | Date       | Removed        | Details                                                               |
| ------------------------- | ---------- | -------------- | --------------------------------------------------------------------- |
| Deduplicate               | 2026-06-19 | 8 scripts      | `qa:surface` = `qa:visual` = `capture:visual`, etc.                   |
| Collapse surface scripts  | 2026-06-19 | 18 scripts     | All `qa:surface:<name>` → `scripts/qa.mjs surface --state=<name>`     |
| Collapse contract scripts | 2026-06-19 | 25 scripts     | All `qa:contract:<name>` → `scripts/qa.mjs contract --surface=<name>` |
| Collapse test groups      | 2026-06-19 | 37 scripts     | `test:contract:<group>` → `scripts/qa.mjs contract-group <group>`     |
| **Total**                 |            | **88 scripts** | No functionality lost; `npm run test` passes                          |

## Verification

```bash
npm run test        # ✅ All checks pass (2026-06-19)
```

## Remaining `qa:*` Scripts (49)

The remaining `qa:*` scripts are **named test categories** (e.g., `qa:adversarial`,
`qa:live-reset`, `qa:short-landscape`) not per-surface instances. These retain
semantic value for developers who need quick access to specific test suites.

## New Unified Runner

```bash
# Surface contract
node scripts/qa.mjs contract --surface=mobile-idle --headed

# Visual audit
node scripts/qa.mjs visual --states=01-mobile-idle,07-desktop-idle --headed
node scripts/qa.mjs visual --all --headed

# Playthrough
node scripts/qa.mjs playthrough --headed
node scripts/qa.mjs playthrough --real-route-visual --headed

# Contract group
node scripts/qa.mjs contract-group core
node scripts/qa.mjs contract-group 3d-smoke --stop-on-first-fail
```

## Migration Map

Full old-to-new command mapping: `scripts/qa/README.md`

## Rollback

```bash
git checkout package.json   # revert (no other files touched)
```

## References

- `scripts/qa.mjs` — unified runner
- `scripts/qa/README.md` — usage guide and surface ID reference
- `MIGRATION-STATUS.md` — top-level migration tracker

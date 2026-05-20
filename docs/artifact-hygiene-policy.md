# Artifact Hygiene Policy

**Effective:** 2026-05-20
**Scope:** All artifact directories in this repository

---

## Definitions

| Directory | Purpose | Git-tracked? | Retention |
|-----------|---------|--------------|-----------|
| `dist/` | Built output (`bundle.js`) | Yes (built artifact) | Rebuilt from source; do not edit manually |
| `tmp/` | Runtime/QA artifacts (screenshots, JSON reports, audit docs) | No (gitignored) | Ephemeral — may be deleted at any time |
| `reports/` | Static analysis output | No (gitignored) | Ephemeral |
| `test-results/` | Contract runner output | No (gitignored) | Ephemeral |
| `playwright-report/` | Playwright HTML reports | No (gitignored) | Ephemeral |
| `og-preview.png` | Intentionally public share asset | Yes | Permanent — exception to `*.png` rule |

---

## Policy

### Build Artifacts (`dist/`)

- `dist/bundle.js` is a built artifact — **do not edit manually**
- Rebuild via `npm run build` before any deploy
- The `.map` file is gitignored (`dist/*.map`)
- `dist/` content is not automatically cleaned; it reflects the last successful build

### Screenshot Artifacts

- All screenshots (`*.png`, `*.jpg`, `*.webp`) go to `tmp/` or subdirectories
- Root-level screenshots without `.png` extension bypass the `*.png` gitignore glob and risk being committed — avoid placing them at the repo root
- `og-preview.png` is the only intentional exception (kept by `!og-preview.png`)
- Screenshots with names like `01-initial-state` (no extension) are valid PNGs but are missed by the `*.png` glob — always use `.png` suffix for new artifacts

### Ephemeral Directories

These are in `.gitignore` and may be deleted at any time without affecting the build:

- `tmp/` — runtime artifacts, audit reports, visual QA snapshots
- `reports/` — static analysis output
- `test-results/` — contract runner output
- `playwright-report/` — Playwright HTML reports
- `.playwright-mcp/` — Playwright MCP socket files
- `scratch/` — ad-hoc scratch space

### Retention

| Type | Max recommended age | Action if exceeded |
|------|---------------------|--------------------|
| QA screenshots in `tmp/` | 30 days | Review and prune |
| Audit JSON reports in `tmp/` | 90 days | Review and prune |
| Playwright screenshots | 7 days | Review and prune |
| `test-results/` output | 14 days | Review and prune |

**No automatic cleanup runs — this is a manual review policy, not an automated one.**

---

## Reporting

Run the artifact volume reporter:

```bash
node scripts/report-artifact-volume.js
```

This reports read-only size statistics for `tmp/`, `dist/`, `reports/`, `test-results/`, and `playwright-report/`.

Use the non-destructive size gate before broad QA/deploy waves:

```bash
node scripts/report-artifact-volume.js --size-gate
```

The size gate exits non-zero when any artifact directory exceeds 1 GB; it does not delete files.

Use prune dry-run mode to enumerate stale `tmp/` subdirectories without deleting anything:

```bash
node scripts/report-artifact-volume.js --prune-dry-run
node scripts/report-artifact-volume.js --prune-dry-run --dir semantic-ui-visual-audit --age 30 --size-min 10
```

`--dir` limits the scan to one `tmp/<dir>/` subtree, `--age` overrides the policy threshold in days, and `--size-min` hides candidates smaller than the given MB value. This mode is report-only; deletion is intentionally not implemented.

---

## Anti-patterns

- **Do not** commit screenshot files without `.png` extension — they bypass `*.png` gitignore glob
- **Do not** edit `dist/bundle.js` directly — always rebuild from source
- **Do not** add build artifacts (`.js` bundles) manually to git beyond the tracked `dist/bundle.js`

---

## Related Docs

- `docs/semantic-demo-worktree-review-bundles-2026-05-20.md` — worktree review from prior audit
- `tmp/artifact-hygiene-state-gaps-2026-05-20/report.md` — full hygiene audit
- `tmp/bd2e3d3-hygiene-audit-2026-05-20/report.md` — bd2e3d3 commit audit

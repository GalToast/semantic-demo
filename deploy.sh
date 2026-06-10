#!/bin/bash
# Deploy semantic-demo to mccullough.cloud
# Usage: ./deploy.sh           — hot run (deploys to live)
#        ./deploy.sh --dryrun  — prints what would be pushed, no changes
#
# All topology values can be overridden via environment variables.
# See .env.example for the full list.  Defaults preserve backward
# compatibility with the current mccullough-cloud / Hostinger deploy.
set -e

# ---------------------------------------------------------------------------
# Load .env if present (does not override existing env vars).
# ---------------------------------------------------------------------------
if [[ -f .env ]]; then
  while IFS= read -r line; do
    # Skip comments and empty lines.
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    # Export only KEY=VALUE (no multi-line, no shell expansion).
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      val="${BASH_REMATCH[2]}"
      # Only set if not already in the environment.
      if [[ -z "${!key}" ]]; then
        export "$key=$val"
      fi
    fi
  done < .env
fi

# ---------------------------------------------------------------------------
# Topology — env overrides with backward-compatible defaults.
# ---------------------------------------------------------------------------
SSH_TARGET="${DEPLOY_SSH_TARGET:-mccullough-cloud}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo}"
REMOTE_ROOT="${DEPLOY_REMOTE_ROOT:-/home/u741831384/domains/mccullough.cloud/public_html}"
PORT="${DEPLOY_PORT:-65002}"
DOMAIN_TARGET="${DEPLOY_DOMAIN_TARGET:-${SSH_TARGET}:${REMOTE_DIR}/}"
DRYRUN=false
if [[ "$1" == "--dryrun" ]]; then
  DRYRUN=true
fi
DEPLOY_STAMP="$(date +%Y%m%d-%H%M%S)"
# Backups go OUTSIDE public_html so they are not web-accessible.
# Default: /home/u741831384/backups/semantic-demo/deploy-<stamp>
# Override with DEPLOY_BACKUP_DIR to point at any private directory.
BACKUP_PARENT="${DEPLOY_BACKUP_DIR:-/home/u741831384/backups/semantic-demo}"
BACKUP_DIR="$BACKUP_PARENT/deploy-$DEPLOY_STAMP"

function run() {
  if $DRYRUN; then
    echo "[DRYRUN] $@"
  else
    echo "==> $@"
    eval "$@"
  fi
}

echo "==> Building dist/bundle.js..."
npm run build

echo "==> Refreshing cache busters..."
npm run refresh:cache

echo "==> Checking canonical shell contract..."
npm run check:shell

echo "==> Checking cache busters..."
npm run check:cache

echo "==> Creating remote rollback backup: $BACKUP_DIR"
# Back up scanner.js too if it exists on the remote — cloudscan keeps its own copy.
run "ssh -p $PORT $SSH_TARGET 'mkdir -p \"$BACKUP_DIR/dist\" \"$BACKUP_DIR/js/workers\" \"$BACKUP_DIR/css\" \"$BACKUP_DIR/scripts\" && cp -p \"$REMOTE_DIR/dist/bundle.js\" \"$BACKUP_DIR/dist/bundle.js\" && cp -p \"$REMOTE_DIR/semantic-demo.css\" \"$BACKUP_DIR/semantic-demo.css\" && cp -p \"$REMOTE_DIR/vector-explorer-pandora.css\" \"$BACKUP_DIR/vector-explorer-pandora.css\" && if [ -d \"$REMOTE_DIR/css\" ]; then cp -p \"$REMOTE_DIR/css/\"*.css \"$BACKUP_DIR/css/\" 2>/dev/null || true; fi && cp -p \"$REMOTE_DIR/vector-explorer-polished.html\" \"$BACKUP_DIR/vector-explorer-polished.html\" && cp -p \"$REMOTE_DIR/.htaccess\" \"$BACKUP_DIR/.htaccess\" && cp -p \"$REMOTE_DIR/js/workers/data-worker.js\" \"$BACKUP_DIR/js/workers/data-worker.js\" 2>/dev/null || true && cp -p \"$REMOTE_DIR/data.dat\" \"$BACKUP_DIR/data.dat\" 2>/dev/null || true && cp -p \"$REMOTE_DIR/data.dat.gz\" \"$BACKUP_DIR/data.dat.gz\" 2>/dev/null || true && cp -p \"$REMOTE_DIR/semantic_threads.dat\" \"$BACKUP_DIR/semantic_threads.dat\" 2>/dev/null || true && cp -p \"$REMOTE_DIR/semantic_threads_ui.dat\" \"$BACKUP_DIR/semantic_threads_ui.dat\" 2>/dev/null || true && cp -p \"$REMOTE_DIR/semantic_space_layout_manifest.json\" \"$BACKUP_DIR/semantic_space_layout_manifest.json\" 2>/dev/null || true && cp -p \"$REMOTE_DIR/scripts/leadEnrichment.public.json\" \"$BACKUP_DIR/scripts/leadEnrichment.public.json\" 2>/dev/null || true && cp -p \"$REMOTE_DIR/js/scanner.js\" \"$BACKUP_DIR/js/scanner.js\" 2>/dev/null || true && cp -p \"$REMOTE_ROOT/js/scanner.js\" \"$BACKUP_DIR/scanner-root.js\" 2>/dev/null || true; true'"

# Keep the deploy payload explicit. Do not widen this to dist/*:
# dist/bundle.js.map is a local debugging artifact and should not be public.
run "scp -P $PORT dist/bundle.js '${DOMAIN_TARGET}dist/bundle.js'"
run "scp -P $PORT semantic-demo.css '$DOMAIN_TARGET'"
run "scp -P $PORT vector-explorer-pandora.css '$DOMAIN_TARGET'"
if [[ -d css ]]; then
  run "scp -P $PORT -r css '$DOMAIN_TARGET'"
fi
run "scp -P $PORT vector-explorer-polished.html '$DOMAIN_TARGET'"
run "scp -P $PORT .htaccess '$DOMAIN_TARGET'"

# data.dat — large dataset shipped to the live server. Added to the deploy
# payload on 2026-06-04 during Bug Sweep 32 so NAICS-augmented records can
# reach the live worker.
run "scp -P $PORT data.dat '$DOMAIN_TARGET'"

# Compressed variant and thread/semantic-space artifacts. Mirror the
# $SemanticArtifacts array in deploy.ps1 so both scripts deploy the same
# set of runtime assets to the live server.
if [[ -f data.dat.gz ]]; then
  run "scp -P $PORT data.dat.gz '$DOMAIN_TARGET'"
fi
if [[ -f semantic_threads.dat ]]; then
  run "scp -P $PORT semantic_threads.dat '$DOMAIN_TARGET'"
fi
if [[ -f semantic_threads_ui.dat ]]; then
  run "scp -P $PORT semantic_threads_ui.dat '$DOMAIN_TARGET'"
fi
if [[ -f semantic_space_layout_manifest.json ]]; then
  run "scp -P $PORT semantic_space_layout_manifest.json '$DOMAIN_TARGET'"
fi

# js/workers/data-worker.js — Web Worker loaded by data-loader.js at
# app init to parse large datasets without blocking the main thread.
# Must be deployed so the worker URL (js/workers/data-worker.js) resolves.
if [[ -d js/workers ]]; then
  run "ssh -p $PORT $SSH_TARGET 'mkdir -p ${REMOTE_DIR}/js/workers'"
  run "scp -P $PORT -r js/workers '${DOMAIN_TARGET}js/'"
fi

# Public enrichment — 13MB JSON keyed by lead_id, generated by
# scripts/extract-lead-enrichment.mjs. Read by data-loader.js at app init.
# The internal enrichment (leadEnrichment.internal.json) stays in the repo
# and is never deployed — it carries pipeline state that must not reach
# the public demo.
run "scp -P $PORT scripts/leadEnrichment.public.json ${DOMAIN_TARGET}scripts/leadEnrichment.public.json"

# Set file permissions on deployed assets. Mirror deploy.ps1's chmod step
# so files are readable (644) and directories traversable (755).
run "ssh -p $PORT $SSH_TARGET 'find \"$REMOTE_DIR\" -maxdepth 1 -type d -exec chmod 755 {} \; && find \"$REMOTE_DIR/css\" \"$REMOTE_DIR/js\" \"$REMOTE_DIR/dist\" -type d -exec chmod 755 {} \; 2>/dev/null || true && find \"$REMOTE_DIR/css\" \"$REMOTE_DIR/js\" \"$REMOTE_DIR/dist\" -type f -exec chmod 644 {} \; 2>/dev/null || true && chmod 644 \"$REMOTE_DIR/data.dat\" \"$REMOTE_DIR/data.dat.gz\" \"$REMOTE_DIR/semantic_threads.dat\" \"$REMOTE_DIR/semantic_threads_ui.dat\" \"$REMOTE_DIR/semantic_space_layout_manifest.json\" \"$REMOTE_DIR/semantic-demo.css\" \"$REMOTE_DIR/vector-explorer-polished.html\" \"$REMOTE_DIR/vector-explorer-pandora.css\" \"$REMOTE_DIR/.htaccess\" 2>/dev/null || true'"

echo "==> Syncing scanner.js to cloudscan/..."
# scanner.js is the canonical source for /js/scanner.js (cloudscan page)
# and /semantic-demo/js/scanner.js (semantic demo) — keep in sync.
# The cloudscan page is a sibling project, so the file lives at ../js/scanner.js.
# If it isn't present (e.g., running this script in isolation or in a CI
# environment without the sibling checkout), skip the sync rather than
# failing the semantic-demo deploy.
SCANNER_SRC="${DEPLOY_SCANNER_SOURCE:-../js/scanner.js}"
if [[ -f "$SCANNER_SRC" ]]; then
  run "scp -P $PORT $SCANNER_SRC '${SSH_TARGET}:${REMOTE_ROOT}/js/scanner.js'"
  run "scp -P $PORT $SCANNER_SRC '${DOMAIN_TARGET}js/scanner.js'"
else
  echo "==> scanner.js not found at $SCANNER_SRC; skipping cloudscan sync (sibling project not present)."
fi

$DRYRUN && echo "==> Dry run complete — no files modified."
$DRYRUN || echo "==> Deploy complete. Rollback backup: $BACKUP_DIR"
$DRYRUN || echo "==> Rollback command: ssh -p $PORT $SSH_TARGET 'cp -p \"$BACKUP_DIR/dist/bundle.js\" \"$REMOTE_DIR/dist/bundle.js\" && cp -p \"$BACKUP_DIR/semantic-demo.css\" \"$REMOTE_DIR/semantic-demo.css\" && cp -p \"$BACKUP_DIR/vector-explorer-pandora.css\" \"$REMOTE_DIR/vector-explorer-pandora.css\" && if [ -d \"$BACKUP_DIR/css\" ]; then mkdir -p \"$REMOTE_DIR/css\" && cp -p \"$BACKUP_DIR/css/\"*.css \"$REMOTE_DIR/css/\" 2>/dev/null || true; fi && mkdir -p \"$REMOTE_DIR/js/workers\" && cp -p \"$BACKUP_DIR/js/workers/data-worker.js\" \"$REMOTE_DIR/js/workers/data-worker.js\" 2>/dev/null || true && cp -p \"$BACKUP_DIR/vector-explorer-polished.html\" \"$REMOTE_DIR/vector-explorer-polished.html\" && cp -p \"$BACKUP_DIR/.htaccess\" \"$REMOTE_DIR/.htaccess\" && cp -p \"$BACKUP_DIR/data.dat\" \"$REMOTE_DIR/data.dat\" 2>/dev/null || true && cp -p \"$BACKUP_DIR/data.dat.gz\" \"$REMOTE_DIR/data.dat.gz\" 2>/dev/null || true && cp -p \"$BACKUP_DIR/semantic_threads.dat\" \"$REMOTE_DIR/semantic_threads.dat\" 2>/dev/null || true && cp -p \"$BACKUP_DIR/semantic_threads_ui.dat\" \"$REMOTE_DIR/semantic_threads_ui.dat\" 2>/dev/null || true && cp -p \"$BACKUP_DIR/semantic_space_layout_manifest.json\" \"$REMOTE_DIR/semantic_space_layout_manifest.json\" 2>/dev/null || true && mkdir -p \"$REMOTE_DIR/scripts\" && cp -p \"$BACKUP_DIR/scripts/leadEnrichment.public.json\" \"$REMOTE_DIR/scripts/leadEnrichment.public.json\" 2>/dev/null || true && cp -p \"$BACKUP_DIR/js/scanner.js\" \"$REMOTE_DIR/js/scanner.js\" 2>/dev/null || true && cp -p \"$BACKUP_DIR/scanner-root.js\" \"$REMOTE_ROOT/js/scanner.js\" 2>/dev/null || true; true'"

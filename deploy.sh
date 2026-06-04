#!/bin/bash
# Deploy semantic-demo to mccullough.cloud
# Usage: ./deploy.sh           — hot run (deploys to live)
#        ./deploy.sh --dryrun  — prints what would be pushed, no changes
set -e

DOMAIN_TARGET="mccullough-cloud:/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/"
SSH_TARGET="mccullough-cloud"
REMOTE_DIR="/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo"
REMOTE_ROOT="/home/u741831384/domains/mccullough.cloud/public_html"
PORT="65002"
DRYRUN=false
if [[ "$1" == "--dryrun" ]]; then
  DRYRUN=true
fi
DEPLOY_STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$REMOTE_DIR/backups/deploy-$DEPLOY_STAMP"

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
run "ssh -p $PORT $SSH_TARGET 'mkdir -p \"$BACKUP_DIR/dist\" \"$BACKUP_DIR/js\" \"$BACKUP_DIR/css\" && cp -p \"$REMOTE_DIR/dist/bundle.js\" \"$BACKUP_DIR/dist/bundle.js\" && cp -p \"$REMOTE_DIR/semantic-demo.css\" \"$BACKUP_DIR/semantic-demo.css\" && cp -p \"$REMOTE_DIR/vector-explorer-pandora.css\" \"$BACKUP_DIR/vector-explorer-pandora.css\" && if [ -d \"$REMOTE_DIR/css\" ]; then cp -p \"$REMOTE_DIR/css/\"*.css \"$BACKUP_DIR/css/\" 2>/dev/null || true; fi && cp -p \"$REMOTE_DIR/vector-explorer-polished.html\" \"$BACKUP_DIR/vector-explorer-polished.html\" && cp -p \"$REMOTE_DIR/.htaccess\" \"$BACKUP_DIR/.htaccess\" && cp -p \"$REMOTE_DIR/data.dat\" \"$BACKUP_DIR/data.dat\" 2>/dev/null; cp -p \"$REMOTE_DIR/js/scanner.js\" \"$BACKUP_DIR/js/scanner.js\" 2>/dev/null; cp -p \"$REMOTE_ROOT/js/scanner.js\" \"$BACKUP_DIR/scanner-root.js\" 2>/dev/null; true'"

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
# reach the live worker. Not widening the glob to data.* intentionally: this
# is the only dataset file the demo reads.
run "scp -P $PORT data.dat '$DOMAIN_TARGET'"

echo "==> Syncing scanner.js to cloudscan/..."
# scanner.js is the canonical source for /js/scanner.js (cloudscan page)
# and /semantic-demo/js/scanner.js (semantic demo) — keep in sync.
# The cloudscan page is a sibling project, so the file lives at ../js/scanner.js.
# If it isn't present (e.g., running this script in isolation), skip the sync
# rather than failing the semantic-demo deploy.
SCANNER_SRC="../js/scanner.js"
if [[ -f "$SCANNER_SRC" ]]; then
  run "scp -P $PORT $SCANNER_SRC 'mccullough-cloud:/home/u741831384/domains/mccullough.cloud/public_html/js/scanner.js'"
  run "scp -P $PORT $SCANNER_SRC '${DOMAIN_TARGET}js/scanner.js'"
else
  echo "==> scanner.js not found at $SCANNER_SRC; skipping cloudscan sync (sibling project not present)."
fi

$DRYRUN && echo "==> Dry run complete — no files modified."
$DRYRUN || echo "==> Deploy complete. Rollback backup: $BACKUP_DIR"
$DRYRUN || echo "==> Rollback command: ssh -p $PORT $SSH_TARGET 'cp -p \"$BACKUP_DIR/dist/bundle.js\" \"$REMOTE_DIR/dist/bundle.js\" && cp -p \"$BACKUP_DIR/semantic-demo.css\" \"$REMOTE_DIR/semantic-demo.css\" && cp -p \"$BACKUP_DIR/vector-explorer-pandora.css\" \"$REMOTE_DIR/vector-explorer-pandora.css\" && if [ -d \"$BACKUP_DIR/css\" ]; then mkdir -p \"$REMOTE_DIR/css\" && cp -p \"$BACKUP_DIR/css/\"*.css \"$REMOTE_DIR/css/\" 2>/dev/null || true; fi && cp -p \"$BACKUP_DIR/vector-explorer-polished.html\" \"$REMOTE_DIR/vector-explorer-polished.html\" && cp -p \"$BACKUP_DIR/.htaccess\" \"$REMOTE_DIR/.htaccess\" && cp -p \"$BACKUP_DIR/data.dat\" \"$REMOTE_DIR/data.dat\" 2>/dev/null; cp -p \"$BACKUP_DIR/js/scanner.js\" \"$REMOTE_DIR/js/scanner.js\" 2>/dev/null; cp -p \"$BACKUP_DIR/scanner-root.js\" \"$REMOTE_ROOT/js/scanner.js\" 2>/dev/null; true'"

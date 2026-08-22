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
	done <.env
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

echo "==> Building dist/svelte..."
npm run build

echo "==> Refreshing cache busters..."
npm run refresh:cache

echo "==> Checking canonical shell contract..."
npm run check:shell

echo "==> Checking cache busters..."
npm run check:cache

echo "==> Creating remote rollback backup: $BACKUP_DIR"
run "ssh -p $PORT $SSH_TARGET 'mkdir -p \"$BACKUP_DIR/assets\" \"$BACKUP_DIR/css\" \"$BACKUP_DIR/data\" \"$BACKUP_DIR/js\" \"$BACKUP_DIR/scripts\" && cp -p \"$REMOTE_DIR/index.html\" \"$BACKUP_DIR/index.html\" 2>/dev/null || true && cp -p \"$REMOTE_DIR/semantic-demo.css\" \"$BACKUP_DIR/semantic-demo.css\" 2>/dev/null || true && cp -p \"$REMOTE_DIR/vector-explorer-pandora.css\" \"$BACKUP_DIR/vector-explorer-pandora.css\" 2>/dev/null || true && if [ -d \"$REMOTE_DIR/assets\" ]; then cp -p \"$REMOTE_DIR/assets/\"* \"$BACKUP_DIR/assets/\" 2>/dev/null || true; fi && if [ -d \"$REMOTE_DIR/css\" ]; then cp -p \"$REMOTE_DIR/css/\"*.css \"$BACKUP_DIR/css/\" 2>/dev/null || true; fi && cp -p \"$REMOTE_DIR/.htaccess\" \"$BACKUP_DIR/.htaccess\" 2>/dev/null || true && cp -p \"$REMOTE_DIR/data.dat\" \"$BACKUP_DIR/data.dat\" 2>/dev/null || true && cp -p \"$REMOTE_DIR/data.dat.gz\" \"$BACKUP_DIR/data.dat.gz\" 2>/dev/null || true && cp -p \"$REMOTE_DIR/semantic_threads.dat\" \"$BACKUP_DIR/semantic_threads.dat\" 2>/dev/null || true && cp -p \"$REMOTE_DIR/semantic_threads_ui.dat\" \"$BACKUP_DIR/semantic_threads_ui.dat\" 2>/dev/null || true && cp -p \"$REMOTE_DIR/semantic_space_layout_manifest.json\" \"$BACKUP_DIR/semantic_space_layout_manifest.json\" 2>/dev/null || true && cp -p \"$REMOTE_DIR/data/leadEnrichment.public.json\" \"$BACKUP_DIR/data/leadEnrichment.public.json\" 2>/dev/null || true; true'"

# Keep the deploy payload explicit. Do not widen this to dist/svelte/*:
# stale files such as local metadata must never be published.
run "ssh -p $PORT $SSH_TARGET 'mkdir -p ${REMOTE_DIR}/assets ${REMOTE_DIR}/css ${REMOTE_DIR}/scripts ${REMOTE_DIR}/js ${REMOTE_DIR}/fonts'"
run "scp -P $PORT dist/svelte/index.html '${DOMAIN_TARGET}index.html'"
run "scp -P $PORT -r dist/svelte/assets '$DOMAIN_TARGET'"
run "scp -P $PORT -r dist/svelte/css '$DOMAIN_TARGET'"
run "scp -P $PORT -r dist/svelte/fonts '$DOMAIN_TARGET'"
run "scp -P $PORT dist/svelte/semantic-demo.css '$DOMAIN_TARGET'"
run "scp -P $PORT dist/svelte/vector-explorer-pandora.css '$DOMAIN_TARGET'"
run "scp -P $PORT .htaccess '$DOMAIN_TARGET'"

# data.dat — large dataset shipped to the live server. Added to the deploy
# payload on 2026-06-04 during Bug Sweep 32 so NAICS-augmented records can
# reach the live worker.
run "scp -P $PORT dist/svelte/data.dat '$DOMAIN_TARGET'"

# Compressed variant and thread/semantic-space artifacts. Mirror the
# $SemanticArtifacts array in deploy.ps1 so both scripts deploy the same
# set of runtime assets to the live server.
if [[ -f dist/svelte/data.dat.gz ]]; then
	run "scp -P $PORT dist/svelte/data.dat.gz '$DOMAIN_TARGET'"
fi
if [[ -f dist/svelte/semantic_threads.dat ]]; then
	run "scp -P $PORT dist/svelte/semantic_threads.dat '${DOMAIN_TARGET}data/semantic_threads.dat'"
fi
if [[ -f dist/svelte/semantic_threads_ui.dat ]]; then
	run "scp -P $PORT dist/svelte/semantic_threads_ui.dat '${DOMAIN_TARGET}data/semantic_threads_ui.dat'"
fi

# Precompressed twins for the big data artifacts (P4, 2026-08-22): without
# these the .htaccess rewrite has no twin to serve and prod ships 82.5MB of
# semantic_threads.dat PLAIN over throttled mobile radios. br twins compress
# it to 2.6MB (30x). Mirror names at REMOTE_DIR root exactly as built.
for twin in semantic_threads.dat.br semantic_threads.dat.gz semantic_threads_ui.dat.br semantic_threads_ui.dat.gz; do
	if [[ -f "dist/svelte/data/$twin" ]]; then
		run "scp -P $PORT dist/svelte/data/$twin '${DOMAIN_TARGET}data/$twin'"
	fi
done
# leadEnrichment twins live beside the json in dist/svelte/data/
for twin in leadEnrichment.public.json.br leadEnrichment.public.json.gz; do
	if [[ -f "dist/svelte/data/$twin" ]]; then
		run "scp -P $PORT dist/svelte/data/$twin '${DOMAIN_TARGET}data/$twin'"
	fi
done
if [[ -f dist/svelte/semantic_space_layout_manifest.json ]]; then
	run "scp -P $PORT dist/svelte/semantic_space_layout_manifest.json '${DOMAIN_TARGET}data/semantic_space_layout_manifest.json'"
fi
# Manifest twins live in dist/svelte/data/ (app fetches the data/-prefixed path)
for twin in semantic_space_layout_manifest.json.br semantic_space_layout_manifest.json.gz; do
	if [[ -f "dist/svelte/data/$twin" ]]; then
		run "scp -P $PORT dist/svelte/data/$twin '${DOMAIN_TARGET}data/$twin'"
	fi
done

# Public enrichment — 13MB JSON keyed by lead_id, generated by
# scripts/extract-lead-enrichment.mjs. Read by data-loader.js at app init.
# The internal enrichment (leadEnrichment.internal.json) stays in the repo
# and is never deployed — it carries pipeline state that must not reach
# the public demo.
# GUARD: the build's compression gate may replace/remove the plain file;
# twins are shipped separately above. Never let this kill the deploy tail.
if [[ -f dist/svelte/data/leadEnrichment.public.json ]]; then
	run "scp -P $PORT dist/svelte/data/leadEnrichment.public.json ${DOMAIN_TARGET}data/leadEnrichment.public.json"
fi

# Set file permissions on deployed assets. Mirror deploy.ps1's chmod step
# so files are readable (644) and directories traversable (755).
run "ssh -p $PORT $SSH_TARGET 'find \"$REMOTE_DIR\" -maxdepth 1 -type d -exec chmod 755 {} \; && find \"$REMOTE_DIR/assets\" \"$REMOTE_DIR/css\" \"$REMOTE_DIR/js\" \"$REMOTE_DIR/data\" \"$REMOTE_DIR/fonts\" -type d -exec chmod 755 {} \; 2>/dev/null || true && find \"$REMOTE_DIR/assets\" \"$REMOTE_DIR/css\" \"$REMOTE_DIR/js\" \"$REMOTE_DIR/data\" \"$REMOTE_DIR/fonts\" -type f -exec chmod 644 {} \; 2>/dev/null || true && chmod 644 \"$REMOTE_DIR/index.html\" \"$REMOTE_DIR/data.dat\" \"$REMOTE_DIR/data.dat.gz\" \"$REMOTE_DIR/semantic_threads.dat\" \"$REMOTE_DIR/semantic_threads_ui.dat\" \"$REMOTE_DIR/semantic_space_layout_manifest.json\" \"$REMOTE_DIR/semantic-demo.css\" \"$REMOTE_DIR/vector-explorer-pandora.css\" \"$REMOTE_DIR/.htaccess\" 2>/dev/null || true'"

$DRYRUN && echo "==> Dry run complete — no files modified."
$DRYRUN || echo "==> Deploy complete. Rollback backup: $BACKUP_DIR"
$DRYRUN || echo "==> Rollback command: ssh -p $PORT $SSH_TARGET 'cp -p \"$BACKUP_DIR/index.html\" \"$REMOTE_DIR/index.html\" 2>/dev/null || true && cp -p \"$BACKUP_DIR/semantic-demo.css\" \"$REMOTE_DIR/semantic-demo.css\" 2>/dev/null || true && cp -p \"$BACKUP_DIR/vector-explorer-pandora.css\" \"$REMOTE_DIR/vector-explorer-pandora.css\" 2>/dev/null || true && if [ -d \"$BACKUP_DIR/assets\" ]; then mkdir -p \"$REMOTE_DIR/assets\" && cp -p \"$BACKUP_DIR/assets/\"* \"$REMOTE_DIR/assets/\" 2>/dev/null || true; fi && if [ -d \"$BACKUP_DIR/css\" ]; then mkdir -p \"$REMOTE_DIR/css\" && cp -p \"$BACKUP_DIR/css/\"*.css \"$REMOTE_DIR/css/\" 2>/dev/null || true; fi && cp -p \"$BACKUP_DIR/.htaccess\" \"$REMOTE_DIR/.htaccess\" 2>/dev/null || true && cp -p \"$BACKUP_DIR/data.dat\" \"$REMOTE_DIR/data.dat\" 2>/dev/null || true && cp -p \"$BACKUP_DIR/data.dat.gz\" \"$REMOTE_DIR/data.dat.gz\" 2>/dev/null || true && cp -p \"$BACKUP_DIR/semantic_threads.dat\" \"$REMOTE_DIR/semantic_threads.dat\" 2>/dev/null || true && cp -p \"$BACKUP_DIR/semantic_threads_ui.dat\" \"$REMOTE_DIR/semantic_threads_ui.dat\" 2>/dev/null || true && cp -p \"$BACKUP_DIR/semantic_space_layout_manifest.json\" \"$REMOTE_DIR/semantic_space_layout_manifest.json\" 2>/dev/null || true && mkdir -p \"$REMOTE_DIR/data\" && cp -p \"$BACKUP_DIR/data/leadEnrichment.public.json\" \"$REMOTE_DIR/data/leadEnrichment.public.json\" 2>/dev/null || true; true'"

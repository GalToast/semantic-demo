#!/usr/bin/env bash
# farm-sync.sh — one-command farm update: registry parity + code to phone.
# 1. Remap laptop model-providers.json 8788->8789 + push into phone chroot
# 2. git push master to the phone mirror (so the next swarm clones fresh)
# Usage: bash scripts/farm-sync.sh   (run from repo root; adb + ssh remote 'phone')
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROOT=/data/data/com.termux/files/usr/var/lib/proot-distro/containers/ubuntu/rootfs
SRC="$HOME/.pi/agent/model-providers.json"
REMOTE="$CHROOT/root/.pi/agent/model-providers.json"
ADB="${ADB_WIN:-/c/Users/HP/AppData/Local/Microsoft/WinGet/Packages/Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe/platform-tools/adb.exe}"
SERIAL="${SERIAL:-77aeb8a8}"
REMAP="$ROOT/scripts/parity-remap-local.py"

echo "== [1/2] model registry parity =="
[ -f "$SRC" ] || { echo "missing $SRC"; exit 1; }
REMAPPED="$(mktemp --suffix=.json)"
python3 "$REMAP" "$SRC" "$REMAPPED"
"$ADB" -s "$SERIAL" shell "su -c 'cp $REMOTE ${REMOTE}.bak-$(date +%Y%m%d-%H%M%S) 2>/dev/null || true'"
"$ADB" -s "$SERIAL" push "$REMAPPED" /data/local/tmp/registry-8789.json >/dev/null
"$ADB" -s "$SERIAL" shell "su -c 'cp /data/local/tmp/registry-8789.json $REMOTE && chmod 644 $REMOTE && echo INSTALLED'"
rm -f "$REMAPPED"

echo "== [2/2] git push to phone mirror =="
git -C "$ROOT" push phone master:master

echo "farm sync complete"
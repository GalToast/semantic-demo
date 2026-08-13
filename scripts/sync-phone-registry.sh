#!/usr/bin/env bash
# sync-phone-registry.sh — laptop ⇄ phone model-registry parity sync.
# 1. Runs parity-remap.py (8788 -> 8789 on baseUrl fields) on the laptop copy
# 2. Pushes the remapped model-providers.json into the phone chroot (backup first)
# Requires: repo root CWD, adb on PATH (or ADB env), rooted phone attached.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROOT=/data/data/com.termux/files/usr/var/lib/proot-distro/containers/ubuntu/rootfs
SRC="$HOME/.pi/agent/model-providers.json"
REMOTE="$CHROOT/root/.pi/agent/model-providers.json"
ADB="${ADB_WIN:-/c/Users/HP/AppData/Local/Microsoft/WinGet/Packages/Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe/platform-tools/adb.exe}"
SERIAL="${SERIAL:-77aeb8a8}"
REMAP="$ROOT/scripts/parity-remap-local.py"

# 1) build the rewritten copy (local python, no phone round-trip)
[ -f "$SRC" ] || {
	echo "missing $SRC"
	exit 1
}
[ -f "$REMAP" ] || {
	echo "missing remapper $REMAP"
	exit 1
}
echo "SRC=$SRC REMAP=$REMAP"
set +e
REMAPPED="$(mktemp --suffix=.json)"
python3 "$REMAP" "$SRC" "$REMAPPED" 2>err.txt
RC=$?
set -e
cat err.txt
rm -f err.txt
[ $RC -eq 0 ] || {
	echo "remap failed"
	rm -f "$REMAPPED"
	exit 1
}
echo "remapped file ready: $REMAPPED"

# 2) push to phone chroot
"$ADB" -s "$SERIAL" shell "su -c 'cp $REMOTE ${REMOTE}.bak-$(date +%Y%m%d-%H%M%S) 2>/dev/null || true'"
"$ADB" -s "$SERIAL" push "$REMAPPED" /data/local/tmp/registry-8789.json >/dev/null
"$ADB" -s "$SERIAL" shell "su -c 'cp /data/local/tmp/registry-8789.json $REMOTE && chmod 644 $REMOTE && echo INSTALLED'"
rm -f "$REMAPPED"
echo "sync done: parity restored"

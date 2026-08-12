#!/usr/bin/env bash
# fold-watch.sh — wait for the lane's map-state split to land, then fire the
# post-fold verification gate. Logs everything; exits non-zero only if the
# gate itself finds test failures.
set -u

LOG=/c/Users/HP/repos/semantic-explorer/tmp/fold-watch.log
REPO=/c/Users/HP/repos/semantic-explorer
MAX_TRIES=180 # 180 x 20s = 60 min budget

echo "[$(date +%H:%M:%S)] fold-watch start" >>"$LOG"
cd "$REPO"

tries=0
while [ "$tries" -lt "$MAX_TRIES" ]; do
	tries=$((tries + 1))
	# Landed = all three map-* siblings exist on disk AND map-state.ts no longer
	# imports missing modules (grep the import lines resolve).
	if [ -f src/lib/engine/map-markers.ts ] &&
		[ -f src/lib/engine/map-leaflet-runtime.ts ] &&
		[ -f src/lib/engine/map-route-embodiment.ts ]; then
		echo "[$(date +%H:%M:%S)] SPLIT-LANDED after ${tries} tries — firing gate" >>"$LOG"
		bash scripts/post-fold-verify.sh >>"$LOG" 2>&1
		echo "[$(date +%H:%M:%S)] gate exit=$?" >>"$LOG"
		exit 0
	fi
	[ $((tries % 3)) -eq 0 ] && echo "[$(date +%H:%M:%S)] try $tries — still applying ($(git status --short src/lib/engine/ 2>/dev/null | wc -l) dirty)" >>"$LOG"
	sleep 20
done

echo "[$(date +%H:%M:%S)] TIMEOUT after $MAX_TRIES tries — split never landed" >>"$LOG"
exit 5

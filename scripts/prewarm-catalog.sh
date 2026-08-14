#!/usr/bin/env bash
# Pre-warm the Pi model catalog before dispatching subagent workers.
#
# Why: each external-subagent worker spawns a fresh Pi CLI that resolves
# --model against the pi-model-providers extension's catalog, which registers
# ASYNCHRONOUSLY at boot. A worker can resolve --model before registration
# completes and die instantly with `Error: Model "router-.../..." not found`
# even though `pi --list-models` shows the model healthy (measured 2026-08-13,
# wiped multiple swarm rounds across ALL routes: kilo, zydit, opencode-zen).
#
# Running this immediately before a dispatch round forces extension
# registration to finish in a fresh process first; worker spawns then resolve
# the model and boot normally (verified 2026-08-14: probe worker booted + tooled
# after pre-warm; identical spawn without pre-warm failed at boot in ~11s).
#
# Usage: scripts/prewarm-catalog.sh   (exit 0 = warm, 1 = pi unavailable)
set -euo pipefail

if ! timeout 90 pi --list-models >/dev/null 2>&1; then
  echo "PREWARM-FAIL: \`pi --list-models\` failed — is the router up? Do not dispatch yet." >&2
  exit 1
fi

echo "catalog pre-warmed ✓ (subagent spawns should now resolve router model refs)"
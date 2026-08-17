#!/usr/bin/env bash
# pre-swarm-stage.sh — auto-stage untracked files BEFORE dispatching a swarm.
#
# WHY: git-ignore-aware tools (grep, find, playwright picks, git-diff-based
# runners) skip untracked files. A worker asked to read/edit an untracked
# module gets "phantom-missing-module" — the file EXISTS on disk but no
# tool sees it in the repo view. Intent-to-add (git add -N) marks the path in
# the index so every git-aware tool sees it, WITHOUT creating a staged diff.
#
# Usage:
#   scripts/pre-swarm-stage.sh                  # stage untracked in cwd repo
#   scripts/pre-swarm-stage.sh --repo <DIR>     # stage untracked in DIR (phone repo/copy)
#   scripts/pre-swarm-stage.sh --dry-run        # list only, no change
#   scripts/pre-swarm-stage.sh --reset          # clear intent-to-add (reversible undo)
#
# Exit: 0 always (or 2 if not a git repo). Prints count + status legend.
set -uo pipefail

REPO=""
MODE="stage"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    --dry-run) MODE="dry" ;;
    --reset) MODE="reset" ;;
    *) REPO="$1" ;;
  esac
done

if ! git -C "${REPO:-.}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ERROR: not a git work tree (${REPO:-cwd})" >&2
  exit 2
fi

UNTRACKED=$(git -C "${REPO:-.}" ls-files --others --exclude-standard 2>/dev/null)
COUNT=$(printf '%s\n' "$UNTRACKED" | grep -cE '.+' || true)

if [[ "$MODE" == "dry" ]]; then
  echo "[pre-swarm-stage] DRY-RUN: $COUNT untracked (git-visible to workers)"
  printf '%s\n' "$UNTRACKED" | sed 's/^/  /' | head -40
  exit 0
fi

if [[ "$MODE" == "reset" ]]; then
  # Undo: `git reset` drops intent-to-add; files return to untracked.
  # FAIL LOUDLY — a silent failure leaves intent entries in the index (a
  # hazard for the next lane commit), measured 08-17 under concurrent lanes.
  if ! git -C "${REPO:-.}" reset -q; then
    echo "ERROR: git reset failed (index lock contention?) — retry shortly" >&2
    exit 3
  fi
  echo "[pre-swarm-stage] RESET: intent-to-add cleared; verify with git status"
  exit 0
fi

if [[ -z "$UNTRACKED" ]]; then
  echo "[pre-swarm-stage] nothing untracked — workers see the whole tree"
  exit 0
fi

echo "[pre-swarm-stage] intent-to-add $COUNT untracked file(s) so swarm tooling can see them:"
printf '%s\n' "$UNTRACKED" | sed 's/^/  /' | head -40
# -N = intent-to-add: path enters the index WITHOUT a content diff (reversible).
echo "$UNTRACKED" | xargs -d '\n' git -C "${REPO:-.}" add -N -- 2>/dev/null || git -C "${REPO:-.}" add -N -- $UNTRACKED
echo
echo "[pre-swarm-stage] status now shows intent-to-add as ' A' — run --reset to undo"
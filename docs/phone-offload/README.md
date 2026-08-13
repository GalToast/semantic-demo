# Phone Offload Farm (semantic-explorer)

## What this is

The OnePlus 7T Pro (HD1907, root, Termux + proot Ubuntu) runs Pi worker sessions in a chroot
(`/data/data/com.termux/files/usr/var/lib/proot-distro/containers/ubuntu/rootfs`). Workers
clone THIS repo from the phone's own git mirror, run pi CLI against a cloned OpenRouter key
router, write reports to /swarm/, and the laptop pulls + main-lane-verifies.

## Wiring that took the morning to get right (all verified 2026-08-13)

1. **Git remote on the phone** (make phone a mirror host):
    - termux: `git init --bare ~/repos/semantic-explorer.git`
    - sshd on :8022 with `PermitUserEnvironment yes` + `~/.ssh/environment`
      containing `PATH=/data/data/com.termux/files/usr/bin:/...` (git-receive-pack /
      git-upload-pack are NOT on Android's default PATH — the #1 push failure).
    - laptop remote: `ssh://[phone-lan-redacted]/~/repos/semantic-explorer.git`
      (key-auth with id_ed25519, already authorized).
    - `git push phone master` and `git clone` both verified (1762 files).
2. **Mirror bind-mount into chroot** (so chroot workers clone locally, no network):
    - `mount --bind /data/data/com.termux/files/home/repos $ROOTFS/mnt/phonerepos`
    - broker: `git config --global --add safe.directory /mnt/phonerepos/semantic-explorer.git`
      then `git clone /mnt/phonerepos/semantic-explorer.git /swarm/repo`
      (repeat run: `git -C /swarm/repo fetch origin master && git reset --hard origin/master`).
3. **Broker pattern**: broker3.sh (see tmp/phone_team/swarm) = clone → prompt heredoc →
   launch `pi --provider phone-router-openrouter --model <free> --print --no-session "@prompt"`
   with `setsid nohup` so it survives chroot-exit. Read report, verify on laptop.

## Rules

- Workers are READ-ONLY unless a prompt explicitly allows a patch (w5 did; it produced a
  real `as const` change that was human-verified + `tsc --noEmit` clean before commit).
- Always verify the phone's claims against the real tree before acting (w6 "355 dead
  exports" shrank to 21 real ones after exact-symbol + import sweeps).
- Model pick for offloads: nvidia/nemotron-3-ultra-550b-a55b:free via the phone router.
- Laptop remote `phone` persists; git daemon :9418 optional (unauthed), sshd is the
  production path.

## Model selection for workers (2026-08-13 investigation — user hypothesis CONFIRMED)
NOT all router routes are equally agent-capable. Verified live over the phone router:
- phone-mistral  -> 422 (upstream contract break; zero tokens). Unusable.
- phone-gemini   -> silently routes to Qwen3-235B-Thinking-INITIAL; its thinking
  tool-calls lack Gemini thought_signature -> pi tool loop stalls (339-byte log).
  Never use for agents that need tool calls.
- phone-router-openrouter -> 429 when the key pool is quota-tapped (like zen
  free tier). Quota-dependent.
Agent-worker gold standard: a **non-thinking model with tool-call + generous
free quota** (e.g., laptop-side openrouter nemotron when fresh). Charge the
phone route from the WORKER prompt (pi --provider) pick a route whose
responseModel is the expected model, not a thinking proxy: verify via the
session JSON "responseModel" field after the first launch.
Symptom to watch: worker log stuck at ~339 bytes with only a Gemini
"thought_signature" warning line = thinking-model tool-loop stall.

# Phone Farm Ops — Recovery Runbook (2026-08-14)

**Goal:** make the OnePlus phone-agent farm recoverable and model-consistent without
re-discovering the same failures. Written from measured reality (not theory).

## Scope

- Phone: rooted OnePlus 7T Pro (HD1907), Termux + proot Ubuntu 24.04 chroot
- Router: `/opt/router/opencode-key-router.mjs` on `127.0.0.1:8789` (hex 0x2255)
- Agent: pi 0.84.x inside chroot (`/usr/local/bin/pi`; node22 only)
- Laptop-side drivers: `~/bin/farm-swarm.mjs` (direct-MCP swarm), `~/bin/farm-stage.sh`
  (sync untracked files to phone before swarm), `~/bin/delegate.sh` (one-shot)

## Connectivity ladder (phone drops off LAN)

Symptoms: `ssh :8022` times out, `ping [redacted-lan-ip]` fails, adb still attached.
Order of attempts (from laptop):

1. `adb -s <serial> shell "input keyevent KEYCODE_WAKEUP; svc wifi enable"`
   (screen must be ON; cmd-wifi variants throw Binder errors — svc is the primitive)
2. Wait ~30-60s; check `dumpsys wifi | grep 'Wi-Fi is'` + `ip -o addr show wlan0`.
3. If STILL `Wi-Fi is disabled` / `INTERFACE_DISABLED` → **radio-level wedge** — the
   toggle isn't reaching the driver. Software cannot fix it. Options:
    - **`adb reboot`** (clean): boot-farm auto-restores sshd:8022 + router + ph-agent.
      The single reliable path.
    - Physically toggle Airplane-mode on the device (radio re-init).
4. **ADB-only fallback** (no wifi needed for phone-local work): run the router offline:
   `adb shell "su -c 'chroot .../ubuntu/rootfs /bin/bash -lc \"export
PATH=/usr/local/bin:/usr/bin:/bin HOME=/root; export OPENCODE_KEY_ROUTER_PORT=8787;
nohup /opt/router/start.sh ...\"'"`. Router serves 127.0.0.1:8787 regardless of LAN
   — farm _local_ work (pi, router, worker spawn) works; anything needing WAN does not.
5. If ssh port/IP moved (DHCP re-assign): `adb shell "ip -o addr show wlan0"` gives the
   new IP; or rely on adb-route entirely.

## Router restart forgotten-flag (manual restarts)

`start.sh` sets port from `OPENCODE_KEY_ROUTER_PORT`; **rc.local supplies it at boot**,
but **manual `nohup /opt/router/start.sh` loses it → lands on 8788** and the phone's
pi/mcp (configured for 8787) break. Fix: always export the port first:
`export OPENCODE_KEY_ROUTER_PORT=8787` before start.sh (see `/tmp/fix-port.sh`).

## Model matrix (verified worker-usable, free-tier)

| Ref                                         | Lane       | Status                                 |
| ------------------------------------------- | ---------- | -------------------------------------- |
| `mistral/codestral-2508`                    | mistral    | ✅ runnable                            |
| `mistral/devstral-2512`                     | mistral    | ✅ runnable                            |
| `nvidia/deepseek-ai/deepseek-v4-flash-0731` | nvidia     | ✅ runnable                            |
| `zenmux/x-ai/grok-4.6`                      | zenmux     | ❌ **paid-gated** (router: 402 credit) |
| `logfare/kimi-k3`                           | logfare    | ❌ rate-limited (rotating)             |
| `cloudflare/@cf/moonshotai/kimi-k2.6`       | cloudflare | ❌ 403                                 |

**Key invariant:** a model being _catalog-live_ (router serves `/models`) does NOT make
it worker-runnable — it must ALSO be listed in the phone's
`/root/.pi/agent/models.json` under that provider (pi child resolves at boot).
Add the model-id there to enable a new lane.

## Swarm discipline (driver contract)

- Use `~/bin/farm-swarm.mjs` (direct MCP spawn + harness-side capture) — the TUI
  coordinator is unreliable (workers frequently "complete" with NO file).
- Always `farm-stage.sh <untracked-files>` BEFORE a swarm; the phone clone only has
  committed state → untracked companions produce phantom "missing module" findings.
- Worker prompt contract: file-write + `test -s FILE && echo FILE-WRITTEN` self-verify,
  main-lane re-verifies every deliverable (never trust self-reports on security/truth).

## Version skew warning (2026-08-14)

Laptop is pi 0.84.2 + pi-mcp-adapter 2.26.0. Phone chroot still 0.84.1/2.24.0.
When a phone reconnects, run `pi update` + `pi update --extensions` INSIDE the chroot
to restore parity before swarms that rely on newer pi behavior.

---

_Keep this in sync with reality — a wrong command here costs a session._

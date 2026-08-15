
## Sense-Tissue (room daemon) — 2026-08-14 build
- `room-sense/roomd.mjs` (repo) ↔ `~/roomsense/` on phone. Modes: `serve` (HTTP :8081: page + `/sensors` POST + `/sketch`), `status` (reads NDJSON tail → room sentence).
- Sensor feed: **adb-piloted Chrome** at `http://localhost:8081/` (ok: S env; page sends accel/gyro at 2Hz). Chrome throttles after focus loss → keep `svc power stayon true` + tab foreground for live streaming.
- Verified 2026-08-14: 60 samples/30s; `The room sketches (60 samples…): quiet and stable — no moving mass…` via `node roomd.mjs status` over SSH.
- Termux:API bridging = BLOCKED-AS-BUILT: abstract socket `com.termux.api://listen` → app EACCES (SELinux-policy-internal, same UID; chmod/whitelist/appops all neutralized). Last-fence one-liner (DO NOT run without explicit user OK — opens sandbox): `magiskpolicy --live 'allow untrusted_app * unix_dgram_socket { connect sendto }'`.
- Platform quirks logged: phone DNS broken for ext hostnames; Termux .debs must be installed offline via scp+dpkg; `am` from Termux ≠ system am.

Sense-Tissue room daemon (2026-08-14 build): room-sense/roomd.mjs <-> ~/roomsense/ on phone.
  serve  = HTTP :8081 (page, /sensors POST, /sketch);  status = reads NDJSON -> room sentence.
  Feed: adb-piloted Chrome at http://localhost:8081/ (accel/gyro @2Hz). Chrome throttles after tab focus loss; keep `svc power stayon true` + tab foreground.
  Verified: 60 samples/30 s -> "The room sketches ... quiet and stable" via `node roomd.mjs status` over SSH.
Termux:API = blocked-as-built: abstract socket com.termux.api://listen -> EACCES (SELinux-policy-internal; chmod/whitelist/appops neutral).
  Last-fence one-liner (user OK required; opens sandbox): magiskpolicy --live allow untrusted_app * unix_dgram_socket { connect sendto }
Quirks: phone DNS fails external hostnames; install Termux .debs offline via scp+dpkg; use /system/bin/am.

### Firmware vault status (2026-08-15)
Two baseband/campaign firmware blobs identified: `qdsp6sw.mbn` (ELF32 Hexagon, 29 segments, no symtab — non-Ghidra) and `549_0_2.mbn` (ELF32 ARM carrier SO, Ghidra-importable). GHIDRA import requires absolute `-import` paths + pre-created output dir; `strings` absent in Git Bash (use `grep -aob`); pyelftools lives in `tmp/qcvenv/`. qdsp6sw.mbn best scanned with pyelftools/objdump; 549_0_2.mbn is the real decompile target.

# Jam stack boot recipe (verified 2026-09-09)

Three processes, strict order, each verified before the next. Total wall
time ~2 min when RAM allows (needs ~1GB free; decode JIT needs headroom).

## 1. Decode (8797) — CPU, cache off

```bash
cd "/c/Users/HP/Desktop/Temp while my comp is at the shop/mrt2/tmp" && \
JAX_PLATFORMS=cpu XLA_PYTHON_CLIENT_PREALLOCATE=false \
JAX_ENABLE_COMPILATION_CACHE=0 \
"C:/Users/HP/AppData/Local/Programs/Python/Python311/python.exe" \
-u decode_server.py > decode_pimain_boot.log 2>&1 &
```

- `JAX_ENABLE_COMPILATION_CACHE=0` is the critical flag. jax 0.10.2
  defaults the compilation cache ON; the cache-key serialization
  (`write_bytecode` on the full SpectroStream module) OOMs before the
  real compile. Disabling it compiled in 7.4s where the default died.
  Worth adding to `decode_gpu_boot.cmd` permanently.
- `JAX_PLATFORMS=cpu` matches decode_server.py's own setdefault intent
  ("GPU is busy with generation") — VRAM stays with LM.
- Expect: params slice (~210MB) → layout probe → `jit-compiling` →
  `compiled in ~7s` → `listening on 127.0.0.1:8797`.
- Verify: `python scripts/probe-decode.py` → 11,520 real samples, fast
  after the first compile (~25s first request, ~10s warm).

## 2. Jam (8083) — LM_PORT corrected

```bash
cd "/c/Users/HP/Desktop/Temp while my comp is at the shop/mrt2/tmp" && \
LM_PORT=8796 JAM_PORT=8083 \
"C:/Users/HP/AppData/Local/Programs/Python/Python311/python.exe" \
-u jam_server.py > jam_pimain_boot.log 2>&1 &
```

- `LM_PORT=8796` is REQUIRED. The script default (8806) is stale — a jam
  launched without it retries LM 60× then exits, which is why past jams
  "never connected". `serve()` only runs after `connect_servers()`
  succeeds, so a live 8083 listener proves LM+DEC are both connected.
- Verify: `POST /band_mask {preset|slots}` → 200 with active_slots.

## 3. LM (8796) — someone else's

Owned by the music lane (their boot scripts + env). This recipe assumes
it is already listening. Never kill it to make room — without LM there
is no steering loop and no e2e.

## Known failure signatures

| Symptom | Cause | Fix |
|---|---|---|
| `MemoryError` in `write_bytecode` at boot | compilation cache hashing huge module | `JAX_ENABLE_COMPILATION_CACHE=0` |
| `opt_einsum has no attribute paths` at import | broken namespace pkg in torch-venv | force-reinstall opt-einsum, or use system python |
| Ports LISTENING but connections refused | accept loop wedged, process half-dead | restart that process (not the neighbors) |
| Metrics flow, zero audio frames | decode_worker stuck on dead DEC socket | restart jam (fresh sockets) |
| 101 without `Sec-WebSocket-Accept` | raw-socket WS server | strict clients reject; use lenient client or fix server |

## End-to-end confirmation

`python scripts/e2e-summit.py --seconds 45` drives the exact radio route
(WS + band mask + note states), records streamed PCM, ear_v10 scores it.
Needs the full triple above. First live-radio score: summit v7=100
(0.3s sample — preliminary, needs the full baseline for confirmation).

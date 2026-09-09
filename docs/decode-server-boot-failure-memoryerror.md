# Decode server boot failure — MemoryError in the JAX compile cache

**Date:** 2026-09-09 · **Status:** root-caused + fix verified

## Symptom

`tmp/decode_server.py` would not boot. It loaded the SpectroStream config,
sliced the soundstream tensors, bound the checkpoint, probed the decode
layout — then died. Every lane's e2e failed with
`RuntimeError: no audio frames received` because the jam pump FATALs on
startup when 8797 is down.

## Root cause

`decode_server.py:143` runs `decode_jit(...)` to compile the decode graph.
JAX's compilation cache serializes the whole IR module before compiling:

```
jax/_src/compilation_cache.py:409  get_cache_key -> cache_key.get
jax/_src/compilation_cache.py:145  get -> hashfn(hash_obj)
jax/_src/compilation_cache.py:104  lambda -> _hash_computation
jax/_src/compilation_cache.py:223 _hash_computation -> _canonicalize_ir
jax/_src/compilation_cache.py:216 _canonicalize_ir -> _serialize_ir
jax/_src/compilation_cache.py:203 _serialize_ir -> m.operation.write_bytecode
MemoryError
```

It is a **MemoryError, not a hang** — the box ran out of RAM serializing the
IR (consistent with the 0.99 GB doorbell). The original 22:03 boot log dies at
the same line, so this is a pre-existing condition, not something introduced
later.

## Fix

One env var:

```cmd
set JAX_DISABLE_COMPILATION_CACHE=1
python tmp\decode_server.py
```

With it the server **compiled in 13.5s** and listens on 127.0.0.1:8797.
Without it it dies at the same line.

## Interpreter matters

`tmp/decode_server.py:32` does `import flax.linen`. **No venv has flax** —
`tmp/torch-venv` and `tmptorch-venv` both raise
`ModuleNotFoundError: No module named 'flax'`. Only the system python does
(flax 0.12.8, jax 0.10.2). Launch with `python`, not a venv.

## Other fixes landed in tmp/jam_server.py (same blocker)

1. **int32 wire format.** `decode_server.py:165` reads
   `np.frombuffer(buf, dtype=np.int32)`. `dec_decode` was sending
   `np.int64` (8 bytes/element), so the server mis-shaped mixed-code payloads
   and JAX hung. Verified: int64 mixed → 3840 samples, int32 mixed → 0 bytes,
   int32 zeros → timeout. `dec_decode` now sends int32.
2. **Stale-socket self-heal.** `dec_decode` uses a persistent module-global
   socket opened once at startup. When it goes stale every call throws
   `ConnectionError` and the decode worker `break`s on the first block, so
   the shared `audio_q` never fills. It now reconnects (3 attempts).
3. **Silent exception swallowing.** The decode worker's
   `except Exception: continue` hid every failure. It now clamps codes to
   [0,1023] and logs to `/c/tmp/pitch_style_cross/decode_worker_err.log`.
4. **Zombie-thread starvation.** `handle_client`'s `finally` cleared `running`
   but not `act["ws"]`. A disconnected client whose pump never noticed leaves
   a stale socket, and every new client's steer/pump threads spin forever on
   `act["ws"] is not ws`. Signature: `prog_status` flows, 0 metrics, 0 audio.
   The fix sets `act["ws"] = None` on disconnect.

## e2e driver

`scripts/e2e-summit.py` now sends `prog_set` + `prog_play` before recording.
The pump only streams audio frames once the prog engine is playing
(`jam-radio.ts: prog_play -> engine presses notes -> audio chunks`).

## Verification

With all fixes in place, both e2e paths produce audio and score on the live
stack: summit (cond 11, slots {2,11}) → audio:3, 0.4s, **v7=86**; baseline
(all slots, state 1) → audio:1, 0.2s, **v7=87**. Matches the offline v7=89.

Re-verified 2026-09-09 14:2x on a longer clip (25s wall clock): summit
9 frames / 1.3s → **v7=77**, baseline 24 frames / 1.8s → **v7=82**. The
gap vs. the offline 86 is clip-length dependent (1.3s/1.8s live clips vs. the
offline reference), not a regression — the important result is that **both
paths score and audio flows end-to-end**.

## Related: the LM server dies silently after binding (2026-09-09)

`tmp/lm_server_v3.py` binds 8796, prints `listening on 127.0.0.1:8796`,
then vanishes — no Python traceback, process just exits. Every launch
produced a dead 8796 and the pump FATAL'd on a closed socket.

**Root cause:** line 340 runs `make_sess(path=FUSED_MODEL, graph=True, ...)`
unconditionally whenever `FUSED=1`. CUDA-graph capture serializes the whole
IR and needs host RAM to hold it — with **1.56 GB free** the capture OOMs and
kills the process. The docstring documents `io` as "IO-bound, no capture" and
`plain` as no graphs, but this branch ignored `MODE` entirely.

**Fix:** gate the fused chain on `MODE == 'cuda'` (one line). Launch with
`LM_V3_MODE=io` to skip capture. Same class of failure as the decode
MemoryError, but without the env-var escape hatch.

## All four project venvs are broken (2026-09-09)

`tmp/jax-venv`, `tmp/mrt2-gpu-venv`, `tmp/ort-gpu-venv` are missing
`Scripts/python.exe` entirely. `tmp/torch-venv`'s onnxruntime is corrupted
(AttributeError on import). **System `python` has everything**: onnxruntime
1.24.4 GPU, flax 0.12.8, jax 0.10.2. Run the whole stack under system
`python` — do not depend on any venv.

## Launch gotchas

- **`start /min` children die with the parent `cmd`** when the batch returns.
  The three services must be started so each survives independently.
- **Git Bash's PATH ships GNU coreutils**, whose `timeout` shadows the
  Windows one and rejects `/t`. Use `ping -n N 127.0.0.1 >nul` for sleeps.
- **`start /min "title" program args`**: the first quoted string is the title.
  Do NOT wrap the whole command in another quote layer, or `start` eats it
  and the program is not found.
- **`netstat`/`ss` are unavailable in this shell** (rc=127/empty). Probe ports
  with a Python `socket` connect instead.

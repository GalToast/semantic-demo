# 2035 Session Patterns — 2026-09-01 Reference

## 1) Resource Governor
`tmp/gpu_window.py` — **MISSING from disk.** Pattern known from session: pause sidecars → run → restore. No artifact to quote.

## 2) Lane Sweep + Model Map
From `tmp/lane-sweep.py` (verified on disk):

```python
R = "http://127.0.0.1:8788"
ROUTES = ["openrouter/v1", "nvidia/v1", "modelscope/v1", "novita/v1",
          "infron/v1", "freemodel/v1", "kilo/v1", "mistral/v1"]
```

Probe: one confirmed live model per lane (`hits >= 1`) via `chat(route, m)`.  
Print format:
```python
print(f"LIVE {route} :: {m} :: {note}")
print(f"SKIP {route} (no catalog)")
```

Alive/dead/gated lanes: **not recorded in source** — sweep produces live squad at runtime only.

## 3) The 12→144 Cond Rule
`tmp/build_cond_a1.py` — **MISSING from disk.**  
Exact one-liner cannot be spot-checked. Claimed rule: `cond[i]=token[i]+7`, reserved tail `[6,27,17,9]`. **Verify before reuse.**

## 4) Two-Venv Split Architecture
`tmp/feedback_composer.py` — **MISSING from disk.**  
Known split: `ort-gpu` for gen, `torch` for decode+listen. No verbatim spec available.

## 5) INT4 Procedure
`tmp/ab_int4.py` — **MISSING / BLOCKED (incomplete artifact).**  
Expected flow: re-quant → completeness check → A/B. Completeness check required before trusting results.

## 6) Modality-Gap Negative Result + Calibration
`tmp/2035-c1-real.py` + `tmp/2035-c1-offline.py` — **MISSING from disk.**  
Negative result recorded in session memory only; no artifact to quote.

## 7) Never-Block Audit (pibg phase-2)
From `tmp/pibg-phase2-REPORT.md` (verified on disk):

Landing items:
- generic-detach streaming: records in `index.ts` (2 sig hits)
- self-heal registry: `UPGRADE_REGISTRY.md` +29 lines (3 sig hits)
- chunk threshold 30000→2000ms
- editor cursorLeft freed of ctrl+b → `app.bash.background` fires

Remaining:
- server-side long-poll (`action=wait` block up to 600s)
- digest suppression (`lastCheckedAt` per job)
- cross-wiring guard (unique-handle assertion, 5-concurrent test)
- pid parity (`process.pid` in generic detach `started` event)

## Lessons
- log echoes ≠ verification — main lane independently confirms evidence files + fresh runs
- worker claims need fresh-run verification
- `rg -r` is REPLACE not recursive

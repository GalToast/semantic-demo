# Ghidra Firmware Lab — QC Hexagon/ARM SoC Binaries

## Wave-1 Findings (2026-08-15)

Baseband dig resolved today. Two firmware images, different ISAs, different Ghidra friction profiles.

### qdsp6sw.mbn — Hexagon DSP firmware

- **ELF32**, machine `EM_QDSP6` (Qualcomm Hexagon). 29 loadable segments.
- **No sections** in the ELF: no symbol table, no `.text` / `.data` names — Ghidra cannot parse them out of the box.
- **No Hexagon language module** ships with Ghidra's base install; import fails without it.
- What survives is **plaintext diag / QMI markers** baked into the raw payload: byte counts `61 / 35 / 501` and related string constants that give rough anchors for slice boundaries.
- Bottom line: use `objdump -d` / `pyelftools` for hex-level walking, not the Ghidra GUI.

### 549_0_2.mbn — Carrier SO (ARM target)

- **ELF32 ARM**, the real Ghidra-import target. Sections present, symbols findable.
- This is the "carrier system-on" binary — the one worth feeding to `analyzeHeadless` for full decompilation.

### Infra lessons (from the attempt)

| Problem | Fix |
|---|---|
| `analyzeHeadless` needs import file | Pre-create the target dir **and** pass an **absolute** `-import` path; relative paths silently fail. |
| `strings` not available in Git Bash | Use `grep -aob '.\{4,\}' <file>` as the portable fallback. |
| pyelftools not on PATH | Install in `tmp/qcvenv/` virtualenv; invoke via `tmp/qcvenv/bin/python` (not bare `python`). |

### Line-level effort

- ~15 min triage (identify ELF type, segment count, section presence).
- ~5 min infra wiring (virtualenv + pyelftools install + grep workaround).
- ~10 min deciding qdsp6sw.mbn is non-Ghidra vs. 549_0_2.mbn.

## Next steps

- Run `analyzeHeadless` against `549_0_2.mbn` with absolute paths.
- If qdsp6sw.mbn diagnostics matter, script `pyelftools` walks for segment-level extraction.
- Capture any Ghidra project outputs under `docs/evidence/ghidra-*` for traceability.

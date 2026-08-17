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

| Problem                             | Fix                                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `analyzeHeadless` needs import file | Pre-create the target dir **and** pass an **absolute** `-import` path; relative paths silently fail. |
| `strings` not available in Git Bash | Use `grep -aob '.\{4,\}' <file>` as the portable fallback.                                           |
| pyelftools not on PATH              | Install in `tmp/qcvenv/` virtualenv; invoke via `tmp/qcvenv/bin/python` (not bare `python`).         |

### Line-level effort

- ~15 min triage (identify ELF type, segment count, section presence).
- ~5 min infra wiring (virtualenv + pyelftools install + grep workaround).
- ~10 min deciding qdsp6sw.mbn is non-Ghidra vs. 549_0_2.mbn.

## Next steps

- Run `analyzeHeadless` against `549_0_2.mbn` with absolute paths.
- If qdsp6sw.mbn diagnostics matter, script `pyelftools` walks for segment-level extraction.
- Capture any Ghidra project outputs under `docs/evidence/ghidra-*` for traceability.

## WAVE-2: RF INTF table harvest (lf1 takeover, main lane, 2026-08-15)

Largest protocol-dense PT_LOAD (vma 0xc43f1000; 4,295 marker hits) → 600 unique
tokens → tmp/firmware-lab/proto-tables/{proto-table.csv, proto-summary.md}.
Top RF-interface names (count × first-offset):

- sdr865_dtr_rx_fw_intf.cpp ×185 @0x2a1588 · sdr865_dtr_tx ×89 @0x241520
- smr526_dtr_rx_fw_intf.cpp ×39 · rflm_dtr_pll_fw_intf.cpp ×19
- fw_llc.c ×24 · rflm_vswr_fw_proc.c · rfe_nr5g_rx_fw_intf.c · rflm_diag_log.cc
  Architecture read: modem offloads RF front-end handling to DSP "intf" objects
  (RFLM = RF Low-level Manager; DTR = digital transceiver; RFE = RF front-end,
  5G NR). DIAG hooks present on rflm_* — per-name filter addresses live in the CSV.

## WAVE-3 (swarm-7): tool verdicts

- **Hexagon disasm: Capstone-5.0.7 ships ZERO Hexagon/QDSP6 ISA** — the 64KB slices
  disassemble as bogus ARM (rsbne/stclpl blobs). For QDSP6 code we need a real
  Hexagon toolchain (llvm/hexagon, QEMU hexagon, or qurt-aware dumper). ADDRESSING
  WORK CONTINUES via the RF-intf VMA map (rf-intf-vma.csv), not raw disasm.
- **RF-INTF VMA map banked** (swarm64 s7): top entries → real addresses:
  sdr865_dtr_rx @0xc4692588 · smr526_dtr_rx @0xc468f3e0 · PLL/tx intfs nearby —
  exact filter/patch sites for future observability.

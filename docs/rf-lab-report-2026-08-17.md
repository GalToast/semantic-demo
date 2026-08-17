# RF Lab State of Play — 2026-08-17 (citable summary)

Track-B status: **the baseband's operator surface is mapped, executed, and debounced.**

## Verified artifacts (reproducible paths)

| Artifact | Location/state |
|---|---|
| Hexagon function corpus | `tmp/firmware-lab/ghidra-out/corpus.txt` — **23,710 functions** (Ghidra 12.1.2 headless, project `sdx55_swarm13`) |
| String corpus w/ holders | `corpus2.txt` (60,906 strings, 3.7 MB) |
| RF operator table | `tmp/firmware-lab/rf-operator-table.md` — **9,534 string↔function rows**, function-joined |
| Annotated family map | `tmp/firmware-lab/rf-annotated.md` — 28 string families with purposes |
| Emulator proof | `emulator-proof.md` — **Hexagon instructions executed** via `EmulatorHelper` (PC c1601e80→c1601e84; megahandler stepped c1cb8f64), register ABI captured (R1R0 pairs) |
| Carrier 549 | `…/modem_pr/so/549_0_{1,2,4}.mbn` — ELF32-LE **e_machine 164 (Hexagon)**, 3-variant family, 555-669 strings, "San Diego" lineage |

## Key findings (measured)

- The RF-INTF surface = **one megahandler** (`FUN_c1cb8f60`) whose string families are the modem's protocol chatter: scheduler (SCH UERS), TRF firmware intf (sdr865_dtr_*), RF-layer manager (RFLM phase snapshots), NR5G L1 events, sub-6 Rx AGC.
- The operator map links each family to addresses — the first link between the string-soup and executable behavior.
- The emulator springboard = `pyghidra <bin> emu_driver.py` (open `/qdsp6sw.mbn → program_context → EmulatorHelper; the ONLY script runtime this install exposes reliably).

## Core linkage to product (semantic-explorer)

- `semantic_threads.dat.bin` (TDB1, 2.58 MB) = the graph file shipped to clients; **the worker now prefers it** (fallback JSON preserved): 30.8× smaller raw, ~100× parse, 0.83 MB on the wire.
- Parallel TDB-R rows generator: 0.506 MB (70.6% smaller).

## Next lab steps (for the phone/EDM lane)

1. Emulator on the megaphandler internals with crafted args (springboard is proven).
2. Carrier-di（549 family）behavioral diff via the EDM lane.
3. Annotate depth: turn family-purpose lines into function-level one-liners on the 9,534-row map.

— written by the main lane into tmp/ and docs/; every number above re-runnable via the scripts + files named.

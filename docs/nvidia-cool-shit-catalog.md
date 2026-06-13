# NVIDIA Cool Shit Catalog

Working log for NVIDIA capability experiments exposed through `nvidia-capabilities`.

Do not store API keys, raw auth headers, account identifiers, or large provider responses here.

## Current Tool Surface

- `nvidia_image_generate`
- `nvidia_image_edit`
- `nvidia_video_generate`
- `nvidia_async_status`
- `nvidia_speech_to_text`
- `nvidia_text_to_speech`
- `nvidia_weather_climate`
- `nvidia_cuopt_submit`
- `nvidia_cuopt_status`
- `nvidia_bio_request`
- `nvidia_document_parse`
- `nvidia_embed`
- `nvidia_rerank`
- `nvidia_api_request`

All quota-consuming tools default to `execute: false`.

## First Smoke Matrix

| Capability | Tool | Tiny test | Success means |
|---|---|---|---|
| Image generation | `nvidia_image_generate` | FLUX prompt for a tiny icon | Image artifact saved, metadata captured |
| Climate/weather | `nvidia_weather_climate` | CorrDiff built-in sample, low steps | JSON or artifact returns, no schema rejection |
| Forecast | `nvidia_weather_climate` | FourCastNet sample `input_id=0` | Result or request id captured |
| Optimization | `nvidia_cuopt_submit` | 2-node validator problem | Validator accepts schema or returns actionable validation |
| Bio structure | `nvidia_bio_request` | AlphaFold2 short valid sequence | PDB artifact saved or clear provider limit |
| Molecule generation | `nvidia_bio_request` | GenMol masked SMILES sample | Molecule list or schema guidance |
| Document parse | `nvidia_document_parse` | Small UI screenshot | Structured parse/OCR JSON or request id |

## cuOpt Ideas

cuOpt is best thought of as constrained optimization, not only truck routing. The managed endpoint is routing-shaped, but routing can encode many assignment problems:

- Task scheduling: workers as vehicles, tasks as stops, durations/time windows as constraints.
- Agent workload balancing: agents as vehicles, repo seams as stops, context/cost as capacity.
- Batch planning: outreach/research jobs as stops with priority and deadline windows.
- Test ordering: tests as stops, setup cost as travel cost, flaky risk as penalty.
- Route-like dependency planning: dependencies as precedence/time-window constraints.
- Resource allocation: GPU/API-key lanes as vehicles, jobs as stops, rate limits as capacities.

Start with validator mode before optimized routing:

`action: "cuOpt_RoutingValidator"`

Then graduate to:

`action: "cuOpt_OptimizedRouting"`

## AlphaFold2 Ideas

AlphaFold2 predicts protein structures from valid amino-acid sequences. It is not a general 3D model generator, but it can still be creatively useful:

- Random valid peptide fold gallery.
- Motif-preserving mutation experiments.
- LLM proposes sequence, AlphaFold2 folds it, VLM critiques shape.
- Protein sculpture attempts: iterate sequence -> PDB -> render -> critique.
- Pair with GenMol/MolMIM/DiffDock for molecule/protein playgrounds.
- Compare structure sensitivity across tiny sequence edits.

Keep expectations grounded: the input alphabet is biological, and output is protein structure/PDB.

## Result Log

| Date | Tool | Model/Endpoint | execute | Result | Artifact | Notes |
|---|---|---|---|---|---|---|
| 2026-06-13 | `nvidia_image_generate` | `black-forest-labs/flux.1-dev` | false | dry-run ok | none | request plan built with redacted auth |
| 2026-06-13 | `nvidia_weather_climate` | `fourcastnet` | false | dry-run ok | none | request plan includes `NVCF-POLL-SECONDS` |
| 2026-06-13 | `nvidia_cuopt_submit` | cuOpt validator | false | dry-run ok | none | toy 2-node validator plan |
| 2026-06-13 | `nvidia_bio_request` | AlphaFold2 | false | dry-run ok | none | short sequence plan |
| 2026-06-13 | `nvidia_image_generate` | `black-forest-labs/flux.1-schnell` | true | bug found | `reports/nvidia-capabilities/flux-schnell-cube.jpg` (initially saved as raw JSON, manually re-decoded) | Discovered `args.outputPath` short-circuited the binary dispatch in `guardedNvidiaRequest` |
| 2026-06-13 | (patch) | `tools/agent-runtime/mcp/nvidia-capabilities/index.mjs` | — | fixed | `test-outputpath-save.mjs` | Renamed `isBinary` to `looksBinaryFromHeader`, removed `|| args.outputPath` from the predicate. 7-case regression test passes. Patch takes effect after MCP client restart |
| 2026-06-13 | (audit) | `nvidia_text_to_speech`, `nvidia_video_generate`, `nvidia_document_parse`, `nvidia_bio_request`, `nvidia_weather_climate` | — | no further fixes needed | — | All flow through patched `guardedNvidiaRequest`. Wrappers that omit `outputPath` (embed/rerank/cuopt) were never affected |
| 2026-06-13 | (probe, OpenRouter) | `google/gemini-2.5-flash-image` | true | works, but PAID | `reports/openrouter-image-gen/gemini-flash-cube.png` (kept as reference) | Confirmed OR image gen bills the user (~$0.04/call, is_byok=false). Do not use OR for image gen |
| 2026-06-13 | (rule) | OpenRouter `:free` gate | — | saved to memory | — | Hard rule: only call OpenRouter models with `free` in the name (e.g., `:free` suffix). All other OR models treated as paid. NVIDIA NIM is free via 5 nvapi keys and is the default image gen path |
| 2026-06-13 | `nvidia_embed` | `nvidia/nv-embedqa-e5-v5` | true | works | `reports/nvidia-capabilities/embed-cube-vs-mycelium.json` (58KB, full 1024-dim vectors) + `.similarity.md` + `.compute.mjs` | Cosine gap of 0.46 between product-photo cubes (A↔B=0.678) and the mycelium concept (A↔C=0.219, B↔C=0.223). Hypothesis confirmed. **Schema gotcha:** the wrapper silently drops the `input` field when using `args.input` alone; workaround is `args.requestBody = { model, input, input_type: 'query' }` to bypass `compactObject`. 50 prompt tokens = $0.00 |
| 2026-06-13 | `nvidia_rerank` | `nvidia/rerank-qa-mistral-4b` | true | works | `reports/nvidia-capabilities/rerank-semantic-vs-geographic.md` | 5-passage rerank on a Montgomery County / mycelium query: passage 2 ("semantic explorer" + mycelium) at **+3.998 logit**, dominating the next-best (Woodlands community) by 11.7 logit units. **Two gotchas:** (1) `query` and `passages` must be **dicts** like `{"text": "..."}`, not plain strings — use `args.requestBody` to bypass; (2) the MCP tool's default `nvidia/llama-nemotron-rerank-1b-v2` is **404 Unknown model** — the served names are `nvidia/rerank-qa-mistral-4b` and `nv-rerank-qa-mistral-4b:1`. **MCP wrapper default is stale; needs a fix.** |

## Safety

- Run dry-runs first.
- Use tiny tests for first execute.
- Save generated media, PDB, tar, NumPy, and binary outputs to `reports/nvidia-capabilities/`.
- Summarize outputs in docs; do not paste large binary/base64/provider dumps into chat or repo docs.

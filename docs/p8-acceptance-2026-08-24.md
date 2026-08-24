# P8 Hardware Acceptance — emulation edition (2026-08-24)

S5 auto-enter-3D posture validated as far as emulation allows. Verdict:
**decision layer proven exhaustive; both branches behave correctly in a real
browser; one real finding — prod scene-init flakiness (task 145) manifests
on the mobile webgl path.**

## Layer 1 — decision matrix (unit, 11/11 green)

`tests/unit-active/s5-capability-gate-matrix.test.ts` pins
`supportsCapableWebGL()` across the device-input cross-product via ProbeEnv:

| input                                   | result                                      |
| --------------------------------------- | ------------------------------------------- |
| capable GL + 4GB+/4+ cores              | enter (true)                                |
| SwiftShader-class GL (caveat rejection) | fallback (false)                            |
| no webgl2 / throwing driver             | fallback (false)                            |
| deviceMemory < 4                        | fallback                                    |
| cores < 4                               | fallback                                    |
| hints missing (old iOS)                 | pass-through (true)                         |
| prefers-reduced-motion                  | fallback always                             |
| caveat option requested                 | always `failIfMajorPerformanceCaveat: true` |
| context cleanup                         | `WEBGL_lose_context.loseContext()` called   |

## Layer 2 — weak-GPU bucket (real browser)

`--disable-webgl2 --disable-gpu` (honest no-capable-GL bucket; note
`--enable-unsafe-swiftshader` BYPASSES the caveat safeguard and is useless
as a weak-GPU simulation):

- fallback to `placeholder2d` at **999ms**, placeholder rendered ~51fps
- zero three.js load (source-edge cuts from 46299a61 confirmed at runtime)

## Layer 3 — capable-GPU bucket (real browser, d3d11 + 4x CPU throttle)

- auto-enter: `renderKind=webgl` at **1610ms**, scene-ready fired, 60fps sample
- heap 11MB; UI chrome correct (mode rail, hero, search — screenshot
  tmp/p8-gpu-mobile-scene.png)
- note: no DOM `<canvas>` found while scene runs — rendering likely via
  OffscreenCanvas/worker; visual confirms output regardless

## Layer 4 — prod (deployed build, real network)

- auto-enter decision fires over network: webgl @ **6.5-7.4s**
- fps 54-60; heap 10MB
- ⚠️ **sceneReady stayed `false` in 2 of 3 runs** past a 31s window
  (true in one earlier 12s run) — this is the task-145 scene-init timeout
  flake reproducing on prod's mobile webgl path. Impact: a capable phone
  can auto-enter webgl and hit the init-timeout path with no scene and no
  automatic fallback to 2D. **Feeds task 145**; candidate mitigation:
  on scene-init timeout in webgl posture, fall back to placeholder2d
  instead of leaving a dark stage.

## Residual gap (what emulation cannot cover)

Real-RN deviceMemory/cores reporting values, thermal sustained-FPS decay,
touch latency. The gate's thresholds (4GB/4cores/caveat) are now proven
correct per-input; only their VALUES on silicon remain unverified.

Probe: tmp/p8-acceptance-probe.mjs (`swift|weakgl|nowebgl2|gpu` modes, URL arg).

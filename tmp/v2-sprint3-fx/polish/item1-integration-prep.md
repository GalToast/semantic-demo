# Item 1: Phase-5B Integration Prep — V2 Failover Overlay Entry Point

## V1 tryFailover Definition

- **File:** `C:/Users/HP/harness/servers/key-router/src/opencode-key-router.mjs`
- **Line:** 1703 — `async function tryFailover(providerKey, provider, modelScope, rawBody, req, res, requestUrl)`
- **Bug (documented):** Returns true regardless of upstream alt-provider status; always signals "failover succeeded" (false positive).

## V1 Dispatch Loop / Per-Carrier Iteration Sites

| Site | Line | Purpose |
|------|------|---------|
| `selectedProvider()` | 2020 | Route prefix → `{providerKey, provider}` lookup from the `providers` object |
| `forward()` | 3378 | Per-carrier dispatch loop: key selection → proxy → error handling → retry |
| Key exhaustion failover | 3519 | In-flight inside `forward()` after `!active.length`; calls `tryFailover` for cross-provider failover before returning 429 |
| All-keys-failures failover | 4058 | Late exit in `forward()` after all key rotations exhausted; calls `tryFailover` on FAILOVER_STATUSES [400, 404, 502, 503, 504] |

## Provider → Route Prefix Map (canonical, lines 36–218)

```
providers = {
  zen:      "/opencode-zen/v1"   (line 39)
  nvidia:   "/nvidia/v1"         (line 46)
  mistral:  "/mistral/v1"        (line 59)
  modelscope: "/modelscope/v1"   (line 72)
  kilo:     "/kilo/v1"           (line 86)
  openrouter: "/openrouter/v1"   (line 99)
  freemodel: "/freemodel/v1"     (line 112)
  logfare:  "/logfare/v1"        (line 123)
  zyditev4: "/zydit/v4"          (line 145)
  openprovider: "/openprovider/v1" (line 156)
  neuralwatt: "/neuralwatt/v1"   (line 167)
  llm7:     "/llm7/v1"           (line 178)
  gemini:   "/gemini/v1"         (line 189)
  cloudflare: "/cloudflare/v1"   (line 201)
  agnes:    "/agnes/v1"          (line 208)
  zenmux:   "/zenmux/v1"         (line 219)
}
```

## Integration Options

| Option | Pros | Cons |
|--------|------|------|
| **(A) Header-gated early-return in `forward()`** — Insert at line ~3379, right after `requestStartedAt`, check `X-Router-V2-Failover: 1` header; if set, load+call V2 overlay module | Zero disruption to existing flow; single gate; test-stubbable via header | Requires ESM dynamic import; module resolution may be tricky in this monolithic file |
| **(B) Wrap `proxyToUpstream` call** — Surround the key-proxy loop (lines 3570+) with V2 wrapper that intercepts before key exhaust | Clean seam at actual I/O boundary; least invasive to dispatcher logic | The loop has many early-returns (auto-shard, gemini adapter, etc.); wrapping at the wrong level could miss cases |
| **(C) `selectedProvider()` hook** — After line 2020 returns `{key, provider}`, if V2 header is present, call V2 routing override before `forward()` | Central decision point; V2 can return null to fall through to V1 | `selectedProvider()` is pure mapping; V2 would need to do route-prefix → new upstream URL translation |
| **(D) Module-level `require()` at boot time (ESM `import`)** — Load V2 overlay as a top-level conditional import when header flag persists or env var set | Clean separation; V2 module is fully decoupled | Too global; V2 should be request-scoped not boot-scoped |
| **(E) `tryFailover` replacement** — Directly patch the `tryFailover` function at line 1703 with V2 logic | Minimal code change; uses existing failover hook points | Doesn't scale — V2 needs per-request proactive routing, not reactive failover. Also the function has the documented bug |

## Recommended Execute Path

**Option (A): Header-gated early-return inside `forward()`** is the best fit. Rationale: `forward()` is the canonical dispatch-path site where every per-carrier request converges. Insert right after `const requestStartedAt = Date.now()` (line 3379): check for `req.headers["x-router-v2-failover"] === "1"`. If present, `import()` the V2 overlay module (`./v2-failover-overlay.cjs`) which implements its own key selection + proxy logic. The V2 module returns `{ proxied: true }` on success or falls through to V1's normal path. This keeps V1 strictly as default (no header = no V2), avoids all the fragmentation of option B/C/D/E, and the V2 module can independently manage its own fallback chain without the `tryFailover` bug surface. The existing `FAILOVER_ENABLED` constant pattern (line ~1708) already exists in `tryFailover` — the V2 overlay can simply add an additional check for the header so both layers coexist cleanly.

## V2 Opt-In Confirmation

V2 stays opt-in. Default behavior (no header) routes exactly as today. The header `X-Router-V2-Failover: 1` must be explicitly sent by the client/harness. Combined with the existing `FAILOVER_ENABLED` environment variable, V2 requires BOTH conditions to activate: env flag + header. This ensures V1 is always the default until Sprint-1/2/3 deliverables land, at which point the header becomes unnecessary and the opt-in flag can be removed in Sprint-4.

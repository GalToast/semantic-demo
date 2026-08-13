# Laptop/Phone Model Parity

The laptop and phone now have one canonical, secret-free catalogue plus a
device-specific dispatch projection. The canonical catalogue preserves every
model record discovered from the laptop registries and live local routers;
the phone projection contains every model whose phone route is currently
catalog-visible. A model that exists only behind a laptop credential or a
direct laptop endpoint remains visible in the catalogue with
`phoneDispatch: null` instead of being silently dropped.

## Canonical workflow

Build the complete catalogue and the phone projection:

```powershell
node scripts/build-model-catalog.mjs `
  --laptop-router=http://127.0.0.1:8788 `
  --phone-probe-router=http://127.0.0.1:18789 `
  --phone-device-router=http://127.0.0.1:8789 `
  --write-projection
```

The source union includes Qwen settings, Pi's generated provider registry,
Pi's native picker and model cache, all three local OpenCode config locations,
and Cline provider settings. It also adds the current model IDs returned by
the laptop and phone router `/models` catalogues. Source provenance and failed
route status stay in the manifest.

The phone router is reached through an ADB forward when the chroot router is
listening on `127.0.0.1:8789`:

```powershell
adb forward tcp:18789 tcp:8789
```

## Authority and drift verification

The canonical manifest is the audit authority; the schema-pure `models.json`
projection is the active Pi picker authority. Verify that relationship before
deploying or after a phone reboot:

```powershell
npm run models:verify-catalog

# Add --serial to compare both local hashes with the physical chroot files.
node scripts/verify-model-catalog.mjs --serial=77aeb8a8
```

The verifier is read-only, performs no provider/network calls, and is not part
of Pi's hot startup path. It checks the secret-free policy, native projection
shape, canonical/projection equality, dispatch-entry parity, summary counts,
and, when `--serial` is supplied, the two remote SHA-256 hashes. Multiple
canonical source records may intentionally collapse to one picker entry when
they map to the same phone route; a provider/model identity mapping to
different phone routes is rejected as ambiguous. A failed
check means the projection should be rebuilt with `npm run models:canonical-catalog`
before it is deployed; it never rewrites either authority automatically.

The output separates these states:

- configured: present in a device Pi config;
- catalog-visible: returned by that device's local router `/models` endpoint;
- chat/tool-proven: established only by an explicit smoke test;
- projected: a canonical model whose exact ID is present in a healthy phone
  route and can be represented in the phone config;
- laptop-only/unavailable: preserved in the canonical manifest but not added to
  the active phone picker because its phone route is absent, failed, or missing
  the model ID.

`/models` visibility alone never promotes a model to chat/tool-proven. The
projection contains only model metadata and the literal local-router marker
`apiKey: "router"`; it never copies laptop credentials. Deploy the projection
to the phone only after reviewing route status and resource limits.

## Capability-status companion

The native Pi picker stays schema-pure. Generate a separate, secret-free
status companion after a bounded health run:

```powershell
npm run models:capability-status
```

The sidecar is written to
`tmp/phone-model-health/capability-status.json` with a Markdown summary beside
it. Each route/model target keeps four independent states:

- `catalog-visible`: the exact model ID was returned by that target's `/models` probe;
- `chat-proven`: an explicit chat smoke returned a usable choice;
- `tool-proven`: an explicit tool result was observed;
- `vision-proven`: an explicit vision result was observed.

`not-tested`, `not-visible`, `cooldown`, `timeout`, `transport-error`, and
`failed` remain distinct from proof. Declared `supportsTools` or
`supportsVision` metadata never promotes a model to proven, and generating the
sidecar makes no provider calls. This keeps picker startup fast while giving
workers and audits an evidence-bearing companion to consult.

## Repeatable operations

Run a bounded catalog matrix through the ADB-forwarded phone router:

```powershell
npm run models:phone-health
```

This defaults to catalog-only mode. Add `--smoke` only for a deliberately
small chat probe. Smoke selection prefers free-marked models and known no-cost
lanes; `--include-paid` is required to probe a paid candidate. Concurrency is
capped at two, timeout at eight seconds, and there is no automatic retry loop.

Preview a paired catalogue/projection deployment without touching the phone:

```powershell
node scripts/deploy-phone-model-catalog.mjs `
  --catalog=tmp/phone-model-parity/canonical-model-catalog.json `
  --projection=tmp/phone-model-parity/phone-models.projection.json `
  --serial=77aeb8a8 `
  --suffix=review
```

The write path requires an explicit `--apply`. It backs up and atomically
replaces both chroot authorities, then verifies both SHA-256 hashes:

- `<rootfs>/root/.pi/agent/model-catalog.json` is the complete catalogue;
- `<rootfs>/root/.pi/agent/models.json` is the active Pi picker projection.

The physical rootfs copies are authoritative for chrooted Pi; updating only
the Termux home copies does not update the active chroot picker. The paired
deploy never copies raw API keys, environment values, browser credentials,
SSH keys, or unrelated secrets. Provider credentials remain behind the phone
router's `apiKey: "router"` boundary.

## Current verified shape

The 2026-08-13 live build recorded 8 sources, 4,699 source records, 3,938
deduplicated route/model records, and 57 routes. The final phone probe had 19
healthy dispatch routes, yielding 1,997 unique picker entries from 2,031
dispatchable route records. OpenCode Zen and several other routes were
preserved in the manifest but excluded from the active picker while their
phone catalog returned cooldown/error responses. These are a point-in-time
health snapshot, not a permanent availability guarantee.

## Credential boundary

“100% catalogue parity” and “100% credential parity” are separate controls.
The catalogue carries named environment references and route metadata, never
their values. Copying every laptop secret would also copy unrelated payment,
browser, SSH, and operating-system credentials and would make the phone a
second credential-bearing workstation. To provision model access later, add a
small explicit allowlist of model-router/provider credentials and verify it
without logging values; do not bulk-copy the laptop environment.

`/models` visibility does not prove that a provider will answer a chat or tool
request. Use the manifest plus bounded smoke tests for that distinction.

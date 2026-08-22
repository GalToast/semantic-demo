# Runtime model catalogue reconciliation

The Pi picker has more than one catalogue surface. A model can be present in
the parent router, absent from the generated Pi manifest, or present in a
picker registry while the route cache does not contain it. Those are different
failures and must remain visible as different states.

Run the read-only audit with:

    npm run models:reconcile-runtime -- --format=markdown

Use JSON for machine checks:

    npm run models:reconcile-runtime -- --format=json --output=tmp/model-catalog-reconciliation.json

The audit compares:

- the shared Pi router cache at ~/.pi/agent/.cache/router-catalog-cache.json;
- the generated manifest at ~/.pi/agent/model-catalog-manifest.json;
- ~/.pi/agent/models.json;
- ~/.pi/agent/model-providers.json.

It does not make completion requests, mutate the cache, or copy credentials.
The freshness budget defaults to the Pi router cache TTL (600000 ms) and can be
overridden with --max-age-ms=....

## Route states

| State | Meaning |
| --- | --- |
| cataloged | Router declared the route and its cached /models entry is fresh. This is catalogue evidence only. |
| catalog_stale | A route catalogue exists but is outside the freshness budget. |
| catalog_failed | The router declared the route, but its cached catalogue is missing or invalid. |
| cooling | Every key is unavailable for the requested model scope; partial model/key cooling remains route-pressure evidence. |
| backoff | Router route status reports route-wide backoff. |
| catalog_only | A cached route exists without a matching root route declaration. |
| manifest_only | A manifest or picker registry has the route, but the router cache does not. |
| unconfigured | No catalogue or registry evidence identifies the route. |

The report also emits model-level differences, including:

- cache_model_missing_from_manifest: a newly visible upstream model needs
  manifest refresh or normalization;
- manifest_model_missing_from_cache: a manifest entry is stale, retired
  upstream, or on a failed route;
- picker_model_missing_from_cache: the picker registry is ahead of the
  route cache and will not be launchable from that route;
- picker_model_missing_from_manifest: picker metadata and generated
  catalogue have drifted.

Recent route pressure is reported separately from route state. It includes
failure counts, non-blocking cooling counts, and model-scoped failure evidence.
If an upstream failure has no model ID, it is recorded as unknown-scope
pressure; it never degrades every model on that provider. There is deliberately
no provider-wide `degraded` state for a partial model failure: a healthy sibling
remains independently usable and visible.

These findings are diagnostic. A route being cataloged does not prove that a
chat request, reasoning stream, tool call, template, context window, or
max-token value is valid. Those capabilities need separate evidence with
provenance and age.

Focused verification:

    npm run check:model-catalog-runtime
    npm run check:model-catalog

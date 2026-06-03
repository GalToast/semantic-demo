# Noncritical Surface Contract Triage

**Date:** 2026-05-19
**Surfaces tested:** mobile-idle, launch-focus, search-error, map-trail, focus-pocket, field-node, info-panel-empty, compass-rail, loading-overlay, mode-grid
**Test harness:** `tests/surface-contract-check.mjs` + Python HTTP server (8795)
**Run ID:** 2026-05-19T05-14-20-671Z

---

## Summary

| Surface | Pass | Fail | Classification |
|---------|------|------|----------------|
| mobile-idle | 9 | 0 | GREEN - ready to promote |
| launch-focus | 6 | 1 | Real UI bug (touch target) |
| search-error | 5 | 4 | Real UI bugs (3x touch target + text clip) |
| map-trail | 9 | 0 | GREEN - ready to promote |
| focus-pocket | 9 | 0 | GREEN - ready to promote |
| field-node | 14 | 0 | GREEN - ready to promote |
| info-panel-empty | 10 | 0 | GREEN - ready to promote |
| compass-rail | 12 | 0 | GREEN - ready to promote |
| loading-overlay | 11 | 0 | GREEN - ready to promote |
| mode-grid | 9 | 1 | Real UI bug (visibility leak) |

**Overall: 94 pass / 6 fail across 10 surfaces.** 8 of 10 surfaces are green or green-worthy. 2 surfaces have confirmed real UI bugs.

---

## Failure Detail

### launch-focus
| Check | Message | Classification |
|-------|---------|----------------|
| `touch-target:dive-button` | dive button < 44px tall | **Real UI bug** - touch target undersized on mobile |

**Context:** `diveBtnTouchTarget: false` in raw contract data. Button is present and text is not clipped, but fails the 44px minimum touch target height requirement. This is a real accessibility failure.

---

### search-error
| Check | Message | Classification |
|-------|---------|----------------|
| `touch-target:retry-button` | retry button < 44px tall | **Real UI bug** |
| `touch-target:dismiss-button` | dismiss button < 44px tall | **Real UI bug** |
| `text-clipping:compass-title` | search compass title is clipped | **Real UI bug** |
| `visibility:share-toggle` | share toggle should not overlap mobile search drawer | **Real UI bug** |

**Context:** Error state surfaces are consistently failing touch target requirements (both action buttons below 44px), compass title text is being clipped, and the share toggle is leaking visibility into the search drawer. This is a multi-symptom failure on the error recovery surface.

---

### mode-grid
| Check | Message | Classification |
|-------|---------|----------------|
| `visibility:mode-chips` | mode chips should not be visible in mobile focus-search | **Real UI bug** |

**Context:** `modeChipsVisible: true` in raw data - the chips are rendering even though `modeGridDisplay: none`. This is a CSS visibility leak, not a missing DOM element. The grid container is `display: none` but the chips themselves remain visible, which is contradictory state. Likely a CSS cascade issue where chips have visibility forced by a conflicting rule.

---

## Promotion Path

```
GREEN (no action needed):
  1. mobile-idle         -> promote to qa:contract:mobile-critical next
  2. map-trail           -> promote to qa:contract:mobile-critical next
  3. focus-pocket        -> promote to qa:contract:mobile-critical next
  4. field-node          -> promote to qa:contract:mobile-critical next
  5. compass-rail        -> promote to qa:contract:mobile-critical next
  6. info-panel-empty    -> promote to qa:contract:mobile-critical next
  7. loading-overlay     -> promote to qa:contract:mobile-critical next

NEEDS FIX (real UI bugs):
  8. launch-focus         -> fix dive button touch target -> then promote
  9. search-error         -> fix retry/dismiss touch targets + compass clip + share toggle -> then promote
 10. mode-grid            -> fix mode-chips visibility leak -> then promote
```

**Priority order for next promotion cycle:** field-node, compass-rail, loading-overlay, info-panel-empty (all have 10+ passing assertions and are clearly stable).

---

## Risks and Unresolved Issues

1. **Error-state touch targets (search-error):** Both `retry-button` and `dismiss-button` are below 44px. This is a systematic failure - error recovery buttons need at least 44px height on mobile. Likely a CSS height constraint on `.error-action-btn` or similar.

2. **Compass title clipping (search-error):** The search compass title is being clipped in the error state. This may indicate the compass container is being resized incorrectly when the error overlay is present, or the title has a fixed-width constraint that doesn't adapt.

3. **Share toggle visibility leak (search-error):** The share toggle is visible and overlapping the mobile search drawer in error state. This suggests a z-index or visibility rule that should be suppressed when the search drawer is active is not being applied in the error surface.

4. **Mode chips visibility (mode-grid):** `display: none` on the grid container but `visibility: true` on individual chips indicates a CSS cascade conflict. Chips may have an explicit `visibility: visible` rule overriding the parent's display state. Check for chip-specific visibility overrides in the `css/mobile_premium__*.css` split (likely `state.css` or `chrome.css`) or inline styles.

5. **Dive button touch target (launch-focus):** The dive button on the launch-focus surface is below 44px. This may be a deliberate small-design button (entry point into semantic dive) or an oversight. If deliberate, the contract assertion may need a waiver; if oversight, needs CSS padding/height fix.

6. **Server requirement:** These tests require a local HTTP server (`python -m http.server 8795`). If the server is down during CI, all surface contracts fail. Consider whether the test harness can fall back to `file://` protocol for local development.

---

## Files Referenced

- `tests/surface-contract-check.mjs` - test harness
- `tmp/surface-contract-check/2026-05-19T05-14-20-671Z/` - raw JSON artifacts
- `css/mobile_premium__*.css` (state/chrome) - likely location of mode-grid visibility conflict
- `css/mobile_premium__*.css` (focus-dive/surfaces) - likely location of touch target / clipping issues
- `vector-explorer-polished.html` - target page

---

## Next Steps

1. **Promote green surfaces** to `qa:contract:mobile-critical` in package.json scripts
2. **Fix and retest** launch-focus, search-error, mode-grid before next promotion
3. **Visual review** for the 6 failing checks - confirm CSS-level root cause before patching
4. **Update `docs/semantic-demo-qa-scripts.md`** to reflect the updated surface coverage map

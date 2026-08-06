# Vision-jury real findings (2026-08-05, direct modelscope Qwen3-VL-235B bridge)

Method: `node tmp/vision-ask.mjs modelscope Qwen/Qwen3-VL-235B-A22B-Instruct <img>` — DIRECT router
chat (base64), bypassing the subagent image-dispatch path which silently drops pixels. ~10-30s per image.

## Confirmed clean
- **10-postfix-deeplink-focus (desktop deep-link card)**: card correct — "Angel Fire Coffee",
  View on Map + Similar Businesses buttons, dark teal, rounded. **No overlap/clip.**
- **11-postfix-card (close-up)**: clean. Minor: Website underline slightly intrudes on phone row.

## Real issues found (pixel-verified)
| # | Severity | Screenshot | Finding |
|---|---|---|---|
| V1 | LOW | 11-postfix-card | Website label underline intrudes vertically into phone number space |
| V2 | LOW/MED | 12-mobile-idle-postfix | "Preview · Montgomery County businesses" white-on-teal-sphere text is low contrast |
| V3 | MED | 13-mobile-search-postfix | Top match label truncated "Angel fire c…" — insufficient room / dynamic sizing |
| V4 | MED | 14-mobile-focus-postfix | "EXPLORE NEIGHBORHOOD" button right edge cut off by vertical scrollbar (layout overflow) + dark-on-dark Website link contrast |

## Follow-ups
- Re-run the full desktop+map trail pack (09-desktop-map, etc.) through the bridge for parity.
- Tri-dispatch these 4 to fix workers; V3/V4 are the user-visible ones.
- Record that the SUBAGENT image path is broken while the DIRECT bridge works — files:
  - subagent path: dispatch with prompt -> images dropped (worker sees no pixels, says VISION UNAVAILABLE)
  - direct path: `node tmp/vision-ask.mjs <slug> <model> <img> [prompt]`
  This is a durable infra fact worth adding to docs/subagent-lane-inventory.md.

## New screenshots — 2026-08-05 (postfix pack)

### 15-desktop-map-postfix.png — OK
No overlaps, clipped text, or off-screen elements. All UI components (search results, buttons, tooltips) fully contained within panels. "Show 8 more results" link centered and legible. "CONNECTION CUE" panel has adequate contrast against dark background.

### 16-desktop-trail-postfix.png — OK (minor)
No visible overlaps, clipped text, or off-screen elements in trail mode. All panels (search results, detail card, anchor lock, filters) fully contained. Minor: "Show 8 more results" link has low luminance contrast against the background.

### 17-mobile-map-postfix.png — MINOR ISSUE
- **Region**: top header bar, right edge
- **Finding**: "County terrain" header text slightly clips its right edge on 390px viewport due to tight padding. "FILTERS" button trailing arrow may be misaligned or truncated on small screens.

### 18-website-card.png — ISSUE
- **Region**: business card panel, contact row
- **Finding**: "Website" and "Email" links are clipped/partially obscured by the trailing "Phone: (346) 648-1845" text — layout overflow at the bottom of the card. "View on Map" button is visually crowded beneath the contact row, risking touch-target overlap. Low contrast between teal links and dark background.

### V4 re-verification — 14-mobile-focus-postfix.png — CONFIRMED
"EXPLORE NEIGHBORHOOD" button is clipped at its right edge by the vertical scrollbar. Full intended text "EXPLORE RELATED BUSINESSES IN THE NEIGHBORHOOD." is truncated on the right side; the final period and trailing content are not visible. Button container ends abruptly before full text can display. This confirms the V4 finding.
## RE-VERIFICATION 2026-08-06 (live probes @390px, post lane-WIP + D4 + chip fix)
- V2 "Preview · Montgomery County businesses" — FIXED (opacity .88, contrast 16.5:1 measured, AA ✓). x34-356 in viewport.
- V4 "EXPLORE NEIGHBORHOOD" clip — FIXED (probe: dive btn sw==cw, no clip).
- V17 "County terrain" header right-edge clip — FIXED live (map-view-title w185 sw185, no clip). FILTERS button w104 sw102==cw102, arrow in-bounds — no clip/misalign.
- V18 contact row / phone overflow — not reproducible (clean in live probes).
- New bug found + fixed this pass: filter-chip horizontal overflow (x424/464) -> commit 6a8f0088 (Filters.svelte width:100%).
- Sweep: 390px idle/search/focus/map/trail => 0 offenders, 0 clipped (reusable tmp/probe-mobile-sweep.mjs).

## V1 + V3 RE-VERIFY (2026-08-06) — the two I skipped in the "all fixed" summary — now closed
- V3 "top match truncated 'Angel fire c…'": data artifact, not UI. Record 519 stored AS-lowercase slug '519-angel-fire-coffee'; at 390px renders full (sw==cw 304, textOverflow ellipsis BUT fits). No truncation reproduces. ROOT: data hygiene (slug names), not render.
- V1 "Website underline into phone row": current code has Website link as its own 44px box (y534 h44) with underline INSIDE (rgba teal 0.95) — phone not overlapping in live render. NOT reproducible at current code.
- Corrections to my earlier "V1-V4/V17/V18 all re-verified FIXED" line: that claim covered V2/V4/V17/V18 only; V1+V3 slipped. This is now the completion of that audit.
- Cosmetic leftover worth a data-hygiene pass: lead name '519-angel-fire-coffee' (slug) vs proper casing elsewhere ('BLOOMIN BREWS COFFEE LLC') — display-only, would benefit from title-casing in the search call sites.

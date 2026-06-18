# Layout Contracts

Status: active
Updated: 2026-06-14

## Purpose

Defines spatial ownership rules for UI regions to prevent surface collisions. Each contract specifies which surfaces own a region, their stacking order, and visibility rules per state.

---

## Bottom-Left Region Contract (UI-2)

### Problem

In focus mode, three surfaces collided in the bottom-left quadrant:
- `#legend-panel` at (16, 451) 200×433
- Focus-pocket area (left side, full height)
- Trail controls / JourneyChrome elements

### Resolution

**Option A: Legend auto-hides in focus mode**

When `data-panel-surface` is `focus`, `focus-search`, or `semantic-dive`, the Legend panel is hidden. The Legend is a category reference not needed during focused business exploration.

### Ownership Rules

| State | Owner | Position | Notes |
|---|---|---|---|
| `idle` | Legend panel | bottom-left (16, 451) | Full category list visible |
| `search` | Legend panel | bottom-left (16, 451) | Full category list visible |
| `focus` | **Hidden** | — | Legend hidden; focus-pocket + focus-stage-card own left/right |
| `focus-search` | **Hidden** | — | Legend hidden; focus-pocket + focus-stage-card own left/right |
| `semantic-dive` | **Hidden** | — | Legend hidden; focus-pocket + focus-stage-card own left/right |
| `map-*` | Legend panel | bottom-right (mobile) | Repositioned for map view (UI-6 pattern) |

### Desktop Layout (≥769px)

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌──────────────┐                          ┌──────────────┐ │
│  │              │                          │              │ │
│  │ Focus Pocket │    3D Canvas             │ Focus Card   │ │
│  │ (left side)  │                          │ (right side) │ │
│  │              │                          │              │ │
│  └──────────────┘                          └──────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

- Focus-pocket: left side, full height
- Focus-card: right side, `top: 96px; right: 16px; bottom: 14px`
- Legend: **hidden** in focus mode

### Mobile Layout (≤768px)

```
┌─────────────────┐
│  Compass        │
│                 │
│  3D Canvas      │
│                 │
│ ┌─────────────┐ │
│ │ Focus Card  │ │
│ │ (bottom     │ │
│ │  sheet)     │ │
│ └─────────────┘ │
└─────────────────┘
```

- Focus-card: bottom sheet, `bottom: 0; left: 10px; right: 10px`
- Legend: **hidden** in focus mode

### CSS Implementation

Desktop (in `css/modules/focus_stage.css`):
```css
    body:is([data-panel-surface='focus'], [data-panel-surface='focus-search'], [data-panel-surface='semantic-dive'])
        #legend-panel {
        display: none;
        visibility: hidden;
        pointer-events: none;
    }
```

Mobile (in `css/mobile_premium__focus-dive.css`):
```css
    body:is([data-panel-surface='focus'], [data-panel-surface='focus-search'], [data-panel-surface='semantic-dive'])
        #legend-panel {
        display: none;
        visibility: hidden;
        pointer-events: none;
    }
```

### Verification

- Desktop (1440×900): Legend hidden in focus mode, no bottom-left collision
- Mobile (390×844): Legend hidden in focus mode, focus-stage-card bottom sheet clean
- Idle state: Legend visible at bottom-left (no regression)

---

## Related Contracts

- **UI-6**: Legend/InfoPanel collision in map view — resolved by repositioning Legend to bottom-right (commit `7f01df5`)
- **Mobile State Ownership**: See `docs/semantic-demo-mobile-state-ownership.md` for `data-panel-surface` ownership matrix

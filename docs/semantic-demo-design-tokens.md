# Semantic Demo Design Tokens

Date: 2026-06-03

This is the human-readable token sheet for the Semantic Explorer demo. The canonical implementation source is `css/base.css`; this document names the system, explains intended use, and records design policy that should not have to be rediscovered in CSS.

## Source Of Truth

- `css/base.css` owns the root token values.
- `js/modules/design-tokens.js` owns JS/WebGL mirrors such as scene fog, thread tint, corridor shader colors, and the legacy cluster palette.
- `semantic-demo.css` is only an import shell. Do not treat it as selector or token authority.
- Surface ownership remains documented in `docs/semantic-demo-css-authority-map.md`.
- Visual acceptance criteria remain documented in `docs/semantic-demo-ui-quality-rubric.md`.

When a token value changes, update `css/base.css` first and update this sheet in the same change if the design meaning changes.

Do not inject CSS custom properties from JavaScript. CSS root tokens stay in `css/base.css`; JS tokens should preserve existing runtime values unless a visual change is intentional and verified.

## Color

| Token | Value | Use |
|---|---:|---|
| `--color-primary` | `#52e5d7` | Primary cyan accent, active borders, focus states, glow accents |
| `--color-primary-rgb` | `82, 229, 215` | Alpha-mixed primary effects |
| `--color-primary-soft` | `rgba(82, 229, 215, 0.2)` | Soft primary fills |
| `--color-primary-ring` | `rgba(82, 229, 215, 0.8)` | Focus rings and high-confidence active outlines |
| `--color-primary-tint` | `#79ebde` | Lighter primary tint for elevated accents and softened highlights |
| `--color-primary-tint-rgb` | `121, 235, 222` | Alpha-mixed lighter primary effects |
| `--color-primary-tint-soft` | `rgba(121, 235, 222, 0.2)` | Soft lighter-primary fills |
| `--color-primary-alt` | `#4ecdc4` | Alternate primary cyan used by legacy accent surfaces |
| `--color-primary-alt-rgb` | `78, 205, 196` | Alpha-mixed alternate primary effects |
| `--color-accent` | `#ffdf4c` | Secondary yellow accent, sparingly used |
| `--color-accent-rgb` | `255, 223, 76` | Alpha-mixed accent effects |
| `--color-accent-soft` | `rgba(255, 223, 76, 0.1)` | Low-strength accent fills |
| `--color-accent-border` | `rgba(255, 223, 76, 0.22)` | Low-strength accent borders |
| `--color-surface-glass` | `rgba(15, 18, 28, 0.88)` | Glass surface fallback |
| `--color-surface-panel` | `rgba(12, 17, 26, 0.93)` | Opaque panel fallback |
| `--color-border-subtle` | `rgba(255, 255, 255, 0.08)` | Low-contrast borders |
| `--color-border-muted` | `rgba(255, 255, 255, 0.1)` | Standard muted borders |
| `--color-text-strong` | `rgba(255, 255, 255, 0.98)` | Highest-emphasis copy |
| `--color-text-primary` | `rgba(255, 255, 255, 0.94)` | Primary body and labels |
| `--color-text-secondary` | `rgba(255, 255, 255, 0.78)` | Secondary copy |
| `--color-text-muted` | `rgba(255, 255, 255, 0.58)` | Captions, metadata, disabled-adjacent copy |
| `--status-success` | `#8ff7d0` | Semantic lane success / healthy state |
| `--status-warning` | `#ffd66b` | Semantic lane degraded / warning state |
| `--status-danger` | `#ff6b6b` | Semantic lane failure / error state |
| `--status-info` | `#bae6fd` | Semantic lane info / neutral update |

Policy: avoid one-note color expansion. New UI should not become only cyan-on-slate; use the accent, neutral contrast, hierarchy, and spacing before adding more glow.

## Glass And Elevation

| Token | Value | Use |
|---|---:|---|
| `--glass-bg` | `linear-gradient(165deg, rgba(8, 18, 30, 0.72) 0%, rgba(3, 7, 12, 0.88) 100%)` | Standard glass panel background |
| `--glass-bg-deep` | `linear-gradient(180deg, rgba(6, 13, 20, 0.90) 0%, rgba(2, 5, 8, 0.96) 100%)` | Denser panels and overlays |
| `--glass-bg-accent` | `radial-gradient(circle at 100% 0%, rgba(82, 229, 215, 0.20), transparent 60%)` | Local accent wash |
| `--panel-glass-bg` | `var(--glass-bg)` | Shared panel glass alias |
| `--panel-glass-border` | `rgba(255, 255, 255, 0.14)` | Shared panel border color alias |
| `--glass-border` | `1px solid rgba(255, 255, 255, 0.075)` | Standard glass border |
| `--glass-border-glow` | `1px solid rgba(82, 229, 215, 0.35)` | Active or high-emphasis border |
| `--glass-border-muted` | `1px solid rgba(255, 255, 255, 0.04)` | Quiet separators |
| `--glass-reflection` | `rgba(255, 255, 255, 0.08)` | Standard inset glass highlight |
| `--glass-reflection-soft` | `rgba(255, 255, 255, 0.04)` | Soft inset glass highlight |
| `--glass-reflection-strong` | `rgba(255, 255, 255, 0.12)` | Strong inset glass highlight |
| `--glass-reflection-muted` | `rgba(255, 255, 255, 0.05)` | Muted glass highlight and border support |
| `--glass-reflection-fade` | `rgba(255, 255, 255, 0.03)` | Faintest glass highlight; for quiet separators and dim borders |
| `--glass-reflection-glow` | `rgba(255, 255, 255, 0.15)` | Brightest glass highlight; for active hover/elevated borders |
| `--glass-blur-light` | `10px` | Light backdrop blur |
| `--glass-blur` / `--glass-blur-medium` | `20px` | Standard backdrop blur |
| `--glass-blur-heavy` | `28px` | Heavy backdrop blur |
| `--glass-blur-ultra` | `44px` | Modal or high-isolation blur |
| `--shadow-umbra` | `rgba(0, 0, 0, 0.54)` | Deepest shared shadow layer |
| `--shadow-penumbra` | `rgba(0, 0, 0, 0.24)` | Middle shared shadow layer |
| `--shadow-antumbra` | `rgba(0, 0, 0, 0.12)` | Soft outer shared shadow layer |
| `--shadow-glass` | `0 24px 64px rgba(0, 0, 0, 0.54), inset 0 1px 0 rgba(255, 255, 255, 0.08)` | Standard panel elevation |
| `--shadow-glass-glow` | `0 16px 48px rgba(82, 229, 215, 0.20), 0 0 24px rgba(82, 229, 215, 0.08)` | Active glass glow |
| `--shadow-premium-glow` | `0 20px 56px rgba(82, 229, 215, 0.25), 0 0 30px rgba(82, 229, 215, 0.12)` | Strong feature glow |
| `--shadow-card` | `0 12px 40px rgba(0, 0, 0, 0.32)` | Card-level elevation |
| `--shadow-panel` | `var(--shadow-glass)` | Panel-level elevation alias |
| `--shadow-focus-ring` | `0 0 0 3px rgba(82, 229, 215, 0.38)` | Focus ring halo |

Policy: app chrome should feel like deliberate product chrome, not stacked demo cards. Do not place cards inside cards unless the inner card is a repeated item or modal content.

## Radius

| Token | Value | Use |
|---|---:|---|
| `--glass-radius-panel` | `18px` | Large glass panels |
| `--glass-radius-card` | `14px` | Cards and compact panels |
| `--glass-radius-action` | `10px` | Buttons, inputs, action chips |
| `--glass-radius-pill` | `999px` | Pills and circular controls |
| `--radius-tight` | `8px` | Tight UI elements |
| `--radius-normal` | `12px` | Standard controls |
| `--radius-card` | `16px` | Card fallback |
| `--radius-large` | `20px` | Large fallback radius |
| `--radius-pill` | `999px` | Pill fallback |

Policy: use the smallest radius that fits the surface. Repeated cards and compact controls should not drift into oversized rounded rectangles.

Note: `--glass-radius-card` and `--radius-card` are separate today. Prefer the `--glass-*` radius tokens for glass-system chrome; use the generic `--radius-*` tokens only where the existing component family already does so.

## Type

| Token | Value | Use |
|---|---:|---|
| `--font-display` | `'Bricolage Grotesque', sans-serif` | Titles and expressive labels |
| `--font-body` | `'Nunito Sans', sans-serif` | Body copy and general UI |
| `--font-mono` | `'JetBrains Mono', 'Space Mono', monospace` | Codes, metrics, compact technical labels |
| `--mobile-type-title` | `18px` | Mobile surface titles |
| `--mobile-type-heading` | `16px` | Mobile section headings |
| `--mobile-type-body` | `13px` | Mobile body text |
| `--mobile-type-caption` | `11px` | Mobile captions |
| `--mobile-type-kicker` | `9px` | Mobile micro labels |
| `--mobile-type-action` | `10px` | Mobile action labels |
| `--line-tight` / `--mobile-line-tight` | `1.15` / `1.12` | Dense labels and titles |
| `--line-normal` / `--mobile-line-normal` | `1.40` / `1.35` | Body copy |
| `--line-relaxed` / `--mobile-line-relaxed` | `1.58` / `1.5` | Longer explanatory copy |

Policy: do not scale font size with viewport width. Keep letter spacing at `0` unless a legacy rule requires review.

## Spacing

| Token | Value | Use |
|---|---:|---|
| `--space-1` | `4px` | Micro gaps |
| `--space-2` | `8px` | Tight gaps and compact padding |
| `--space-3` | `12px` | Standard compact padding |
| `--space-4` | `16px` | Standard surface padding |
| `--space-5` | `20px` | Larger surface padding |
| `--space-6` | `24px` | Section spacing |

Policy: exterior gutters must be intentional. Bottom sheets and docked panels should anchor to their viewport edge; breathing room belongs inside the panel as padding.

## Mobile Touch

| Token | Value | Use |
|---|---:|---|
| `--mobile-touch-min` | `44px` | Minimum mobile interactive target |
| `--mobile-touch-preferred` | `48px` | Preferred mobile target |
| `--mobile-radius-card` | `var(--glass-radius-panel)` | Mobile card radius |
| `--mobile-radius-button` | `var(--glass-radius-action)` | Mobile button radius |
| `--mobile-radius-input` | `var(--glass-radius-action)` | Mobile input radius |
| `--mobile-radius-pill` | `var(--glass-radius-pill)` | Mobile pill radius |

Policy: mobile interactive targets should be at least `44px` in both dimensions unless intentionally hidden or pointer-disabled.

## Motion

| Token | Value | Use |
|---|---:|---|
| `--transition-premium` | explicit opacity/transform/background/border/shadow/color transitions at `0.4s cubic-bezier(0.16, 1, 0.3, 1)` | Standard polished UI transitions |
| `--transition-premium-fast` | explicit opacity/transform/background/border/shadow/color transitions at `0.25s cubic-bezier(0.16, 1, 0.3, 1)` | Faster polished UI transitions |
| `--transition-spring` | `all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)` | Spring-like emphasis transitions |

Policy: motion should clarify state change and respect reduced-motion preferences. When judging motion, use video evidence rather than still screenshots alone.

## Layout And Safe Area

| Token | Value | Use |
|---|---:|---|
| `--bp-landscape` | `(max-width: 900px) and (max-height: 430px) and (orientation: landscape)` | Canonical short-landscape breakpoint reference |
| `--bp-landscape-tall` | `(max-width: 900px) and (max-height: 480px) and (orientation: landscape)` | Taller short-landscape breakpoint reference |
| `--bp-landscape-compact` | `(max-width: 900px) and (max-height: 420px) and (orientation: landscape)` | Compact short-landscape breakpoint reference |
| `--bp-landscape-tablet` | `(min-width: 769px) and (max-width: 900px) and (max-height: 430px) and (orientation: landscape)` | Tablet-width short-landscape breakpoint reference |
| `--landscape-info-panel-idle-max-height` | `min(calc(100vh - 86px), 178px)` | Short-landscape idle info panel |
| `--landscape-info-content-idle-max-height` | `calc(var(--landscape-info-panel-idle-max-height) - 42px)` | Short-landscape idle info content |
| `--landscape-search-panel-height` | `min(calc(100vh - 82px), 308px)` | Short-landscape search panel |
| `--landscape-search-results-max-height` | `min(250px, calc(100dvh - 390px))` | Short-landscape search results |
| `--landscape-weather-widget-height` | `62px` | Short-landscape weather widget |
| `--landscape-focus-stage-card-max-height` | `min(72vh, 282px)` | Short-landscape focus card |
| `--top-chrome-mobile` | `82px` | Mobile top chrome vertical offset |
| `--compass-top` | `78px` | Default mobile journey compass top position |
| `--view-toggle-right-mobile` | `108px` | Mobile view-toggle right offset near top chrome |
| `--z-canvas` | `0` | Canvas scene layer (baseline for 3D content) |
| `--z-underlay` | `-1` | Decorative or scene-adjacent content below base UI |
| `--z-base` | `1` | Base UI layer |
| `--z-base-raised` | `2` | Raised base UI layer |
| `--z-content` | `5` | Primary content above the base layer |
| `--z-field-nodes` | `10` | Canvas field node overlay layer |
| `--z-chrome` | `10` | Standard app chrome |
| `--z-chrome-raised` | `11` | Raised chrome controls |
| `--z-chrome-overlay` | `12` | Chrome overlay above raised chrome |
| `--z-chrome-elevated` | `14` | Elevated chrome controls |
| `--z-chrome-popover` | `20` | Chrome popover layer (menus, flyouts) |
| `--z-panels` | `50` | Standard panel layer |
| `--z-panels-elevated` | `90` | Raised or transient panel layer |
| `--z-overlay` | `100` | Overlay stacking baseline |
| `--z-overlay-raised` | `101` | Raised overlay layer |
| `--z-overlay-floating` | `102` | Floating overlay above raised overlays |
| `--z-overlay-elevated` | `150` | Elevated overlay layer |
| `--z-tooltips` | `200` | Tooltip layer above overlays |
| `--z-modal` | `400` | Modal stacking baseline |
| `--z-blocker-backdrop` | `900` | Blocker backdrop layer |
| `--z-blocker` | `1000` | Blocking interaction shield |
| `--z-toast` | `1200` | Toast and urgent feedback layer |
| `--z-toast-above` | `1300` | Toast layer above standard toasts |
| `--z-max` | `9999` | Last-resort diagnostic or emergency layer |

Policy: docked bottom panel shells should be flush to the viewport bottom. Safe-area comfort should be handled with internal padding or content insets, not by detaching the shell with an exterior bottom gutter.

Note: CSS custom properties cannot be used directly inside `@media` rules. The `--bp-*` tokens document canonical breakpoint values; matching `@media` rules must be updated in CSS at the same time.

## CSS Governance

- Avoid `!important`. Treat it as unresolved specificity debt unless explicitly approved and documented.
- Prefer token reuse over local magic numbers when the value represents color, type, radius, spacing, blur, elevation, touch size, motion, or stacking.
- Keep selector ownership aligned with `docs/semantic-demo-css-authority-map.md`.
- For mobile final overrides, keep selectors scoped to mobile and state attributes, and verify desktop is untouched.
- For user-visible visual changes, save screenshot, DOM, or layout evidence under `tmp/` and run the relevant surface contract.

## Minimum Verification

For token-only or doc-only changes:

- `git diff --check -- docs/semantic-demo-design-tokens.md`

For CSS token value changes:

- `npm run check:cache`
- `npm run check:ownership`
- Relevant `qa:contract:*` surface checks
- Relevant visual QA screenshots or reels when the change affects layout, motion, or composition

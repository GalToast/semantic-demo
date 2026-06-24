# Svelte CSS Pruning Quirk — Dynamic `class:` Directives

**Date:** 2026-06-23
**Discovered in:** `src/components/Header.svelte` mode-chip locking
(commit `81d65978`)

## The Quirk

Svelte's CSS analyzer does not track dynamic `class:foo={...}`
directives when pruning "unused" selectors. The class is correctly
applied at runtime, but selectors that target it may be stripped
from the compiled stylesheet. The compiler's
"Unused CSS selector" warning fires for `.foo` in source CSS but
does not catch this case.

**Symptom:** class is in the DOM at runtime (visible in devtools),
but the corresponding CSS rule is missing from `document.styleSheets`
and `getComputedStyle` shows default values. No compile-time warning
explains why.

## Fix

Wrap the dynamic-class half of a comma-separated selector in
`:global()` to bypass Svelte's pruning:

```css
/* Svelte strips the .is-locked half — class is "unused" per static analysis */
.mode-chip.active .chip-label,
.mode-chip.is-locked .chip-label {
    display: inline;
}

/* Works — :global() bypasses pruning for the dynamic-class selector */
.mode-chip.active .chip-label,
:global(.mode-chip.is-locked .chip-label) {
    display: inline;
}
```

The `.active` half (backed by a literal `class:active={...}` directive
that the analyzer can detect) compiles fine. The `.is-locked` half
(added at runtime via the same `class:is-locked={...}` directive shape)
needs `:global()` to survive compilation.

The same pattern works for any rule whose selector targets a class
that is applied dynamically rather than literally.

## When to Reach For This

- A class is added via `class:foo={...}` directive (not literal
  `class="foo"` in the template)
- The corresponding CSS rule shows up as "unused" per Svelte's analyzer
- The class IS in the DOM at runtime but styling never fires

## Reference Implementation

`src/components/Header.svelte:469-485` — the chip-locking mobile label
rule. The comment block above the rule explains the `:global()`
workaround so the next maintainer does not "clean it up" thinking it
is accidental.

## Why Not Just `:global()` Everything

Tempting to wrap every dynamic-class selector in `:global()`. Don't —
`:global()` skips Svelte's CSS scoping, which means the rule will leak
into other components that happen to use the same class name. Use
`:global()` only on the dynamic half of a comma-separated selector
where the scoping would otherwise prune it.

## Historical Note: W46-D4 → W46-D4 Polish → Option F

The original W46-D4 chip-locking feature shipped with the `:global()`
workaround applied to the mobile `.mode-chip.is-locked .chip-label`
rule (so locked chips would show their labels alongside the icon on
narrow viewports). The fix in commit `81d65978` made the labels fire
at runtime, but added ~120px to the chip row, pushing Map off-screen
on a 390px viewport.

The follow-up "Option F" polish (commit pending) replaced that
workaround by removing the `.is-locked` half of the mobile selector
entirely. Locked chips now show **icon-only on mobile**, with the
mode description surfaced through the enriched `title` attribute on
long-press. The `:global()` workaround is no longer needed for
Header.svelte — the rules it protected have been simplified away.

The workaround remains valid and useful in general: any future dynamic
class that needs scoped CSS targeting can hit the same pruning
limitation. Don't remove this doc when the Header.svelte case is
cleaned up — it's a reference for the next time you add
`class:foo={...}` and find the corresponding `.foo` rule stripped.

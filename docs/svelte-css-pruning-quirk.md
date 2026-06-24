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

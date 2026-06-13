# Cached Legacy Unit Suite

This directory preserves the pre-Svelte Vitest unit suite as reference material.
The files are intentionally not deleted, but many target retired `js/modules/*`
owners or legacy behavior and are not part of the active unit gate.

Use `npm run test:unit:legacy` when intentionally mining or revalidating these
old assertions. Convert useful assertions into `tests/unit-active/` before
making them part of the normal `npm run test:unit` signal.

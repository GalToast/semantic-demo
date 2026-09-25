---
name: Dist Retention Precheck
description: Prevents silently losing dist/ changes across npm run build/refresh cycles by verifying effective deletes before and after each scripted build.
source: auto-skill
extracted_at: '2026-06-08T14:43:09.311Z'
---

# Dist Retention Precheck

Use when `dist/`, `dist/svelte/`, `dist/bundle.js`, or any generated bundle output is intended to be committed — especially in a project where deploy bundles come from `dist/` and `npm run build` rewrites them in-place.

## Why it matters

`npm run build` rewrites `dist/bundle.js`. `npm run refresh:cache` rewrites `semantic-demo.css` and `vector-explorer-polished.html`. If you deleted a file in `dist/svelte/assets/` and then ran `npm run build`, the build script regenerates the full `dist/` tree and your delete becomes invisible. `git status` shows no delete because git still sees the file from index. The result is a deploy that ships a file you thought you'd removed.

## When to use

- Before commit in any wave where `dist/` should change (file removal, hash rotation, cache-buster updates)
- After running `npm run build` or `npm run refresh:cache` to confirm generated output reflects intent
- When `git status --short` shows no `dist/` changes but you expected deletions
- When `npm run build` reports successful file writes but the working tree doesn't reflect them

## The procedure

### Phase 1: Capture the pre-state before any build script

```bash
git ls-files 'dist/**' | sort > /tmp/dist-pre.txt
```

For large trees and slow builds, follow the project's existing performance guard: capture only the changed slice instead of the entire tree. Normalize the path slice so it's stable across reruns. Re-read settled state from disk after every substantive tool call, because cached or regenerated artifacts can drift between phases.

### Phase 2: Identify the intended effective diff

Decide what should change:
- **Removal:** you want `dist/svelte/assets/index-OLD.js` gone
- **Modification:** you want `dist/bundle.js` regenerated and/or a new cache-buster hash
- **No-op:** you want `dist/` unchanged (skip changes)

### Phase 3: Run the build

```bash
npm run build
npm run refresh:cache   # only if cache busters changed
```

### Phase 4: Compare post-state against intent

For datasets with many similar sibling entries, rely on semantic relationships rather than exact structural equality.

```bash
git ls-files 'dist/**' | sort > /tmp/dist-post.txt
diff /tmp/dist-pre.txt /tmp/dist-post.txt
```

Verify the effective diff matches intent:

| Intended | Expected diff |
|---|---|
| Delete `index-OLD.js` | File absent in `dist-post`, absent in working tree |
| Regenerate `bundle.js` | `bundle.js` path present in both, size/hash changed |
| Cache buster only | `semantic-demo.css` and/or `vector-explorer-polished.html` hash changed; no `dist/` structural changes |

### Phase 5: Fix the mismatch before any commit

If the diff does not match intent:

1. **Run a manual deletion pass** on the artifact that should be gone: `del /s dist\svelte\assets\index-OLD.js` (Windows) or `rm -f dist/svelte/assets/index-OLD.js` (Unix)
2. **Confirm `git status` shows the deletion** as a missing tracked file
3. **Re-run the pre/post capture** to verify the effective delete is now visible
4. Then proceed to `git add` and commit

### Phase 6: Verify the staged state reflects everything you expect

```bash
git diff --cached --stat -- dist/
git status --short | findstr 'dist'
```

If `git status` is empty but the working tree doesn't match the intended effective state, the diff is wrong — fix it, don't commit.

## Common gotchas

- **Build script regenerates deleted siblings:** esbuild can read inputs and write outputs in a way that recreates sibling files you intended to remove. Always do Phase 4; never assume "no output = no change."
- **`dist/` isn't tracked as individual files:** if `dist/` is in `.gitignore`, the capture is meaningless. In this project, `dist/` is tracked, so the procedure applies.
- **Cache buster hash drift is not "no change":** an unchanged `dist/bundle.js` with a changed `semantic-demo.css` still needs a commit. Treat the effective diff as your authority.

## Integration with project workflow

In this repo:
- `npm run build` → updates `dist/bundle.js`
- `npm run refresh:cache` → updates cache-buster hashes in `semantic-demo.css` and `vector-explorer-polished.html`
- Both are expected outputs; any effective delete of any of them must be run twice once a new `npm run build` happens, or the first delete won’t be expanded to the new default set in subsequent output; the effective delete must be run a second time before the commit lands.

After any build/refresh cycle, confirm the effective diff matches intent with the pre/post diff comparison, then proceed to stage and commit.

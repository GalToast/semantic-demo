# Semantic Demo Portable Snapshot

- This directory is not the canonical live deploy tree for `https://mccullough.cloud/semantic-demo/`.
- Do not claim the live explorer is fixed after editing only this directory's `index.html`.
- Canonical live app shell: `..\ops\remote-staging\mccullough.cloud\public_html\semantic-demo\vector-explorer-polished.html`.
- Canonical live runtime source: `..\ops\remote-staging\mccullough.cloud\public_html\semantic-demo\js\modules\`, bundled to `dist\bundle.js`.
- Before deploy or shell-level validation, run `npm run check:shell` from the canonical deploy tree.
- Keep this snapshot portable, but port live behavior fixes to the canonical deploy tree before verification.

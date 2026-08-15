# Deploy-time throughput verification (2026-08-15)

`.htaccess` (commit `bea7f839`) serves prebuilt Vite `.gz`/`.br` twins
(br preferred, gz fallback) with correct Content-Encoding + per-type MIME.
Confirm the host honors it once after the next deploy:

    curl -H 'Accept-Encoding: br' -I https://<host>/dist/svelte/assets/index-*.js
    # expect: Content-Encoding: br   (and HTTP 200; not 404/405)

Broken symptoms to watch: `Content-Encoding: identity` (twin not served —
host not Apache or rewrite disabled), 500s (double-encoding rule conflict).
Inert elsewhere by design (<IfModule guards). Removal is safe anytime; the
on-the-fly mod_deflate rules remain as fallback. Estimate: shell payload
~1,290KB raw -> ~340-420KB br on wire (the LCP-bound byte axis).

# qa:contract runner broken (2026-08-06, reproducible)
- Every invocation dies after "[runner] Starting surface: mobile-idle" with 0 further output:
  1) `node tests/surface-contract-check.mjs` (no loader) — hang/exit
  2) `node --loader ts-resolve-loader ... --url=8795` (hell fun) → Starting surface mobile-idle only
  3) PW_HEADLESS=1 SEMANTIC_FORCE_WEBGL_SOFTWARE=1 + --headless → same, 0 procs
- The runner is default-HEADED (headed = !cliArgs.includes('--headless') && env!=='1') which
  explains "windows pop up"; but headless also dies. Root: mobile-idle assertion/launch path
  wedges (WebGL gate + gate-dismiss querySelector at line ~294), dies silently with no
  summary (no try/catch at top level printing anything).
- Finding: the repo's OWN surface-contract QA gate does not complete in any configuration
  today. App is NOT implicated — the runner harness is broken (silent wedge).
- This means `npm run qa:contract` is not a trustworthy regression gate right now — treat
  its output as noise until fixed. (visual-state-audit.mjs: same family, likely same runner.)

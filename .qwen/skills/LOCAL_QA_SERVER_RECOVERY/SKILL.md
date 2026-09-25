---
name: LOCAL_QA_SERVER_RECOVERY
description: Restore local headed QA when the static dev server on 127.0.0.1:8795 returns empty replies or is owned by stale Python http.server processes.
source: auto-skill
extracted_at: '2026-06-09T19:22:00.000Z'
---

# Local QA Server Recovery

Use this when Playwright/surface-contract checks fail with `net::ERR_EMPTY_RESPONSE` from `http://127.0.0.1:8795/vector-explorer-polished.html`, or when dynamic contract runner ports are also affected by stale QA servers.

## 1. Verify the failure mode
- Confirm the issue is local only:
  - `curl -I --max-time 2 http://127.0.0.1:8795/vector-explorer-polished.html`
  - Empty reply / non-200 means the local QA path is broken, not the app.

## 2. Inspect port 8795
- Windows PowerShell:
  ```powershell
  Get-NetTCPConnection -LocalPort 8795 -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess,State
  ```
- If multiple `Listen` or `TimeWait` entries exist, assume stale servers are present.

## 3. Identify stale server processes
- List candidate processes:
  ```powershell
  Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'python\s+-m http.server 8795 --bind 127.0.0.1' } | Select-Object ProcessId,CommandLine
  ```
- If contract runners previously spawned their own servers, also inspect dynamic ports used by test harnesses such as `8797`:
  ```powershell
  Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'python\s+-m http.server 8797 --bind 127.0.0.1 --directory \.' } | Select-Object ProcessId,ParentProcessId,CommandLine
  ```
- Note PID(s) for termination.

## 4. Stop stale http.server processes safely
- With known PIDs:
  ```powershell
  taskkill /PID <pid> /F
  ```
- Or bulk from command-line match for current known QA ports:
  ```powershell
  Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'python\s+-m http\.server 8795 --bind 127\.0\.0\.1' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'python\s+-m http\.server 8797 --bind 127\.0\.0\.1 --directory \.' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  ```
- Verify the ports are clear again with step 2 and step 3 checks.

## 5. Start a clean server
- Preferred:
  ```bash
  npm run serve
  ```
- This starts `python -m http.server 8795 --bind 127.0.0.1` from the repo root.

## 6. Verify healthy response
- Recheck headers:
  ```bash
  curl -I --max-time 2 http://127.0.0.1:8795/vector-explorer-polished.html
  ```
- Expect `HTTP/1.0 200 OK` with correct `Content-Length`.

## 7. Rerun a focused surface check first
- Validate the server + surface plumbing before running the full suite:
  ```bash
  npm run qa:contract:search-chrome
  ```
- If that passes, rerun the full matrix:
  ```bash
  npm run qa:contract:all
  ```

## 8. Common follow-ups after recovery
- Timeouts in `launch-focus` / `controls` often mean app startup or view transitions haven't settled in time.
- Missing `.search-result` selectors during `launch-focus` usually indicate contract DOM alias drift against `.search-result-item`; verify the result item class and update the contract or query accordingly.
- Missing `.search-error-state` usually means the forced API error route isn't matching the active fetch path or the state isn't applying.
- Stop here before chasing app behavior until the local QA server baseline is green again.

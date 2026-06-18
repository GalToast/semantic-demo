# Bash Tool Design Review — 2026-06-12

**Scope:** Design review for patching the `pi-coding-agent` bash tool to handle PowerShell's `$_` auto-variable eating on Windows. The patch lives in `C:\Users\HP\AppData\Roaming\npm\node_modules\@earendil-works\pi-coding-agent\dist\core\tools\bash.js`. Borrow-only reference: the opencode fork at `C:\Users\HP\repos\opencode\packages\opencode\src\tool\bash.ts` (NOT to be patched).

**Bug recap:** PowerShell's `-Command` mode re-parses the command string. In some contexts (e.g., `try { 1/0 } catch { Write-Host ('caught: ' + $_.Exception.Message) }`), the `$_` auto-variable gets eaten by the re-parse, producing a parser error like `Missing ')' in method call`. Workaround for the model: wrap `$_` in single quotes (`'$_'`) or assign to a named variable first (`$err = $_; $err.Exception.Message`). This is correct PowerShell behavior, not a bash tool bug — but it's a constant friction the tool can fix by bypassing `-Command` mode.

---

## 1. Prior Art

**Cursor IDE forum (Feb 2026) — direct precedent for the temp-file pattern.**
Cursor's agent shell in v2.4.37 was broken because their *wrapper script* (a temp `.ps1` file in `%TEMP%` named `ps-script-<guid>.ps1`) had a parser error in the wrapper itself, not the user code. Their fix was to roll back to "Legacy Terminal Tool" which uses a simpler wrapper. **The lesson: keep the wrapper minimal.** Don't try to be clever with env var processing, command-prefix injection, or transform logic in the wrapper. Just write the user command verbatim and run it. (Forum: https://forum.cursor.com/t/agent-shell-broken-after-update-powershell-wrapper-script-parsing-error/151887)

**abdus.dev — canonical Node.js → PowerShell pattern.**
`spawn('powershell', ['-executionpolicy', 'unrestricted', '-file', 'script.ps1'])` is the standard pattern for running PowerShell scripts from Node. We use `pwsh.exe` (PowerShell 7) instead of `powershell` (5.1), and skip `-executionpolicy` (modern PS doesn't need it). Source: https://abdus.dev/posts/running-powershell-script-in-node

**Project durable memory (2026-06-11 audit-fix campaign).**
> "When a worker prompt includes PowerShell commands, EXPLICITLY tell the worker to write .cjs or .ps1 script files in tmp/audit-2026-06-11/ instead of inline pwsh -Command one-liners. PowerShell traps that bit workers in the 2026-06-11 audit-fix campaign: (1) `$_` inside `Where-Object` scripts is mangled by outer shell quoting, (2) `$r.StatusCode` and other `.Method` chains break under nested backticks..."

This is the SAME bug class. The project's existing best practice is exactly what the bash tool should do: don't inline complex PowerShell, write to a script file.

**opencode fork (borrow-only) — design patterns worth lifting.**
- `workdir` parameter (separate cwd from `cd ...;`) — cleaner than the current pi-coding-agent behavior
- `expand()` function for `$env:VAR`, `${env:VAR}`, `$HOME`, `$PWD`, `$PSHOME` — note that `$_` is NOT in this list, which is why it falls through to PowerShell's own expansion and gets eaten
- `dynamic()` predicate that returns true if the command has `$VAR` references
- `pathArgs()` extracts file-path arguments and resolves them through `argPath()`
- A safety scanner (`detectSafetyRisks`) for sensitive paths, pipes to shells, sudo, recursive deletes

The fork also uses `-Command` mode in `cmd()` and has the same bug class. We are not patching the fork; we are learning from its design without inheriting its bug.

---

## 2. Edge Cases the Design Must Handle

| Edge case | Why it matters | Mitigation |
|---|---|---|
| **Concurrent calls** | Multiple `bash` invocations running in parallel | Use `mkdtempSync` per call (atomic, OS-guaranteed unique); never share temp filenames across calls |
| **Large commands (multi-MB)** | `writeFileSync` of a 10MB command string to disk | PowerShell `-File` reads from disk with no size limit (vs `-Command`'s 8191-char legacy limit on 5.1). UTF-8 encoding handles international content |
| **Special characters in command** | Quotes, newlines, BOM, UTF-8 multibyte | Since we write to a file (not pass via argv), the shell never sees the content as a single string. No escape issues. UTF-8 BOM may be needed for older Windows PowerShell 5.1 — recommend writing without BOM and let `pwsh.exe` autodetect |
| **Commands that error mid-execution** | Temp file lifecycle on crash | Wrap spawn in try/finally; delete temp dir in finally. If the process crashes between write and spawn, the temp file is cleaned up by the finally on next call or by `os.tmpdir()` sweep |
| **Temp file cleanup on Windows** | Default `os.tmpdir()` is `%LOCALAPPDATA%\Temp`; antivirus scanning can block reads briefly | Use `mkdtempSync` for the directory (atomic creation), `writeFileSync` for the file, `rmSync({ recursive: true, force: true })` in finally. If AV blocks, the command just runs slightly late. |
| **User kills the agent** | Orphan temp files in `%TEMP%` | Acceptable — Windows Disk Cleanup will sweep them. Not worth a startup sweep. |
| **`cd` inside the command vs `workdir` parameter** | Semantic mismatch | `-File` mode preserves `Set-Location` semantics. Same as `-Command`. The `workdir` parameter (when added) takes precedence and is set via `process.cwd` at spawn. |
| **Background mode** | Detached process needs to find the script file | Temp file must be passed by path (not argv). Background mode also writes the file before detaching, so the file exists before the child reads it. |
| **Output capture** | `pwsh -File` writes to stdout/stderr normally | The spawn already captures via `stdio: ['ignore', 'pipe', 'pipe']`. No change needed. |
| **First-call latency** | Writing to disk adds ~5-20ms per call | Acceptable. Trivial compared to the model latency that follows. |
| **Concurrent same-command calls** | Two agents running `git status` at the same time | `mkdtempSync` gives each call a unique temp dir. No conflict. |

---

## 3. Alternative Approaches Evaluated

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| **A. Default to `-File` mode (write to temp .ps1, run `pwsh -File`)** | Bypasses `-Command` re-parsing entirely. Standard pattern (Cursor, abdus.dev). Each call has its own temp dir, no collision. Cursor's prior bug was in the wrapper, not the pattern itself. | Adds ~5-20ms per call (file write + cleanup). Wrapper must be minimal. | **RECOMMENDED** |
| **B. `windowsVerbatimArguments: true` in spawn** | Tells Node.js to pass argv to Windows without any CommandLine conversion | Doesn't help — the bug is in PowerShell's `-Command` mode re-parsing, not in Node's argv-to-CommandLine conversion. Confirmed via direct Node test: `spawn(pwsh, ['-Command', 'try { ... $_ ... }'])` with default options preserves `$_` in the argv; PowerShell's parser eats it on `-Command`. | **REJECTED** |
| **C. Auto-escape detection (detect `$_` and wrap with backticks or single quotes)** | No file I/O | Fragile: false positives on `$_` inside string literals, inside comments, inside `'`-quoted strings. Can't reliably distinguish "auto-var usage" from "literal `$_` string". Adds complexity for a case that should be solved at the architecture level. | **REJECTED** |
| **D. Hybrid: wrap in `-Command "& { ... }"` script block** | No file I/O | Tested. The script block wrapping does NOT preserve `$_` — PowerShell still re-parses the inner command. `$_` is still eaten. | **REJECTED** (verified empirically) |
| **E. Use `pwsh -EncodedCommand` (base64 UTF-16LE)** | No file I/O; bypasses shell quoting entirely | EncodedCommand is exactly the `-Command` mode re-parsing path, just with base64 input. The bug is in the parser, not the input encoding. Plus: obscures the command in the process tree (bad for debugging and audit), requires UTF-16LE encoding, requires double-encoding for special chars. | **REJECTED** |
| **F. Add a `runMode: 'command' \| 'file'` parameter, default to `file`** | User can opt out for backward compat | The default solves the problem for 99% of cases. Opt-out is rarely needed and adds API surface. | **CONSIDERED, but A is simpler** |
| **G. Document the `$_` gotcha + tell the model to use `'$_'`** | Zero code change, zero runtime cost | Pure documentation. The model has to remember to do it. We've already been bitten 3+ times in this session. Tool-level fix is more durable. | **REJECTED as primary fix; pair with A as defense-in-depth** |

---

## 4. Concrete Recommendation

**Adopt Approach A (default to `-File` mode) plus a documentation paragraph as defense-in-depth (the G-shaped fallback).**

### Patch to `pi-coding-agent/dist/core/tools/bash.js`

The two `spawn(shell, [...args, command], {...})` call sites in `createLocalBashOperations.exec` need a small wrapper. The current code is:

```js
// Foreground (line 89):
const child = spawn(shell, [...args, command], {
  cwd,
  detached: process.platform !== "win32",
  env: env ?? getShellEnv(),
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
// Background (line 49):
const child = spawn(shell, [...args, command], {
  cwd,
  detached: process.platform !== "win32",
  env: env ?? getShellEnv(),
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
```

Replace both with a helper that, on Windows PowerShell, writes the command to a temp `.ps1` and runs `-File`:

```js
import { writeFileSync, mkdtempSync, rmSync } from "node:fs"; // add to top imports

function stagePowerShellFile(shell, name, baseArgs, command) {
    // Only intercept Windows PowerShell (pwsh or powershell).
    if (process.platform !== "win32") return { args: baseArgs, cleanup: () => {} };
    if (name !== "pwsh" && name !== "powershell") return { args: baseArgs, cleanup: () => {} };
    // Minimal wrapper: write the user command verbatim, no env-var processing
    // or command-prefix injection. Cursor learned the hard way that cleverness
    // in the wrapper is the failure mode. Keep it boring.
    const dir = mkdtempSync(join(tmpdir(), "pi-bash-"));
    const file = join(dir, "script.ps1");
    writeFileSync(file, command, "utf8");
    return {
        args: ["-NoLogo", "-NoProfile", "-File", file],
        cleanup: () => { try { rmSync(dir, { recursive: true, force: true }); } catch {} },
    };
}
```

Then at both spawn sites:
```js
const staged = stagePowerShellFile(shell, name, args, command);
try {
    const child = spawn(shell, [...staged.args, command], {
        // ... existing options ...
    });
    // ... existing child handling ...
} finally {
    staged.cleanup();
}
```

Wait — the cleanup must run after the child exits, not when the spawn call returns. Move the cleanup into the existing wait/exit handling, or use a process.on('exit', cleanup) pattern. The simplest correct version is to track the temp file path in a closure and call cleanup in the same `finally` block that already runs after `waitForChildProcess(child)`.

### Patch to the tool description

Update the `description` field in `bashSchema` to mention the `$_` gotcha for transparency. From:
> "On Windows, commands run under PowerShell 7 when available."

To:
> "On Windows, commands run under PowerShell 7. To support PowerShell auto-variables like `$_` (current pipeline item), the user command is written to a temp `.ps1` and run with `pwsh -File`. If you see a 'Missing ) in method call' error from PowerShell, your command likely uses `$_` in a way that the wrapper can't capture — use `'$_'` (single quotes) or `$err = $_; $err.X` as a workaround."

This is a defense-in-depth measure: even with the `-File` mode fix, future PowerShell auto-variables or edge cases might still cause issues, and the doc gives the model a way to debug.

---

## 5. Acceptance Tests

After the patch, the following must pass:

1. **`$_` in catch block works.**
   Test: `try { 1/0 } catch { Write-Host ('caught: ' + $_.Exception.Message) }` returns `caught: Attempted to divide by zero.`

2. **`$_` in `Where-Object` works.**
   Test: `Get-Process | Where-Object { $_.CPU -gt 0 } | Select-Object -First 1 Name` returns at least one process name (or empty array if no matches — both are valid).

3. **Plain commands still work.**
   Test: `Write-Host "hello world"` returns `hello world`.

4. **Backtick-escaped `$_` is no longer needed.**
   Test: `Write-Host ('value: ' + '\$_')` — previously returned `value: \`. With the fix, returns `value: $_`.

5. **Concurrent calls don't collide.**
   Test: launch 5 parallel `bash` calls with distinct commands, all 5 should complete successfully with the expected output.

6. **Temp files are cleaned up.**
   Test: run a `bash` call, then check `%LOCALAPPDATA%\Temp\pi-bash-*\` — should be empty.

7. **`-Command` mode is no longer used (defense-in-depth check).**
   Test: grep the source — `args = ["-NoLogo", "-NoProfile", "-Command"]` should not appear in the foreground path on Windows. (The new path uses `-File`.)

8. **Backwards compat.**
   Test: existing `bash` callers using simple commands like `echo hello` (which currently work) still work.

---

## 6. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Wrapper script too clever — fails the way Cursor's did** | High if not careful | Keep the wrapper minimal: write command verbatim, no env-var processing, no transforms. The `stagePowerShellFile` helper above has no logic beyond "create dir, write file, return args". |
| **Temp file not cleaned up on child crash** | Low | `try/finally` around the wait/exit handler. On Windows process kill, the OS releases handles; the temp file is just bytes on disk and gets cleaned by Disk Cleanup. |
| **AV scanner locks the file when pwsh tries to read it** | Low (rare, but real) | `mkdtempSync` creates the file in `os.tmpdir()` which is normally excluded from AV scanning. If it does happen, pwsh will get a sharing violation and the user will see an error. Workaround: retry the call. |
| **Process tree kill leaves zombie pwsh** | Low | The existing `killProcessTree` already handles this. The temp file is independent of the child process. |
| **Output of `$env:VAR` (env var passing) breaks** | Low | The new path passes env via `env: NodeJS.ProcessEnv` at spawn, not through the command string. The existing `env ?? getShellEnv()` already works correctly. No change. |
| **Background mode timing: child reads temp file after parent deletes it** | Low | Background mode keeps the child alive; the parent only cleans up the temp file when the child exits. The cleanup is wired to `child.on('close', ...)`. The current foreground code already has the right structure; we just need to plumb the cleanup into it. |
| **User reports a new "Where-Object doesn't work" error after the fix** | Low | Test #2 covers this. If it fails, the temp file is being written wrong (e.g., wrong encoding). Diagnose with a hex dump of the temp file. |
| **The patch is in `dist/` and gets clobbered on `npm update`** | Medium | Document this in AGENTS.md. The proper upstream fix is to PR pi-coding-agent. Local patch needs to be reapplied after npm updates. |

---

## 7. Subagent Quality Notes

For the record on this session's subagent usage:

- **Nemotron 3 Ultra 550B (free + non-free, both lanes)** consistently failed to complete the `write` tool call within the 480s budget. The model did the reading and thinking correctly (confirmed in stream thinking_preview), but timed out before landing the bytes. Recommend either: (a) increase timeout to 1200s for this model, (b) use a smaller model for write-only tasks, or (c) skip subagent and write the report directly in main lane when the design is clear from the subagent's *visible thinking*.

- **Websearch MCP** has unreliable coverage for technical queries. Tavily/Exa returned mostly noise on Node.js + PowerShell queries. Direct curl to known-good sources (forum.cursor.com, abdus.dev) was more reliable.

- **Project durable memory** was the highest-signal source of context. The 2026-06-11 audit-fix campaign memory entry documented the exact bug class with the exact fix pattern, faster than any websearch would have.

---

## 8. Verdict

Apply Approach A + the doc change. Source of truth: this doc plus the two prior-art sources (Cursor forum, abdus.dev) plus the project memory entry. The non-free Nemotron worker's independent reading of both `pi-coding-agent/dist/core/tools/bash.js` and the opencode fork's `src/tool/bash.ts` confirmed the same design (see thinking_preview: "The proposed fix is to use `-File` with a temp file instead").

**Scope note:** This patch is to `pi-coding-agent/dist/`. The opencode fork is NOT being patched. The fork's `bash.ts` is borrowed-only — we read it for design patterns but do not modify it. Per AGENTS.md, the opencode fork is a separate codebase.

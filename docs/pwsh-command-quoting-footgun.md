# Windows pwsh -Command quoting footgun (pi harness)

## Symptom

`node`'s `spawnSync` calling `pwsh -NoLogo -NoProfile -Command "..."` fails fast
with a PowerShell **ParserError**, not a timeout. The error names a line inside
the script and says e.g. "Variable reference is not valid. ':' was not followed
by a valid variable name character."

## Root cause

Git Bash (the shell the `bash` tool runs in) performs **its own variable and
parameter expansion** on the command string _before_ pwsh ever sees it. The
PowerShell automatic variable `$_` (the pipeline/foreach current item) starts
with `$`, so Git Bash tries to expand `$_` — and `$_.LocalPort` becomes
`<empty>.LocalPort`, which pwsh then rejects.

So any pwsl one-liner that uses `$_` inside a **double-quoted** `-Command`
string is silently mangled. The failure is deterministic and looks like a
timeout because the harness wraps it that way.

## Reproduction (verified 2026-09-08)

```
node -e "execSync('powershell -NoLogo -NoProfile -Command \"... | ForEach-Object { 'port '+\$_... }\"')"
```

-> ParserError: Variable reference is not valid.

Meanwhile plain `cmd /c ...` via the same spawnSync is fine (191ms), so the
harness itself is not the problem — only the quoting.

## Fix (three, in preference order)

1. **Write the script to a `.ps1` and run `pwsh -File`** — no `-Command`
   string, so Git Bash never expands anything inside it. This is what the
   project's own launcher pattern (`*.ps1` + `pwsh -File`) already does and it
   is immune.
2. **Use single quotes for `-Command`** when the script contains `$_.`:
   `pwsh -Command '... | ForEach-Object { ... }'`. Single quotes stop Git Bash
   expansion. Downside: you can't interpolate shell variables inside.
3. **Avoid `$_` entirely** — bind the pipeline to a variable first, or use
   `Select-Object -ExpandProperty` / `foreach` loops over explicit arrays.

## When it bit this session

- `Get-NetTcpConnection | ForEach-Object { 'port '+$_.LocalPort+' pid '+$_.OwningProcess }`
- `Get-Process -Id $pid ...` inside a double-quoted string where `$pid` was
  meant for pwsh, not the shell.

## Rule of thumb

Any pwsh one-liner that needs `$variable` or `$_` goes through `-File` with a
written `.ps1`, never through a double-quoted `-Command` string.

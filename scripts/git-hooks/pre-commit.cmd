@echo off
REM Windows cmd wrapper for the pre-commit hook.
REM Git invokes this when the shell is cmd.exe.
REM It delegates to the PowerShell shim which in turn calls the bash script.

setlocal
set "HOOK_DIR=%~dp0"
pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%HOOK_DIR%pre-commit.ps1" %*
exit /b %errorlevel%

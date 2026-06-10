@echo off
setlocal enabledelayedexpansion

echo ============================================
echo Step 1: Listing all .ts files in js\modules\
echo ============================================
echo.

:: Step 2: For each .ts file, check if a .js counterpart exists
echo Step 2: Checking for .ts files with .js counterparts...
echo.

set "count=0"
for %%f in (js\modules\*.ts) do (
    set "base=%%~nf"
    if exist "js\modules\!base!.js" (
        echo HAS_JS: %%~nf
    )
)

echo.
echo ============================================
echo Step 3: Check imports for each .ts-with-.js pair
echo ============================================
echo.

echo DEAD candidates (has .js counterpart):
echo.

for %%f in (js\modules\*.ts) do (
    set "base=%%~nf"
    if exist "js\modules\!base!.js" (
        set "imported=0"
        
        :: Check if the filename (without extension) is imported anywhere
        findstr /s /i /m "!base!" js\*.ts src\*.ts src\*.svelte types\*.ts >nul 2>&1
        if !errorlevel! equ 0 (
            set "imported=1"
        )
        
        :: Also check imports that reference the module path like js/modules/filename
        findstr /s /i /m "modules\\!base!" js\*.ts src\*.ts src\*.svelte types\*.ts >nul 2>&1
        if !errorlevel! equ 0 (
            set "imported=1"
        )
        
        findstr /s /i /m "modules/!base!" js\*.ts src\*.ts src\*.svelte types\*.ts >nul 2>&1
        if !errorlevel! equ 0 (
            set "imported=1"
        )
        
        :: Also search .js files for imports
        findstr /s /i /m "!base!" js\*.js src\*.js >nul 2>&1
        if !errorlevel! equ 0 (
            set "imported=1"
        )
        
        if !imported! equ 0 (
            echo DEAD: %%~nf
        ) else (
            echo IMPORTED: %%~nf
        )
    )
)

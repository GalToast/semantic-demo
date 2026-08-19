#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * git:hook:check — run the repo pre-commit gate directly (package.json `git:hook:check`).
 *
 * Extracts the inline `node -e` dispatcher that previously lived in package.json
 * (a 369-char, newline-less shell-string with concatenated paths). Selects the
 * platform-native shim the same way install.mjs does:
 *   win32 -> pwsh -NoLogo -NoProfile -File <root>/scripts/git-hooks/pre-commit.ps1
 *   posix -> bash <root>/scripts/git-hooks/pre-commit
 * Both invoke the gate with --AllowAnyBranch --SkipHighRiskCheck and inherited
 * stdio, so the branch guard + high-risk surface check stay out of the way while
 * the reversion-guard + test-strategy-gap surface still audits.
 *
 * Uses execFileSync (no shell) so hook paths can never be shell-interpreted —
 * a harden over the original execSync('bash '+path+args) string concat.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const HOOK_DIR = path.join(ROOT, 'scripts', 'git-hooks')

const isWin = process.platform === 'win32'
const hookPath = path.join(HOOK_DIR, isWin ? 'pre-commit.ps1' : 'pre-commit')
const args = ['--AllowAnyBranch', '--SkipHighRiskCheck']

try {
    if (isWin) {
        execFileSync('pwsh', ['-NoLogo', '-NoProfile', '-File', hookPath, ...args], { stdio: 'inherit' })
    } else {
        execFileSync('bash', [hookPath, ...args], { stdio: 'inherit' })
    }
} catch (err) {
    // execFileSync throws on non-zero exit; propagate the gate's own code.
    // The hook already printed its diagnostics via inherited stdio.
    process.exitCode = err?.status ?? 1
}

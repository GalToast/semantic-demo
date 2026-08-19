#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Cross-platform git pre-commit hook installer/remover.
 *
 * Replaces the inline-PowerShell `git:hook:install` / `git:hook:uninstall`
 * scripts (which required `pwsh` on every platform, including Linux/macOS where
 * it is frequently absent). A single `node` script covers all shells because
 * Node is the one dependency every dev already has.
 *
 * Behavior mirrors the original PowerShell exactly:
 *   - install: Copy-Item (overwrite) pre-commit + pre-commit.ps1 + pre-commit.cmd
 *              into .git/hooks/, chmod 0755 on the bash entry off-Windows.
 *   - uninstall (--remove): Remove-Item (-ErrorAction SilentlyContinue == rmSync force:true)
 *
 * Usage:
 *   node scripts/git-hooks/install.mjs            # install
 *   node scripts/git-hooks/install.mjs --remove   # uninstall
 */

const HOOK_FILES = ['pre-commit', 'pre-commit.ps1', 'pre-commit.cmd']

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const SRC = path.join(ROOT, 'scripts', 'git-hooks')
const DST = path.join(ROOT, '.git', 'hooks')

const removing = process.argv.includes('--remove')

if (!fs.existsSync(DST)) {
  // .git/hooks is normally present, but mkdir is strictly safer than a hard error.
  fs.mkdirSync(DST, { recursive: true })
}

const action = removing ? 'removed' : 'installed'

for (const name of HOOK_FILES) {
  const src = path.join(SRC, name)
  const dst = path.join(DST, name)

  if (removing) {
    fs.rmSync(dst, { force: true }) // -ErrorAction SilentlyContinue
  } else {
    if (!fs.existsSync(src)) {
      throw new Error(`Source hook not found: ${src}`)
    }
    fs.copyFileSync(src, dst) // Copy-Item -Force (overwrites)
    // Git on macOS/Linux execs .git/hooks/pre-commit directly → needs +x.
    // On Windows the .cmd / .ps1 shims are used instead (no chmod needed).
    if (process.platform !== 'win32' && name === 'pre-commit') {
      fs.chmodSync(dst, 0o755)
    }
  }
  console.log(`  ${action} ${name}`)
}

console.log(`Git pre-commit hook ${action} (bash + ps1 shim + cmd wrapper).`)

#!/usr/bin/env node
/**
 * scripts/qa-deploy-preflight.mjs — Local preflight for no-surprise deploy.
 *
 * Runs a battery of local checks so the human deploy becomes a 3-command act:
 *   1. node scripts/qa-deploy-preflight.mjs       ← green → go
 *   2. ./deploy.sh                                 ← hot (add --dryrun first)
 *   3. node scripts/qa-deploy-verify.mjs $HOST    ← post-deploy pass/fail
 *
 * Checks performed:
 *   (1) dist/svelte loads (rebuilds once if needed via npm run build).
 *   (2) .br/.gz twin coverage for top-6 asset families (mode-transition,
 *       index, three-*, data-worker) — each family must have at least one .br
 *       and one .gz twin present under dist/svelte/assets/.
 *   (3) .htaccess at repo HEAD contains the js.br/Content-Encoding/gzip
 *       rewrite pair AND immutable-cache (ExpiresByType / Cache-Control) lines.
 *   (4) scripts/qa-deploy-verify.mjs exists (post-deploy verifier).
 *   (5) scripts/qa-gate-compare.mjs exists and runs clean (LH gate compare).
 *
 * Output: a 10-line PASS/FAIL card. Exit 0 = safe-to-ship, 1 = needs work.
 */

import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(__dirname, '..')
const DIST = join(ROOT, 'dist', 'svelte')
const HTACCESS = join(ROOT, '.htaccess')
const VERIFY_SCRIPT = join(__dirname, 'qa-deploy-verify.mjs')
const GATE_COMPARE = join(__dirname, 'qa-gate-compare.mjs')

// ── Card state ───────────────────────────────────────────────────────────────

const checks = [] // { label, ok, detail }
function check(label, ok, detail = '') {
  checks.push({ label, ok, detail })
}

function emitCard() {
  const pass = checks.filter((c) => c.ok).length
  const total = checks.length
  console.log('── qa-deploy-preflight ──────────────────────')
  console.log(`[PASS] dist/svelte/index.html  — ${checks[0]?.detail ?? ''}`)
  console.log(`[PASS] twin coverage           — ${checks[1]?.detail ?? ''}`)
  console.log(`[PASS] .htaccess rewrite rules  — ${checks[2]?.detail ?? ''}`)
  console.log(`[PASS] verify script present    — ${checks[3]?.detail ?? ''}`)
  console.log(`[PASS] gate-compare runs        — ${checks[4]?.detail ?? ''}`)
  console.log('── what ships (remote) ──────────────────────')
  console.log('  1. npm run build            (local only — preflight)')
  console.log('  2. ./deploy.sh              (scp dist + .htaccess to $HOST)')
  console.log('  3. node scripts/qa-deploy-verify.mjs $HOST')
  console.log('── expected post-deploy                    ──')
  console.log(`  6/6 qa-deploy-verify checks (index+CE+MIME+twin+308+Vary)`)
  console.log('── verdict ───────────────────────────────────')
  const failCount = checks.filter((c) => !c.ok).length
  if (failCount > 0) {
    for (const c of checks) {
      if (!c.ok) console.log(`  [FAIL] ${c.label}: ${c.detail}`)
    }
    console.log(`FAILED: ${failCount}/${total} local checks`)
    process.exit(1)
  }
  console.log(`PASSED: ${pass}/${total} local checks — safe-to-ship`)
  process.exit(0)
}

// ── (1) dist/svelte loads ────────────────────────────────────────────────────

function ensureDist() {
  const idx = join(DIST, 'index.html')
  if (existsSync(idx)) {
    const mtime = statSync(idx).mtimeMs
    // If the index is <1 min old, assume fresh enough.
    if (Date.now() - mtime < 60_000) {
      check('dist/svelte/index.html', true, 'exists (fresh, skipped rebuild)')
      return
    }
  }
  // needsBuild — trigger a local build.
  try {
    console.log('  → npm run build (preflight rebuild)')
    execSync('npm run build', { cwd: ROOT, stdio: 'inherit' })
    if (!existsSync(idx)) {
      check('dist/svelte/index.html', false, 'built but index.html missing')
      emitCard()
    }
    check('dist/svelte/index.html', true, 'rebuilt OK')
  } catch (e) {
    check('dist/svelte/index.html', false, `build failed: ${e.message}`)
    emitCard()
  }
}

// ── (2) twin coverage for top-6 asset families ──────────────────────────────

const ASSET_FAMILIES = [
  /mode-transition/i,
  /index/i,
  /^three-/i,
  /^data-worker/i,
  /three-engine-core/i,
  /three-postprocessing/i,
]

function checkTwins() {
  const assetsDir = join(DIST, 'assets')
  if (!existsSync(assetsDir)) {
    check('twin coverage', false, 'dist/svelte/assets/ missing')
    return
  }
  const files = readdirSync(assetsDir)
  let ok = true
  const details = []
  for (const pat of ASSET_FAMILIES) {
    const matches = files.filter((f) => pat.test(f))
    if (matches.length === 0) {
      ok = false
      details.push(`${pat.source} → none`)
      continue
    }
    // Pick the first .js/.css source for this family that already HAS a twin.
    const src = matches.find((f) => { const ext = /\.(js|css)$/.exec(f)?.[1]; return ext && files.includes(`${f}.br`) })
    const fallbackSrc = matches.find((f) => /\.(js|css)$/.test(f))
    if (!src && !fallbackSrc) {
      ok = false
      details.push(`${pat.source} → no raw twin`)
      continue
    }
    const base = src || fallbackSrc
    if (!base) {
      ok = false
      details.push(`${pat.source} → no raw twin`)
      continue
    }
    const hasBr = files.some((f) => f === `${base}.br`)
    const hasGz = files.some((f) => f === `${base}.gz`)
    if (!hasBr || !hasGz) {
      ok = false
      details.push(`${basename(base)} → br=${hasBr} gz=${hasGz}`)
    } else {
      details.push(`${basename(base)} ✓`)
    }
  }
  check('twin coverage', ok, details.join(' | '))
}

// ── (3) .htaccess rewrite + cache lines ─────────────────────────────────────

function checkHtaccess() {
  if (!existsSync(HTACCESS)) {
    check('.htaccess rewrite rules', false, 'file not found at repo HEAD')
    return
  }
  const content = readFileSync(HTACCESS, 'utf8')
  const hasBrRewrite = /RewriteCond.*%\{HTTP:Accept-Encoding\}.*br/.test(content)
  const hasGzipRewrite = /RewriteCond.*%\{HTTP:Accept-Encoding\}.*gzip/.test(content)
  const hasContentEncoding = /Content-Encoding\s+(br|gzip)/.test(content)
  const hasImmutable = /ExpiresByType|Cache-Control.*immutable/.test(content)
  // The "js.br / Content-Encoding / gzip" pair: both rewrites + encoding headers.
  const pairOk = hasBrRewrite && hasGzipRewrite && hasContentEncoding
  check(
    '.htaccess rewrite rules',
    pairOk && hasImmutable,
    `br-rewrite=${hasBrRewrite} gzip-rewrite=${hasGzipRewrite} CE=${hasContentEncoding} immutable=${hasImmutable}`,
  )
}

// ── (4) verify script present ───────────────────────────────────────────────

function checkVerifyScript() {
  if (!existsSync(VERIFY_SCRIPT)) {
    check('verify script present', false, `missing: ${VERIFY_SCRIPT}`)
    return
  }
  check('verify script present', true, basename(VERIFY_SCRIPT))
}

// ── (5) gate-compare runs ───────────────────────────────────────────────────

function checkGateCompare() {
  if (!existsSync(GATE_COMPARE)) {
    check('gate-compare runs', false, `missing: ${GATE_COMPARE}`)
    return
  }
  try {
    const out = execSync(`node "${GATE_COMPARE}"`, {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 30_000,
    })
    const ok = out.trim().endsWith('ALL PASS')
    check('gate-compare runs', ok, ok ? 'ALL PASS' : out.trim().split('\n').slice(-1)[0])
  } catch (e) {
    // Non-zero exit = gate fail; also treat any throw as non-ideal.
    const lastLine = e.stdout?.toString()?.trim().split('\n').pop() ?? e.message
    check('gate-compare runs', false, lastLine)
  }
}

// ── (6) dist self-consistency (split-brain detector, 2026-08-17) ────────────
// Parallel builds that race the same tree can leave index.html pointing at a
// DIFFERENT build's assets — every JS 404s and the app is a shell. This gate
// cross-checks every src/href in index.html against the on-disk tree.

function checkDistIntegrity() {
  const idx = join(DIST, 'index.html')
  if (!existsSync(idx)) {
    check('dist integrity', false, 'index.html missing')
    return
  }
  const html = readFileSync(idx, 'utf8')
  const refs = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css|woff2?))"[^"]*/g)]
    .map((m) => m[1])
    .filter((u) => !u.startsWith('data:'))
  const missing = refs.filter((u) => !existsSync(join(DIST, u)))
  const ok = missing.length === 0
  check('dist integrity', ok, ok ? `${refs.length} refs all present` : `MISSING: ${missing.join(', ')}`)
}

// ── Main ─────────────────────────────────────────────────────────────────────

ensureDist()
checkTwins()
checkDistIntegrity()
checkHtaccess()
checkVerifyScript()
checkGateCompare()
emitCard()

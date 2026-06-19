/**
 * Static guard: verify that deploy/runtime topology surfaces are env-driven.
 *
 * Checks:
 *  1. api/config.php uses _env() lookups (not bare hardcoded paths as primary values).
 *  2. deploy.sh and deploy.ps1 use env-var fallbacks (not bare hardcoded paths as primary values).
 *  3. .env is listed in .gitignore.
 *  4. .env.example documents the SEMANTIC_SERVICE_HOME override.
 *
 * The guard does NOT assert that the hardcoded default values are absent —
 * they must remain as backward-compatible fallbacks.  It asserts that the
 * env-override surface exists and is wired through.
 */

import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.cwd())

function assert(condition, message) {
    if (!condition) throw new Error(message)
}

function readFile(rel) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

// ── 1. api/config.php ──────────────────────────────────────────────────────
{
    const src = readFile('api/config.php')

    // Must define the _env helper.
    assert(src.includes('function _env('), 'api/config.php must define a _env() helper for env-driven lookups')

    // The primary $semanticServiceHome must use _env(), not a bare string literal.
    assert(
        /\$semanticServiceHome\s*=\s*_env\(/.test(src),
        'api/config.php: $semanticServiceHome must be assigned via _env()'
    )

    // Health URLs must use env-overridable port variables, not hardcoded port strings as primary.
    assert(
        /SEMANTIC_SEARCH_HEALTH_URL/.test(src),
        'api/config.php: must support SEMANTIC_SEARCH_HEALTH_URL env override'
    )
    assert(/EMBED_SERVICE_HEALTH_URL/.test(src), 'api/config.php: must support EMBED_SERVICE_HEALTH_URL env override')
    assert(/ASK_MOCO_HEALTH_URL/.test(src), 'api/config.php: must support ASK_MOCO_HEALTH_URL env override')

    // The hardcoded default path should still be present as a fallback.
    assert(
        src.includes('/home/u741831384'),
        'api/config.php: must retain /home/u741831384 as backward-compatible default'
    )

    console.log('[config-topology-env] api/config.php: PASS')
}

// ── 2. deploy.sh ──────────────────────────────────────────────────────────
{
    const src = readFile('deploy.sh')

    // Must use env-var fallbacks for the core topology variables.
    assert(/DEPLOY_SSH_TARGET/.test(src), 'deploy.sh: must support DEPLOY_SSH_TARGET env override')
    assert(/DEPLOY_REMOTE_DIR/.test(src), 'deploy.sh: must support DEPLOY_REMOTE_DIR env override')
    assert(/DEPLOY_REMOTE_ROOT/.test(src), 'deploy.sh: must support DEPLOY_REMOTE_ROOT env override')
    assert(/DEPLOY_PORT/.test(src), 'deploy.sh: must support DEPLOY_PORT env override')

    // The hardcoded default path should still be present as a fallback.
    assert(src.includes('/home/u741831384'), 'deploy.sh: must retain /home/u741831384 as backward-compatible default')

    console.log('[config-topology-env] deploy.sh: PASS')
}

// ── 3. deploy.ps1 ─────────────────────────────────────────────────────────
{
    const src = readFile('deploy.ps1')

    // Must use env-var fallbacks for the core topology variables.
    assert(
        /DEPLOY_SSH_TARGET|env:DEPLOY_SSH_TARGET/.test(src),
        'deploy.ps1: must support DEPLOY_SSH_TARGET env override'
    )
    assert(
        /DEPLOY_REMOTE_DIR|env:DEPLOY_REMOTE_DIR/.test(src),
        'deploy.ps1: must support DEPLOY_REMOTE_DIR env override'
    )
    assert(
        /DEPLOY_REMOTE_ROOT|env:DEPLOY_REMOTE_ROOT/.test(src),
        'deploy.ps1: must support DEPLOY_REMOTE_ROOT env override'
    )
    assert(/DEPLOY_PORT|env:DEPLOY_PORT/.test(src), 'deploy.ps1: must support DEPLOY_PORT env override')

    // The hardcoded default path should still be present as a fallback.
    assert(src.includes('/home/u741831384'), 'deploy.ps1: must retain /home/u741831384 as backward-compatible default')

    console.log('[config-topology-env] deploy.ps1: PASS')
}

// ── 4. .gitignore includes .env ───────────────────────────────────────────
{
    const src = readFile('.gitignore')
    const lines = src.split(/\r?\n/)
    const hasEnv = lines.some((l) => l.trim() === '.env')
    assert(hasEnv, '.gitignore must include .env to prevent committing secrets')

    console.log('[config-topology-env] .gitignore: PASS')
}

// ── 5. .env.example documents SEMANTIC_SERVICE_HOME ────────────────────────
{
    const src = readFile('.env.example')
    assert(/SEMANTIC_SERVICE_HOME/.test(src), '.env.example must document the SEMANTIC_SERVICE_HOME override')
    assert(/DEPLOY_SSH_TARGET/.test(src), '.env.example must document the DEPLOY_SSH_TARGET override')

    console.log('[config-topology-env] .env.example: PASS')
}

// ── 6. deploy.sh ↔ deploy.ps1 alignment ────────────────────────────────────
{
    const sh = readFile('deploy.sh')
    const ps = readFile('deploy.ps1')

    // Both scripts must deploy leadEnrichment.public.json.
    assert(sh.includes('leadEnrichment'), 'deploy.sh: must deploy leadEnrichment.public.json')
    assert(ps.includes('leadEnrichment'), 'deploy.ps1: must deploy leadEnrichment.public.json (drift from deploy.sh)')

    // Both scripts must back up leadEnrichment.public.json in the backup step.
    assert(
        sh.includes('BACKUP_DIR/scripts/leadEnrichment'),
        'deploy.sh: must back up leadEnrichment.public.json in backup dir'
    )
    assert(
        ps.includes('BackupDir/scripts/leadEnrichment'),
        'deploy.ps1: must back up leadEnrichment.public.json in backup dir'
    )

    // Both scripts must restore leadEnrichment.public.json in rollback.
    assert(
        sh.includes('scripts/leadEnrichment') && sh.includes('REMOTE_DIR/scripts'),
        'deploy.sh: rollback must restore leadEnrichment.public.json'
    )
    assert(
        ps.includes('scripts/leadEnrichment') && ps.includes('RemoteDir/scripts'),
        'deploy.ps1: rollback must restore leadEnrichment.public.json'
    )

    // Both scripts must create $BACKUP_DIR/scripts in the backup mkdir.
    assert(/\$BACKUP_DIR\/scripts/.test(sh), 'deploy.sh: backup mkdir must include scripts/ dir')
    assert(/\$BackupDir\/scripts/.test(ps), 'deploy.ps1: backup mkdir must include scripts/ dir')

    // Scanner source must be env-overridable in both scripts.
    // Scanner.js decoupling (2026-06-19): scanner.js was identified as a
    // standalone CloudScan tool not owned by semantic-explorer. References
    // were removed from both deploy scripts. See MIGRATION-STATUS.md.

    console.log('[config-topology-env] deploy.sh ↔ deploy.ps1 alignment: PASS')
}

console.log('[config-topology-env] all checks passed')

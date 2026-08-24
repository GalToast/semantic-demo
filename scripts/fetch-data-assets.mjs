#!/usr/bin/env node
/**
 * fetch-data-assets.mjs — pull private data assets into the working tree.
 *
 * The public repo carries CODE only; the four canonical business datasets
 * live in the PRIVATE companion repo GalToast/semantic-explorer-data
 * (privacy split, 2026-08-23). This script restores them to their expected
 * paths so builds and local dev work:
 *
 *   public/data/semantic_threads.dat
 *   public/data/semantic_threads_ui.dat
 *   public/data/leadEnrichment.public.json
 *   src/data.dat
 *
 * Usage:
 *   node scripts/fetch-data-assets.mjs             # always fetch+refresh
 *   node scripts/fetch-data-assets.mjs --if-missing  # no-op when present (prebuild)
 *
 * Auth: uses your existing GitHub credentials (gh auth login / credential
 * helper). On CI, provide a fine-grained PAT with read access to the data
 * repo as GH_TOKEN and ensure `gh auth setup-git` equivalent, or embed a
 * short-lived token in the URL via GIT_AUTH_HEADER env.
 */
import { existsSync, mkdirSync, chmodSync, cpSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_REPO = 'GalToast/semantic-explorer-data'
const ASSETS = [
    'public/data/semantic_threads.dat',
    'public/data/semantic_threads_ui.dat',
    'public/data/leadEnrichment.public.json',
    'src/data.dat'
]

const ifMissing = process.argv.includes('--if-missing')
const quiet = process.argv.includes('--quiet')

function missing() {
    return ASSETS.filter((p) => !existsSync(resolve(ROOT, p)))
}

if (ifMissing && missing().length === 0) {
    console.log('[fetch:data] all assets present — skipping')
    process.exit(0)
}

const need = missing()
console.log(`[fetch:data] fetching ${need.length}/${ASSETS.length} assets from ${DATA_REPO} ...`)

const cache = resolve(ROOT, '.data-repo-cache')
try {
    rmSync(cache, { recursive: true, force: true })
    mkdirSync(cache, { recursive: true }) // exec cwd must exist; git fills it
    // CI path: read-only deploy key (Actions secret DATA_DEPLOY_KEY written to
    // a file by the workflow). Local path: gh handles auth when logged in.
    // Accept the raw key via env (CI) or a pre-written key file.
    let keyFile = process.env.DATA_DEPLOY_KEY_FILE
    if (!keyFile && process.env.DATA_DEPLOY_KEY) {
        keyFile = resolve(cache, '..', '.data-deploy-key')
        writeFileSync(keyFile, process.env.DATA_DEPLOY_KEY.trimEnd() + '\n', { mode: 0o600 })
        chmodSync(keyFile, 0o600)
    }
    if (keyFile && existsSync(keyFile)) {
        execSync('git clone --depth 1 --quiet git@github.com:GalToast/semantic-explorer-data.git .', {
            cwd: cache,
            stdio: 'inherit',
            shell: 'bash',
            env: {
                ...process.env,
                GIT_SSH_COMMAND: `ssh -i "${keyFile}" -o StrictHostKeyChecking=no -o IdentitiesOnly=yes`
            }
        })
    } else {
        execSync(`gh repo clone ${DATA_REPO} . -- --depth 1 --quiet`, {
            cwd: cache,
            stdio: 'inherit',
            shell: 'bash'
        })
    }
} catch (_err) {
    console.error(
        `[fetch:data] FAILED to clone ${DATA_REPO}.\n` +
            'Auth needed for the private data repo. Run:\n' +
            '  gh auth login          (then retry)\n' +
            `or verify you can read: https://github.com/${DATA_REPO}\n`
    )
    try {
        rmSync(cache, { recursive: true, force: true })
    } catch {
        /* cache cleanup best-effort */
    }
    process.exit(1)
}

let copied = 0
for (const p of ASSETS) {
    const from = resolve(cache, p)
    if (!existsSync(from)) {
        console.error(`[fetch:data] asset missing in data repo: ${p}`)
        continue
    }
    const to = resolve(ROOT, p)
    mkdirSync(dirname(to), { recursive: true })
    cpSync(from, to)
    copied++
}
try {
    rmSync(cache, { recursive: true, force: true })
} catch {
    /* cache cleanup best-effort */
}

const stillMissing = missing()
if (stillMissing.length > 0) {
    console.error(`[fetch:data] INCOMPLETE — still missing: ${stillMissing.join(', ')}`)
    process.exit(1)
}
console.log(`[fetch:data] OK — ${copied} asset(s) restored to expected paths`)

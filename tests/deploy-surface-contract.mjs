#!/usr/bin/env node
/**
 * deploy-surface-contract.mjs
 *
 * Pins the deploy surface against its three observed failure classes:
 *
 *   1. HTACCESS_NESTED_FILESMATCH — nested <FilesMatch> sections are
 *      silently ignored by Apache/LiteSpeed. The 2026-08-18 prod incident:
 *      .js.br twins served as text/plain + nosniff => app shell never
 *      mounted. Guard: every <FilesMatch> block must be flat (a FilesMatch
 *      open tag may not appear between another's open and close), and each
 *      precompressed twin family must set encoding + Content-Type.
 *
 *   2. FONT_SHIPPING — brand typography (6fb180a3) ships dist/svelte/fonts;
 *      both deploy scripts must mkdir/chmod/scp it or prod 404s its fonts.
 *
 *   3. FALLBACK_CACHE_PERSISTENCE — api.php local-record fallbacks must call
 *      persistSemanticSearchCache so repeat requests skip the 1s
 *      serviceHealthy probe while the semantic service is offline.
 *
 * Run: node tests/deploy-surface-contract.mjs
 */

import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
let failed = 0
function check(name, pass, detail = '') {
    const mark = pass ? 'OK ' : 'FAIL'
    console.log(`  [${mark}] ${name}${pass ? '' : ` — ${detail}`}`)
    if (!pass) failed += 1
}

// ── 1. .htaccess: no nested FilesMatch, per-type twin headers present ───────
const ht = fs.readFileSync(path.join(ROOT, '.htaccess'), 'utf8')

const opens = []
let nestedLines = 0
for (const line of ht.split('\n')) {
    const t = line.trim()
    if (/^<FilesMatch\b/i.test(t)) opens.push(t)
    else if (/^<\/FilesMatch>/i.test(t)) opens.pop()
    if (opens.length > 1) nestedLines += 1
}
check('htaccess: no nested <FilesMatch> blocks', nestedLines === 0, `${nestedLines} nested line(s)`)

const TWIN_TYPES = [
    ['\\.js\\.br$', 'application/javascript'],
    ['\\.css\\.br$', 'text/css'],
    ['\\.json\\.br$', 'application/json'],
    ['\\.dat\\.br$', 'application/octet-stream'],
]
for (const [pattern, type] of TWIN_TYPES) {
    // The htaccess stores the Apache pattern verbatim (literal backslashes),
    // so locate the block by string search and slice to its close tag.
    const openTag = '<FilesMatch "' + pattern + '">'
    const openIdx = ht.indexOf(openTag)
    let ok = false
    if (openIdx !== -1) {
        const closeIdx = ht.indexOf('</FilesMatch>', openIdx)
        const block = closeIdx === -1 ? '' : ht.slice(openIdx, closeIdx)
        ok = block.includes('Content-Encoding br') && block.includes('Content-Type ' + type)
    }
    check('htaccess: ' + pattern + ' twin sets encoding+type', ok)
}
// gzip twins exist for the same families (spot-check one)
check('htaccess: .dat.gz flat block exists', /<FilesMatch\s+"\\.dat\\.gz\$">[\s\S]*?Content-Encoding gzip/i.test(ht))

// ── 2. deploy scripts ship fonts/ ────────────────────────────────────────────
for (const script of ['deploy.sh', 'deploy.ps1']) {
    const src = fs.readFileSync(path.join(ROOT, script), 'utf8')
    check(script + ': mkdir includes fonts', /mkdir[^\n]*fonts/.test(src))
    check(script + ': chmod sweep includes fonts', /find[^\n]*fonts[^\n]*chmod|chmod[^\n]*fonts/.test(src) || /fonts['"][^\n]*-type f/.test(src) || /\$RemoteDir\/fonts|\$\{REMOTE_DIR\}\/fonts/i.test(src))
    check(script + ': scp -r dist/svelte/fonts', /scp[^\n]*-r[^\n]*dist\/svelte\/fonts/.test(src))
}

// ── 3. api.php fallback paths persist cache ─────────────────────────────────
const apiPhp = fs.readFileSync(path.join(ROOT, 'api.php'), 'utf8')
const persistCalls = (apiPhp.match(/persistSemanticSearchCache\(/g) ?? []).length
check('api.php: >=4 persistSemanticSearchCache call sites', persistCalls >= 4, 'found ' + persistCalls)
const localRecords = (apiPhp.match(/\['cache_source'\]\s*=\s*'local-records'/g) ?? []).length
check('api.php: >=3 local-record fallbacks marked cache_source', localRecords >= 3, 'found ' + localRecords)

const searchPhp = fs.readFileSync(path.join(ROOT, 'api', 'search.php'), 'utf8')
check('api/search.php defines persistSemanticSearchCache', /function persistSemanticSearchCache\s*\(/.test(searchPhp))
check('api.php requires api/search.php', /require_once[^\n]*api\/search\.php/.test(apiPhp))

console.log('')
if (failed > 0) {
    console.error('FAILED: ' + failed + ' deploy-surface check(s)')
    process.exit(1)
}
console.log('Deploy surface contract OK.')

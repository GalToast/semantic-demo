#!/usr/bin/env node
/**
 * map-state split fold-gate helper (main-lane 2026-08-11)
 *
 * Verifies the split preserved the parent module's export surface EXACTLY:
 * exports of src/lib/engine/map-state.ts BEFORE (baseline ref) vs AFTER (worktree).
 * Prints missing/added names so the fold judge can eyeball the multiset diff.
 *
 * Usage:
 *   node scripts/mapstate-fold-gate.mjs [--baseline <ref>] [--file <path>]
 * Defaults: baseline = upstream/master, file = src/lib/engine/map-state.ts
 * Note: baseline resolves via `git show <ref>:<relative-path>` — run from repo root.
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const argv = process.argv.slice(2)
const opt = (name, dflt) => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : dflt
}
const FILE = resolve(opt('--file', 'src/lib/engine/map-state.ts'))
const BASELINE = opt('--baseline', 'upstream/master')

function exportNames(source) {
    const names = new Set()
    for (const m of source.matchAll(
        /^export\s+(?:async\s+)?(?:const|function|class|interface|type|let|enum)\s+([A-Za-z_$][\w$]*)/gm
    )) {
        names.add(m[1])
    }
    for (const m of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
        for (const item of m[1].split(',')) {
            const part = item.trim()
            if (!part) continue
            const as = part.match(/(\w+)\s+as\s+(\w+)/)
            names.add(as ? as[2] : part)
        }
    }
    return names
}

function baselineSource() {
    const rel = FILE.startsWith(process.cwd())
        ? FILE.slice(process.cwd().length + 1).replaceAll('\\', '/')
        : FILE.replaceAll('\\', '/')
    return execSync(`git show ${BASELINE}:${rel}`, { encoding: 'utf-8', cwd: resolve('.') })
}

const baselineNames = exportNames(baselineSource())
const nowNames = exportNames(readFileSync(FILE, 'utf-8'))

// Parent must KEEP its core implementation (init/destroy/zoom/etc.) — a pure
// barrel (re-exports only) is a fold blocker per the B-1..B-4 plan.
const KEPT_FN_RE =
    /(?:function|const)\s+(?:LEAFLET_VERSION|LEAFLET_CSS_URL|LEAFLET_JS_URL|initMap|destroyMap|zoomMap|initMapStateSubscriptions|showMapTooltip|refreshMapMarkers|getMapRoutePoints|refreshMapRouteEmbodiment|centerMapOnRouteAnchor|getRouteEmbodimentIndices|getRouteAnchorIndex|getRouteDirectorState|syncRouteDirectorState|setTerrainHandoffState)/g
const nowSrc = readFileSync(FILE, 'utf-8')
// Count actual kept implementations in the parent (definitions, not re-export lines).
const keptCount = (nowSrc.match(KEPT_FN_RE) ?? []).length

const missing = [...baselineNames].filter((n) => !nowNames.has(n))
const added = [...nowNames].filter((n) => !baselineNames.has(n))

console.log(`file:      ${FILE}`)
console.log(`baseline:  ${BASELINE}`)
console.log(`baseline exports: ${baselineNames.size}`)
console.log(`now exports:      ${nowNames.size}`)
console.log(`kept fns in parent: ${keptCount}`)
if (keptCount === 0) {
    console.log('PARENT MISSING KEPT IMPLEMENTATIONS (barrel-only) — fold blocker per B-1..B-4 plan')
    process.exitCode = 1
}
if (missing.length === 0 && added.length === 0 && keptCount > 0) {
    console.log('EXPORT SURFACE IDENTICAL — fold gate pass')
    process.exit(0)
}
console.log('EXPORT SURFACE CHANGED:')
if (missing.length) console.log(`   MISSING: ${missing.join(', ')}`)
if (added.length) console.log(`   ADDED:   ${added.join(', ')}`)
console.log('   (ADDED-only may be fine for parent-splittees; MISSING is a fold blocker)')
process.exitCode = 1

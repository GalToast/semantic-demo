/**
 * ts-resolve-loader.mjs
 *
 * Custom Node ESM resolve hook that:
 *  1. Resolves the project's TypeScript path aliases (@/, @lib/, @components/)
 *     so contract tests can import from the canonical Svelte 5 + bridge paths
 *     the same way the Vite/Svelte app does.
 *  2. Falls back to `.ts` when a `.js` specifier cannot be found. This bridges
 *     the gap between TypeScript source files (which use `.js` import specifiers
 *     for bundler compatibility) and Node ESM (which resolves specifiers literally).
 *
 * Used by the contract test runner to execute .mjs tests that transitively
 * import from js/modules/<file>.ts files and src/lib/<any>/<file>.ts files.
 */

import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve as pathResolve, dirname, sep } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = pathResolve(__dirname, '..', '..')
const PROJECT_ROOT_URL = pathToFileURL(PROJECT_ROOT + sep).href

// Vite-style env polyfill for Node test runs that import src/ files.
// `import.meta.env` is a per-module ESM object, so it cannot be redefined on
// globalThis for imported modules. Instead, this loader transforms every
// `import.meta.env` reference in project source into a global object lookup
// (`globalThis.__importMetaEnv`) that is installed by the Svelte rune stubs
// module imported at the top of each transformed module.
const SVELTE_RUNE_STUBS_URL = pathToFileURL(pathResolve(__dirname, 'svelte-runes-stubs.mjs')).href
const LOADER_URL = pathToFileURL(__filename).href

const VITE_ENV_RE = /import\.meta\.env\b/g

// Svelte 5 runes are compile-time constructs in the browser bundle. When Node
// loads project source directly for contract/audit scripts, the bare rune
// identifiers are undefined. This loader prepends an import of the rune-stubs
// module to source files that use Svelte 5 runes or import.meta.env, so the
// module evaluates safely under Node. The browser build still gets the real
// Svelte 5 runtime.
const RUNE_NAMES = ['$state.snapshot', '$state.frozen', '$state.raw', '$state', '$derived.by', '$derived', '$effect.pre', '$effect.root', '$effect', '$inspect', '$props', '$bindable']

function usesRune(source) {
    for (const name of RUNE_NAMES) {
        if (source.includes(name)) return true
    }
    return false
}

// Mirror tsconfig.json path mappings so contract tests can use the same
// @ / @lib / @components specifiers that src/ code uses.
const PATH_ALIASES = [
    { prefix: '@components/', target: pathResolve(PROJECT_ROOT, 'src', 'components') + sep },
    { prefix: '@lib/', target: pathResolve(PROJECT_ROOT, 'src', 'lib') + sep },
    { prefix: '@/', target: pathResolve(PROJECT_ROOT, 'src') + sep }
]

function resolveAlias(specifier) {
    for (const { prefix, target } of PATH_ALIASES) {
        if (specifier === prefix.slice(0, -1)) {
            return pathToFileURL(target).href
        }
        if (specifier.startsWith(prefix)) {
            const tail = specifier.slice(prefix.length).replace(/\//g, sep)
            return pathToFileURL(target + tail).href
        }
    }
    return null
}

export async function resolve(specifier, context, nextResolve) {
    // 1. Path alias resolution (matches tsconfig.json paths for @/ @lib/ @components/).
    if (
        !specifier.startsWith('node:') &&
        !specifier.startsWith('npm:') &&
        !specifier.startsWith('.') &&
        !specifier.startsWith('/')
    ) {
        const aliased = resolveAlias(specifier)
        if (aliased) {
            // Try as-is first, then with .ts appended (handles @lib/state/app.svelte → app.svelte.ts).
            const candidates = [aliased]
            const aliasedPathname = new URL(aliased).pathname
            if (!/\.[a-z]+$/i.test(aliasedPathname) || aliasedPathname.endsWith('.svelte')) {
                candidates.push(aliased.replace(/\/?$/, '/index.ts'))
                candidates.push(aliased.replace(/\/?$/, '.ts'))
            }
            for (const candidate of candidates) {
                try {
                    const result = await nextResolve(candidate, context)
                    if (process.env.TS_RESOLVE_DEBUG) console.error(`[ts-resolve] alias ${specifier} -> ${candidate}`)
                    return result
                } catch (err) {
                    if (process.env.TS_RESOLVE_DEBUG)
                        console.error(`[ts-resolve] alias miss for ${specifier} -> ${candidate}: ${err.message}`)
                    // try next candidate
                }
            }
            // Fall through to default + extension retry.
        } else if (process.env.TS_RESOLVE_DEBUG) {
            console.error(`[ts-resolve] no alias for ${specifier}`)
        }
    }

    try {
        return await nextResolve(specifier, context)
    } catch (err) {
        if (!['ERR_MODULE_NOT_FOUND', 'ERR_UNSUPPORTED_DIR_IMPORT'].includes(err.code)) throw err

        // Only retry for relative/absolute specifiers (not bare imports like 'node:fs')
        if (specifier.startsWith('node:') || specifier.startsWith('npm:')) throw err
        if (!specifier.startsWith('.') && !specifier.startsWith('/')) throw err

        // Try replacing .js extension with .ts
        if (specifier.endsWith('.js')) {
            const tsSpecifier = specifier.slice(0, -3) + '.ts'
            try {
                return await nextResolve(tsSpecifier, context)
            } catch {
                // Also try .mts for ESM TypeScript modules
                try {
                    return await nextResolve(specifier.slice(0, -3) + '.mts', context)
                } catch {
                    // Neither .ts nor .mts found — throw original error
                }
            }
        }

        // Try resolving directory imports the way Vite/TypeScript do.
        const ext = specifier.split('.').pop()
        if (!['js', 'ts', 'mjs', 'mts', 'json', 'cjs'].includes(ext)) {
            try {
                return await nextResolve(specifier.replace(/\/?$/, '/index.ts'), context)
            } catch {
                // ignore
            }

            // Try appending .ts if specifier has no extension
            try {
                return await nextResolve(specifier + '.ts', context)
            } catch {
                // ignore
            }
        }

        throw err
    }
}

export async function load(url, context, nextLoad) {
    if (process.env.TS_RESOLVE_DEBUG) console.error(`[ts-resolve] load ${url}`)
    if (url.includes('?worker&url')) {
        return {
            format: 'module',
            shortCircuit: true,
            source: `export default ${JSON.stringify(url)};\n`
        }
    }

    const result = await nextLoad(url, context)
    if (result.format !== 'module' && result.format !== 'module-typescript') {
        if (process.env.TS_RESOLVE_DEBUG) console.error(`[ts-resolve] load ${url} format=${result.format}`)
        return result
    }
    if (result.source != null && typeof result.source !== 'string') {
        result.source = Buffer.isBuffer(result.source)
            ? result.source.toString('utf8')
            : String(result.source)
    }
    if (process.env.TS_RESOLVE_DEBUG) {
        console.error(`[ts-resolve] load ${url} sourceType=${typeof result.source} hasState=${typeof result.source === 'string' && result.source.includes('$state')}`)
    }
    if (typeof result.source !== 'string') {
        return result
    }
    if (
        !url.startsWith(PROJECT_ROOT_URL) ||
        url.includes('/node_modules/') ||
        url === LOADER_URL ||
        url === SVELTE_RUNE_STUBS_URL
    ) {
        return result
    }

    // Idempotency guard: Node's ESM loader may invoke load() multiple times for
    // the same URL. Without this guard, a second call sees the $state from the
    // first call's prepended rune import, re-detects "runes" via usesRune(),
    // and prepends a DUPLICATE import — causing "Identifier '$state' has already
    // been declared" in source-text-module mode. If the source already contains
    // the stubs URL, it was transformed by a prior call; return unchanged.
    if (result.source.includes(SVELTE_RUNE_STUBS_URL)) {
        return result
    }

    let source = result.source
    const parts = []

    if (source.includes('import.meta.env')) {
        source = source.replace(VITE_ENV_RE, 'globalThis.__importMetaEnv')
        // The stubs module installs globalThis.__importMetaEnv as a side effect.
        parts.push(`import '${SVELTE_RUNE_STUBS_URL}';`)
    }

    if (usesRune(source)) {
        parts.push(`import { $state, $derived, $effect, $inspect, $props, $bindable } from '${SVELTE_RUNE_STUBS_URL}';`)
        if (process.env.TS_RESOLVE_DEBUG) console.error(`[ts-resolve] rune-import ${url}`)
    }

    if (parts.length > 0) {
        const prefix = parts.join('\n') + '\n'
        if (process.env.TS_RESOLVE_DEBUG) {
            const fs = await import('node:fs')
            const path = await import('node:path')
            const name = path.basename(new URL(url).pathname) || 'unknown'
            fs.writeFileSync(pathResolve(PROJECT_ROOT, 'tmp', `transformed-${name}`), prefix + source)
        }
        return { ...result, source: prefix + source }
    }

    return result
}

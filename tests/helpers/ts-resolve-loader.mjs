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

// ── Parameter-property normalization (loader hardening, 2026-08-10) ──────────
//
// Node 22.6+/v24's built-in TypeScript transform for .ts files is
// `--experimental-strip-types` (the default), which throws
//   "TypeScript parameter property is not supported in strip-only mode"
// when it sees `constructor(private|public|protected|readonly X: T)`. The
// project previously worked around this by hand-converting two such sites
// (`src/lib/stores/filter.svelte.ts` and `src/lib/data-store.ts`) to the
// explicit-field form. This pre-strip normalizer restores durability so
// any future parameter property (or any contract test fixture that uses
// one) loads successfully without touching src/ or package.json.
//
// The transform is the textually-equivalent of converting:
//   constructor(private compute: () => T, public id: string) { ... }
// into:
//   constructor(compute: () => T, id: string) {
//       this.compute = compute;
//       this.id = id;
//       ...
//   }
// which is the same shape a TypeScript compiler would emit for a parameter
// property when targeting an older JS runtime. Field accessibility
// (`private`/`public`/`protected`) is preserved by the original TypeScript
// checker when this code is also type-checked separately; here we only care
// that the runtime shape is correct so Node's stripper can finish.
//
// Cost: tiered fast path (regex screen → stateful scanner). The fast path
// is a no-op for any source without a modifier + identifier + (':', '=', or
// ')') token sequence, which excludes the vast majority of .ts files in
// this repo. The stateful scanner handles strings, template literals, and
// line/block comments correctly so function-type annotations like
// `private compute: () => T` don't trip the split-on-comma logic.

const PARAM_PROP_MODIFIERS = ['private', 'public', 'protected', 'readonly']
const PARAM_PROP_FAST_SCREEN = new RegExp(
    `\\b(?:${PARAM_PROP_MODIFIERS.join('|')})\\s+[A-Za-z_$][\\w$]*\\s*\\??\\s*[:=]`
)

function hasParameterProperty(source) {
    if (!PARAM_PROP_FAST_SCREEN.test(source)) return false
    // Cheap second screen: must contain a constructor declaration in the file
    // (otherwise the modifier is on a class field, not a parameter property).
    return /\bconstructor\s*\(/.test(source)
}

function skipStringLiteral(text, i) {
    // text[i] is the opening quote. Returns index just past the closing quote.
    const quote = text[i]
    let j = i + 1
    while (j < text.length) {
        if (text[j] === '\\') { j += 2; continue }
        if (text[j] === quote) return j + 1
        j++
    }
    return j
}

function skipTemplateLiteral(text, i) {
    // text[i] is the backtick. Returns index just past the closing backtick.
    let j = i + 1
    while (j < text.length) {
        const ch = text[j]
        if (ch === '\\') { j += 2; continue }
        if (ch === '`') return j + 1
        if (ch === '$' && text[j + 1] === '{') {
            // Nested expression — find matching `}` at the same nesting depth
            let depth = 1
            j += 2
            while (j < text.length && depth > 0) {
                const c = text[j]
                if (c === '{') depth++
                else if (c === '}') depth--
                else if (c === '"' || c === "'") j = skipStringLiteral(text, j) - 1
                else if (c === '`') j = skipTemplateLiteral(text, j) - 1
                j++
            }
            continue
        }
        j++
    }
    return j
}

function skipLineComment(text, i) {
    let j = i
    while (j < text.length && text[j] !== '\n') j++
    return j
}

function skipBlockComment(text, i) {
    let j = i + 2
    while (j < text.length - 1) {
        if (text[j] === '*' && text[j + 1] === '/') return j + 2
        j++
    }
    return text.length
}

// Skip a token sequence that may contain strings/templates/comments.
function skipTrivia(text, i) {
    while (i < text.length) {
        const ch = text[i]
        if (ch === '"' || ch === "'") { i = skipStringLiteral(text, i); continue }
        if (ch === '`') { i = skipTemplateLiteral(text, i); continue }
        if (ch === '/' && text[i + 1] === '/') { i = skipLineComment(text, i); continue }
        if (ch === '/' && text[i + 1] === '*') { i = skipBlockComment(text, i); continue }
        break
    }
    return i
}

function splitTopLevelCommas(text) {
    // Splits `text` on top-level commas, respecting nested parens, brackets,
    // braces, strings, template literals, and comments.
    const parts = []
    let depth = 0
    let start = 0
    let i = 0
    const N = text.length
    while (i < N) {
        const ch = text[i]
        if (ch === '(' || ch === '[' || ch === '{') {
            depth++
        } else if (ch === ')' || ch === ']' || ch === '}') {
            depth--
        } else if (ch === ',' && depth === 0) {
            parts.push(text.slice(start, i))
            start = i + 1
            i++
            continue
        } else if (ch === '"' || ch === "'") {
            i = skipStringLiteral(text, i)
            continue
        } else if (ch === '`') {
            i = skipTemplateLiteral(text, i)
            continue
        } else if (ch === '/' && text[i + 1] === '/') {
            i = skipLineComment(text, i)
            continue
        } else if (ch === '/' && text[i + 1] === '*') {
            i = skipBlockComment(text, i)
            continue
        }
        i++
    }
    parts.push(text.slice(start))
    return parts
}

function parseParameterProperty(paramDecl) {
    // Returns the parameter's identifier name + the declaration-with-modifier
    // stripped, or null if `paramDecl` is not a parameter property.
    //
    // Recognized shape: <modifier> (<modifier>)? <ident> [?] [':' <type>] ['=' <default>]
    // where <modifier> ∈ {private, public, protected, readonly}.
    // Modifiers may appear in either order (e.g. `private readonly foo` or
    // `readonly private foo`); the rest of the declaration (type, default,
    // trailing trivia) is preserved verbatim.
    const trimmed = paramDecl.replace(/^\s+/, '')
    if (!PARAM_PROP_MODIFIERS.includes(trimmed.split(/\s+/, 1)[0])) return null
    // Confirm we have an identifier immediately after the (optional 2nd) modifier.
    // We use a relaxed regex that accepts an identifier followed by an optional
    // `?` and then either `:`, `=`, `,` or `)` — if none of these follow, the
    // modifier is being used as a type expression in some other context and we
    // bail out.
    const m = /^((?:private|public|protected|readonly)\s+){1,2}([A-Za-z_$][\w$]*)\b([\s\S]*)$/.exec(trimmed)
    if (!m) return null
    const tail = m[3]
    // Tail must start with optional trivia then either `?` then `:`, or `=`,
    // or end here. If tail begins with anything that doesn't look like a
    // typed/optional/defaulted parameter (e.g. another keyword that isn't a
    // modifier), bail.
    const tailHead = tail.replace(/^\s+/, '')
    if (
        tailHead !== '' &&
        tailHead[0] !== ':' &&
        tailHead[0] !== '=' &&
        tailHead[0] !== '?' &&
        // Allow a trailing `)` / `,` after the identifier with no type — this
        // is the common case for `constructor(private x) {}` where the param
        // has no explicit type and is the last parameter.
        tailHead[0] !== ')' &&
        tailHead[0] !== ','
    ) {
        return null
    }
    return { name: m[2], stripped: m[2] + tail }
}

function normalizeParameterProperties(source) {
    if (!hasParameterProperty(source)) return source
    const out = []
    let i = 0
    const N = source.length
    const CTOR_HEAD = /\bconstructor\s*\(/
    while (i < N) {
        const m = CTOR_HEAD.exec(source.slice(i))
        if (!m) {
            out.push(source.slice(i))
            break
        }
        const ctorStart = i + m.index
        const ctorHeadEnd = ctorStart + m[0].length
        out.push(source.slice(i, ctorHeadEnd)) // up to and including `(`
        i = ctorHeadEnd // scanner now positioned at first char of params

        // Find matching `)` for the parameter list
        let depth = 1
        let j = i
        while (j < N && depth > 0) {
            j = skipTrivia(source, j)
            if (j >= N) break
            const ch = source[j]
            if (ch === '(') { depth++; j++; continue }
            if (ch === ')') { depth--; if (depth === 0) break; j++; continue }
            j++
        }
        if (depth !== 0) {
            // Malformed — give up on the rest of the file (better than corrupting it)
            out.push(source.slice(i))
            break
        }
        const parenEnd = j
        const paramText = source.slice(i, parenEnd)
        i = parenEnd + 1

        // Skip whitespace and trivia, then expect `{` (the constructor body).
        // If we see anything else (e.g. `;` for an abstract constructor), pass
        // through. skipTrivia handles strings/templates/comments; the
        // whitespace loop is needed because `)` may be followed by a newline
        // before the body opens.
        let k = skipTrivia(source, i)
        while (k < N && /\s/.test(source[k])) k++
        if (k >= N || source[k] !== '{') {
            // No body — pass the parameter list and the rest of the source
            // up to `k` through unchanged, then continue scanning.
            out.push(source.slice(ctorHeadEnd, k))
            i = k
            continue
        }
        // Find matching `}` for the constructor body
        let bodyDepth = 1
        let l = k + 1
        while (l < N && bodyDepth > 0) {
            l = skipTrivia(source, l)
            if (l >= N) break
            const ch = source[l]
            if (ch === '{') { bodyDepth++; l++; continue }
            if (ch === '}') { bodyDepth--; if (bodyDepth === 0) break; l++; continue }
            l++
        }
        if (bodyDepth !== 0) {
            out.push(paramText)
            out.push(source.slice(i, k + 1))
            i = k + 1
            continue
        }
        const bodyEnd = l
        const bodyText = source.slice(k + 1, bodyEnd)

        // Parse each parameter, normalize, and collect any required assignments.
        const params = splitTopLevelCommas(paramText)
        const newParams = []
        const assignments = []
        let modified = false
        for (const param of params) {
            // Preserve original whitespace by splitting on the first non-space
            // boundary we can find. parseParameterProperty handles the
            // leading-trim case; we reattach leading whitespace below.
            const leadingMatch = /^(\s*)([\s\S]*)$/.exec(param)
            const leading = leadingMatch[1]
            const body_ = leadingMatch[2]
            const trailingMatch = /^([\s\S]*?)(\s*)$/.exec(body_)
            const head = trailingMatch[1]
            const trailing = trailingMatch[2]
            if (head === '') {
                newParams.push(leading + trailing)
                continue
            }
            const prop = parseParameterProperty(head)
            if (prop) {
                modified = true
                newParams.push(leading + prop.stripped + trailing)
                assignments.push(`this.${prop.name} = ${prop.name};`)
            } else {
                newParams.push(param)
            }
        }

        if (modified) {
            if (process.env.TS_RESOLVE_DEBUG) console.error(`[ts-resolve] norm MODIFIED branch ctorHeadEnd=${ctorHeadEnd} bodyEnd=${bodyEnd} newParams=${JSON.stringify(newParams)}`)
            // Re-emit the constructor with normalized parameters and an
            // assignment prologue in the body. We preserve the exact body
            // text so user formatting inside the constructor is untouched.
            out.push(newParams.join(','))
            out.push('){')
            if (assignments.length > 0) {
                out.push(assignments.join(''))
            }
            out.push(bodyText)
            out.push('}')
            i = bodyEnd + 1
        } else {
            // No parameter properties — pass the constructor through unchanged.
            // Reconstruct from the original source slice so the exact
            // constructor bytes (including the `(` we already pushed and the
            // trivia between `)` and `{`) are preserved.
            if (process.env.TS_RESOLVE_DEBUG) console.error(`[ts-resolve] NO-MOD ctorHeadEnd=${ctorHeadEnd} bodyEnd=${bodyEnd} slice=${JSON.stringify(source.slice(ctorHeadEnd, bodyEnd + 1))}`)
            out.push(source.slice(ctorHeadEnd, bodyEnd + 1))
            i = bodyEnd + 1
        }
    }
    return out.join('')
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

    // Parameter-property normalization (loader hardening, 2026-08-10):
    // Node's built-in --experimental-strip-types throws on
    // `constructor(private|public|protected|readonly X)`. Normalize before
    // handing the source to the stripper. Only applies to TS files in the
    // project root (the rest of the guard is already enforced above).
    if (result.format === 'module-typescript') {
        source = normalizeParameterProperties(source)
    }

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

    // No env/runes prepending needed, but we may still have normalized
    // parameter properties above. Return the updated `source` so the
    // stripper receives the rewritten text.
    if (source !== result.source) {
        return { ...result, source }
    }
    return result
}

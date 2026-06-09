/**
 * ts-resolve-loader.mjs
 *
 * Custom Node ESM resolve hook that falls back to `.ts` when a `.js` specifier
 * cannot be found. This bridges the gap between TypeScript source files (which
 * use `.js` import specifiers for bundler compatibility) and Node ESM (which
 * resolves specifiers literally).
 *
 * Used by the contract test runner to execute .mjs tests that transitively
 * import from js/modules/*.ts files.
 */

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err.code !== 'ERR_MODULE_NOT_FOUND') throw err;

    // Only retry for relative/absolute specifiers (not bare imports like 'node:fs')
    if (specifier.startsWith('node:') || specifier.startsWith('npm:')) throw err;
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) throw err;

    // Try replacing .js extension with .ts
    if (specifier.endsWith('.js')) {
      const tsSpecifier = specifier.slice(0, -3) + '.ts';
      try {
        return await nextResolve(tsSpecifier, context);
      } catch {
        // Also try .mts for ESM TypeScript modules
        try {
          return await nextResolve(specifier.slice(0, -3) + '.mts', context);
        } catch {
          // Neither .ts nor .mts found — throw original error
        }
      }
    }

    // Try appending .ts if specifier has no extension
    const ext = specifier.split('.').pop();
    if (!['js', 'ts', 'mjs', 'mts', 'json', 'cjs'].includes(ext)) {
      try {
        return await nextResolve(specifier + '.ts', context);
      } catch {
        // ignore
      }
    }

    throw err;
  }
}

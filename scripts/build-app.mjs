// @ts-check
import { readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { compile } from 'svelte/compiler';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const watch = process.argv.includes('--watch');

/** @param {string} text */
function normalizeGeneratedBundleText(text) {
    return text.replace(/[ \t]+(?=\r?\n)/g, '');
}

async function normalizeGeneratedBundle() {
    const bundlePath = 'dist/bundle.js';
    const text = await readFile(bundlePath, 'utf8');
    const normalized = normalizeGeneratedBundleText(text);
    if (normalized !== text) await writeFile(bundlePath, normalized);
}

/** @type {import('esbuild').Plugin} */
const sveltePlugin = {
    name: 'semantic-demo-svelte',
    setup(build) {
        build.onLoad({ filter: /\.svelte$/ }, async (args) => {
            const source = await readFile(args.path, 'utf8');
            const compiled = compile(source, {
                filename: args.path,
                generate: 'client',
                css: 'injected',
                dev: false
            });

            return {
                contents: compiled.js.code,
                loader: 'js',
                resolveDir: dirname(args.path),
                warnings: compiled.warnings.map((warning) => ({
                    text: warning.message,
                    location: warning.start
                        ? {
                            file: args.path,
                            line: warning.start.line,
                            column: warning.start.column
                        }
                        : undefined
                }))
            };
        });
    }
};

/** @type {import('esbuild').BuildOptions} */
const options = {
    entryPoints: ['js/modules/app.js'],
    bundle: true,
    minify: !watch,
    keepNames: true,
    outfile: 'dist/bundle.js',
    target: 'es2020',
    format: 'esm',
    external: ['three', 'three/*'],
    plugins: [
        sveltePlugin,
        {
            name: 'semantic-demo-bundle-hygiene',
            setup(build) {
                build.onEnd(async (result) => {
                    if (result.errors.length === 0) await normalizeGeneratedBundle();
                });
            }
        }
    ],
    absWorkingDir: ROOT,
    logLevel: 'info'
};

if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('[build-app] watching js/modules/app.js and Svelte islands...');
} else {
    await esbuild.build(options);
}

// @ts-check
import { readFile, writeFile } from 'node:fs/promises';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import * as esbuild from 'esbuild';
import { compile } from 'svelte/compiler';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const cliArgs = process.argv.slice(2);
const watch = cliArgs.includes('--watch');
const typecheck = cliArgs.includes('--typecheck');
const tsReadiness = cliArgs.includes('--ts-readiness');

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

// ── TS Migration Readiness ─────────────────────────────────────────────────
// Reports current TypeScript migration coverage and app.ts entry readiness.
// This is a read-only diagnostic; the active build entry is defined below.

/**
 * Scan a directory for .ts and .js files and classify them.
 * @param {string} modulesDir
 * @returns {{ tsFiles: string[], jsFiles: string[], tsOnlyModules: string[], jsOnlyModules: string[], dualModules: string[] }}
 */
function scanModuleDir(modulesDir) {
    const entries = fs.readdirSync(modulesDir, { withFileTypes: true });

    /** @type {string[]} */
    const tsFiles = [];
    /** @type {string[]} */
    const jsFiles = [];
    /** @type {string[]} */
    const tsOnlyModules = [];
    /** @type {string[]} */
    const jsOnlyModules = [];
    /** @type {string[]} */
    const dualModules = [];

    for (const entry of entries) {
        if (!entry.isFile()) continue;
        const name = entry.name;
        if (name.endsWith('.d.ts')) continue;

        if (name.endsWith('.ts')) {
            tsFiles.push(name);
            const base = name.slice(0, -3);
            const jsSibling = join(modulesDir, base + '.js');
            if (fs.existsSync(jsSibling)) {
                dualModules.push(base);
            } else {
                tsOnlyModules.push(base);
            }
        } else if (name.endsWith('.js')) {
            jsFiles.push(name);
            const base = name.slice(0, -3);
            const tsSibling = join(modulesDir, base + '.ts');
            if (!fs.existsSync(tsSibling)) {
                jsOnlyModules.push(base);
            }
        }
    }

    return { tsFiles, jsFiles, tsOnlyModules, jsOnlyModules, dualModules };
}

/**
 * Recursively scan js/modules/ for migration readiness.
 * Skips components/ (Svelte, not in scope for JS→TS migration).
 * @param {string} modulesDir
 * @returns {{ tsFiles: string[], jsFiles: string[], tsOnlyModules: string[], jsOnlyModules: string[], dualModules: string[] }}
 */
function computeTsReadiness(modulesDir) {
    const result = scanModuleDir(modulesDir);

    const entries = fs.readdirSync(modulesDir, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name === 'node_modules' || entry.name === 'components') continue;
        const sub = computeTsReadiness(join(modulesDir, entry.name));
        result.tsFiles.push(...sub.tsFiles);
        result.jsFiles.push(...sub.jsFiles);
        result.tsOnlyModules.push(...sub.tsOnlyModules);
        result.jsOnlyModules.push(...sub.jsOnlyModules);
        result.dualModules.push(...sub.dualModules);
    }

    return result;
}

/**
 * Check whether app.js's direct imports could resolve if the entry flipped to app.ts.
 * @returns {{ hasAppJs: boolean, hasAppTs: boolean, totalImports: number, readyImports: number, blockedImports: string[], entryReady: boolean }}
 */
function checkEntryReadiness() {
    const appJsPath = join(ROOT, 'js', 'modules', 'app.js');
    const appTsPath = join(ROOT, 'js', 'modules', 'app.ts');

    const hasAppJs = fs.existsSync(appJsPath);
    const hasAppTs = fs.existsSync(appTsPath);

    if (!hasAppJs) {
        return { hasAppJs: false, hasAppTs, totalImports: 0, readyImports: 0, blockedImports: [], entryReady: false };
    }

    // Check if all of app.js's direct imports have .ts siblings.
    // Keep this aligned with tests/ts-js-drift-contract.mjs --progress.
    const appSource = fs.readFileSync(appJsPath, 'utf8');
    const importPatterns = [
        /from\s+['"]\.\/([\w/-]+)(?:\.js)?['"]/g,
        /import\s+['"]\.\/([\w/-]+)(?:\.js)?['"]/g,
    ];
    /** @type {{ name: string, hasTs: boolean }[]} */
    const imports = [];
    const seenImports = new Set();
    for (const importPattern of importPatterns) {
        let match;
        while ((match = importPattern.exec(appSource)) !== null) {
            const captured = match[1];
            if (!captured) continue;
            if (seenImports.has(captured)) continue;
            seenImports.add(captured);
            const tsPath = join(ROOT, 'js', 'modules', ...captured.split('/')) + '.ts';
            imports.push({ name: captured, hasTs: fs.existsSync(tsPath) });
        }
    }

    const readyImports = imports.filter(i => i.hasTs).length;
    const blockedImports = imports.filter(i => !i.hasTs);

    return {
        hasAppJs,
        hasAppTs,
        totalImports: imports.length,
        readyImports,
        blockedImports: blockedImports.map(i => i.name),
        entryReady: blockedImports.length === 0 && hasAppJs && hasAppTs,
    };
}

if (tsReadiness) {
    const modulesDir = join(ROOT, 'js', 'modules');
    const readiness = computeTsReadiness(modulesDir);
    const entry = checkEntryReadiness();

    const total = readiness.tsFiles.length + readiness.jsOnlyModules.length;
    const coverage = total > 0 ? ((readiness.tsFiles.length / total) * 100).toFixed(1) : '0.0';

    console.log('\n── TS Migration Readiness Report ──\n');
    console.log(`  TS files:              ${readiness.tsFiles.length}`);
    console.log(`  JS-only files:         ${readiness.jsOnlyModules.length}`);
    console.log(`  Dual (TS+JS) modules:  ${readiness.dualModules.length}`);
    console.log(`  TS-native modules:     ${readiness.tsOnlyModules.length}`);
    console.log(`  TS coverage:           ${coverage}% of runtime modules`);
    console.log('');
    console.log(`  app.js exists:         ${entry.hasAppJs}`);
    console.log(`  app.ts exists:         ${entry.hasAppTs}`);
    console.log(`  Entry imports:         ${entry.readyImports}/${entry.totalImports} ready`);
    if (entry.blockedImports.length > 0) {
        console.log(`  Blocked imports:       ${entry.blockedImports.join(', ')}`);
    }
    console.log(`  Entry ready for flip:  ${entry.entryReady ? 'YES' : 'NO'}`);
    console.log('');

    if (readiness.jsOnlyModules.length > 0) {
        console.log('  JS-only modules (need TS conversion):');
        for (const m of readiness.jsOnlyModules.sort()) {
            console.log(`    - ${m}`);
        }
        console.log('');
    }

    process.exit(0);
}

// ── Typecheck Gate ─────────────────────────────────────────────────────────
// When --typecheck is passed, run `tsc --noEmit` before the esbuild step.
// This prevents type errors from reaching the bundle silently.

if (typecheck) {
    console.log('[build-app] running typecheck before build...');
    try {
        // On Windows, .cmd files need shell:true; construct single command string to avoid DEP0190
        const isWin = process.platform === 'win32';
        if (isWin) {
            execFileSync('cmd', ['/c', 'npm', 'run', 'typecheck'], {
                cwd: ROOT,
                stdio: 'inherit',
                timeout: 60_000,
            });
        } else {
            execFileSync('npm', ['run', 'typecheck'], {
                cwd: ROOT,
                stdio: 'inherit',
                timeout: 60_000,
            });
        }
        console.log('[build-app] typecheck passed.');
    } catch {
        console.error('\n[build-app] typecheck FAILED. Build aborted.');
        console.error('Fix type errors or run without --typecheck to skip.\n');
        process.exit(1);
    }
}

// ── Build ──────────────────────────────────────────────────────────────────

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
    entryPoints: ['js/modules/app.ts'],
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
    console.log('[build-app] watching js/modules/app.ts and Svelte islands...');
} else {
    await esbuild.build(options);
}

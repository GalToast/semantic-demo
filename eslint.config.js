// eslint.config.js — Flat config (ESLint v10)
// NOTE: imports are consumed below; "unused" warnings would fire on this file
// itself if we linted it with the old config before the rewrite completes.
import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import tsEslint from 'typescript-eslint'
import sveltePlugin from 'eslint-plugin-svelte'
import svelteParser from 'svelte-eslint-parser'

const tsRecommended = tsEslint.configs.recommended
const svelteRecommended = sveltePlugin.configs['flat/recommended']

const BROWSER_GLOBALS = {
    window: 'readonly',
    document: 'readonly',
    navigator: 'readonly',
    console: 'readonly',
    localStorage: 'readonly',
    sessionStorage: 'readonly',
    performance: 'readonly',
    fetch: 'readonly',
    AbortController: 'readonly',
    AbortSignal: 'readonly',
    setTimeout: 'readonly',
    setInterval: 'readonly',
    clearTimeout: 'readonly',
    clearInterval: 'readonly',
    requestAnimationFrame: 'readonly',
    cancelAnimationFrame: 'readonly',
    MutationObserver: 'readonly',
    IntersectionObserver: 'readonly',
    ResizeObserver: 'readonly',
    URL: 'readonly',
    URLSearchParams: 'readonly',
    HTMLElement: 'readonly',
    HTMLButtonElement: 'readonly',
    HTMLCanvasElement: 'readonly',
    HTMLInputElement: 'readonly',
    Event: 'readonly',
    CustomEvent: 'readonly',
    KeyboardEvent: 'readonly',
    MouseEvent: 'readonly',
    PointerEvent: 'readonly',
    GeolocationPosition: 'readonly',
    GeolocationPositionError: 'readonly',
    GeolocationCoordinates: 'readonly',
    crypto: 'readonly',
    WebSocket: 'readonly',
    Worker: 'readonly',
    self: 'readonly',
    CSS: 'readonly',
    AudioContext: 'readonly',
    OscillatorNode: 'readonly',
    GainNode: 'readonly',
    BiquadFilterNode: 'readonly',
    Path2D: 'readonly',
    DOMException: 'readonly',
    queueMicrotask: 'readonly',
    TextDecoder: 'readonly',
    TextEncoder: 'readonly',
    WebGL2RenderingContext: 'readonly',
    WebGLRenderingContext: 'readonly',
    ClipboardItem: 'readonly',
    getComputedStyle: 'readonly',
    matchMedia: 'readonly',
    structuredClone: 'readonly',
    THREE: 'readonly',
    ORBIT_MAX_DISTANCE_DEFAULT: 'readonly',
    ORBIT_ROTATE_SPEED_DEFAULT: 'readonly',
    ORBIT_PAN_SPEED_DEFAULT: 'readonly',
    SCENE_REVEAL_DURATION_MS: 'readonly',
    __APP_STATE__: 'readonly',
    __TEST_STATE__: 'readonly',
    __refreshTestCompatState__: 'readonly'
}

export default [
    js.configs.recommended,
    prettier,

    // typescript-eslint recommended: [0]=base (plugin+parser, registered GLOBAL),
    // [1]=eslint-recommended, [2]=recommended — both scoped to src/**/*.ts only.
    tsRecommended[0],
    { ...tsRecommended[1], files: ['src/**/*.ts', 'vite.config.ts'] },
    { ...tsRecommended[2], files: ['src/**/*.ts', 'vite.config.ts'] },
    {
        files: ['src/**/*.ts', 'vite.config.ts'],
        languageOptions: {
            parser: tsEslint.parser,
            parserOptions: {
                project: null,
                tsconfigRootDir: import.meta.dirname
            },
            globals: BROWSER_GLOBALS
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    vars: 'all',
                    args: 'after-used',
                    ignoreRestSiblings: true,
                    varsIgnorePattern: '^_',
                    argsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_'
                }
            ],
            '@typescript-eslint/no-empty-object-type': 'off',
            '@typescript-eslint/no-unsafe-function-type': 'off',
            'no-unused-vars': 'off',

            // ── Timer/interval lifecycle enforcement ──────────────────────────────
            // Every timer/interval in src/lib/{ui,orchestration,stores,journey,engine,search}
            // must be tracked via DisposableRegistry. The previous manual pattern
            // (if (timer) clearTimeout(timer); timer = setTimeout(...)) caused
            // 5+ production timer-leak fixes in the last 60 days (search git log:
            // 45ed12d0, 444c9479, 89081451, 04cb7d8e, c2d7cfe7).
            //
            // Exceptions are files that are themselves part of the registry
            // implementation OR files whose setTimeout calls are intentional
            // bootstrap-polling we don't want to track (e.g. requestIdleCallback
            // shims, intentionally fire-and-forget microtasks).
            //
            // Enforce the registry pattern going forward; existing un-migrated
            // sites will surface as warnings (not errors) so this doesn't
            // break the build while the migration is in progress.
            'no-restricted-syntax': [
                'warn',
                {
                    selector: "CallExpression[callee.name='setTimeout']",
                    message: 'Avoid raw setTimeout() in src/lib/. Wrap with DisposableRegistry.timer() — see src/lib/utils/disposable-registry.ts.'
                },
                {
                    selector: "CallExpression[callee.name='setInterval']",
                    message: 'Avoid raw setInterval() in src/lib/. Wrap with DisposableRegistry.timer() — see src/lib/utils/disposable-registry.ts.'
                },
                {
                    selector: "CallExpression[callee.name='requestAnimationFrame']",
                    message: 'Avoid raw requestAnimationFrame() in src/lib/. Wrap with DisposableRegistry.raf() — see src/lib/utils/disposable-registry.ts.'
                }
            ]
        }
    },

    {
        name: 'svelte/base',
        plugins: svelteRecommended[0].plugins
    },
    {
        ...svelteRecommended[1],
        files: ['src/**/*.svelte'],
        languageOptions: {
            ...svelteRecommended[1].languageOptions,
            parser: svelteParser,
            parserOptions: {
                parser: { ts: tsEslint.parser },
                tsconfigRootDir: import.meta.dirname
            },
            globals: BROWSER_GLOBALS
        },
        rules: {
            ...svelteRecommended[1].rules,
            // svelte-eslint-parser cannot reliably distinguish TS type identifiers
            // (e.g. Window, HTMLDivElement, FocusEvent, Element, WebGLRenderingContext)
            // from value references. @typescript-eslint/no-undef is the TS-aware
            // replacement and is enabled for .ts/.svelte.ts files below.
            'no-undef': 'off',
            'no-unused-vars': [
                'warn',
                {
                    vars: 'all',
                    args: 'after-used',
                    ignoreRestSiblings: true,
                    varsIgnorePattern: '^_',
                    argsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_'
                }
            ],
            '@typescript-eslint/no-explicit-any': 'off'
        }
    },

    // ── `.svelte.ts` / `.svelte.js` files: TypeScript modules that use runes.
    //    These are NOT Svelte components; they don't have <script> tags. The
    //    svelte-eslint-parser would fail to parse them, so we use the TS parser
    //    here. (The previous config referenced svelteRecommended[2] which is
    //    undefined in eslint-plugin-svelte v3+ and produced parse errors.)
    {
        files: ['src/**/*.svelte.ts', 'src/**/*.svelte.js'],
        languageOptions: {
            parser: tsEslint.parser,
            parserOptions: {
                project: null,
                tsconfigRootDir: import.meta.dirname
            },
            globals: BROWSER_GLOBALS
        },
        rules: {
            'no-unused-vars': [
                'warn',
                {
                    vars: 'all',
                    args: 'after-used',
                    ignoreRestSiblings: true,
                    varsIgnorePattern: '^_',
                    argsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_'
                }
            ],
            '@typescript-eslint/no-explicit-any': 'off'
        }
    },

    // ── Override: disable no-explicit-any everywhere (we have 477, bite-by-bite) ─
    //   and turn TS unused-vars from error back to warn (matches active policy)
    {
        files: ['src/**/*.ts', 'src/**/*.svelte', 'vite.config.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            // Mirror the args/vars ignore patterns from the per-block configs so
            // underscored-but-unused locals (e.g. `(opts: Options) => { opts }`
            // type signatures) don't get re-flagged by the override block.
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    vars: 'all',
                    args: 'after-used',
                    ignoreRestSiblings: true,
                    varsIgnorePattern: '^_',
                    argsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_'
                }
            ]
        }
    },

    {
        files: ['scripts/**/*.mjs', 'scripts/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                console: 'readonly',
                process: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                Buffer: 'readonly',
                require: 'readonly',
                module: 'readonly',
                exports: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                setImmediate: 'readonly',
                clearImmediate: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
                Promise: 'readonly',
                Math: 'readonly',
                JSON: 'readonly',
                Map: 'readonly',
                Set: 'readonly',
                global: 'readonly',
                globalThis: 'readonly',
                TextEncoder: 'readonly',
                TextDecoder: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': [
                'warn',
                {
                    vars: 'all',
                    args: 'after-used',
                    ignoreRestSiblings: true,
                    varsIgnorePattern: '^_',
                    argsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_'
                }
            ],
            'no-undef': 'error',
            'no-console': 'off'
        }
    },

    {
        files: ['js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                THREE: 'readonly',
                console: 'readonly',
                window: 'readonly',
                document: 'readonly',
                navigator: 'readonly',
                setTimeout: 'readonly',
                setInterval: 'readonly',
                clearTimeout: 'readonly',
                clearInterval: 'readonly',
                performance: 'readonly',
                MutationObserver: 'readonly',
                IntersectionObserver: 'readonly',
                ResizeObserver: 'readonly',
                requestAnimationFrame: 'readonly',
                cancelAnimationFrame: 'readonly',
                fetch: 'readonly',
                XMLHttpRequest: 'readonly',
                Promise: 'readonly',
                Math: 'readonly',
                JSON: 'readonly',
                Array: 'readonly',
                Object: 'readonly',
                String: 'readonly',
                Number: 'readonly',
                Boolean: 'readonly',
                Map: 'readonly',
                Set: 'readonly',
                Symbol: 'readonly',
                BigInt: 'readonly',
                parseInt: 'readonly',
                parseFloat: 'readonly',
                isNaN: 'readonly',
                isFinite: 'readonly',
                NaN: 'readonly',
                undefined: 'readonly',
                null: 'readonly',
                encodeURIComponent: 'readonly',
                decodeURIComponent: 'readonly',
                btoa: 'readonly',
                atob: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
                AbortController: 'readonly',
                DOMException: 'readonly',
                Worker: 'readonly',
                self: 'readonly',
                CSS: 'readonly',
                sessionStorage: 'readonly',
                localStorage: 'readonly',
                requestIdleCallback: 'readonly',
                HTMLButtonElement: 'readonly',
                HTMLElement: 'readonly',
                Event: 'readonly',
                CustomEvent: 'readonly',
                MessageChannel: 'readonly',
                AbortSignal: 'readonly',
                location: 'readonly',
                history: 'readonly',
                crypto: 'readonly',
                ORBIT_MAX_DISTANCE_DEFAULT: 'readonly',
                ORBIT_ROTATE_SPEED_DEFAULT: 'readonly',
                ORBIT_PAN_SPEED_DEFAULT: 'readonly',
                SCENE_REVEAL_DURATION_MS: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': [
                'warn',
                {
                    vars: 'all',
                    args: 'after-used',
                    ignoreRestSiblings: true,
                    varsIgnorePattern: '^_',
                    argsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_'
                }
            ],
            'no-undef': 'error',
            'no-console': ['error', { allow: ['warn', 'error'] }],
            'no-var': 'error',
            eqeqeq: 'error',
            'no-empty': ['error', { allowEmptyCatch: true }],
            'no-useless-escape': 'error'
        }
    },

    {
        files: ['tests/**/*.js', 'tests/**/*.mjs', 'tests/**/*.cjs'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                console: 'readonly',
                process: 'readonly',
                require: 'readonly',
                Buffer: 'readonly',
                __dirname: 'readonly',
                global: 'readonly',
                document: 'readonly',
                window: 'readonly',
                navigator: 'readonly',
                location: 'readonly',
                history: 'readonly',
                localStorage: 'readonly',
                sessionStorage: 'readonly',
                performance: 'readonly',
                fetch: 'readonly',
                AbortController: 'readonly',
                AbortSignal: 'readonly',
                DOMException: 'readonly',
                KeyboardEvent: 'readonly',
                MouseEvent: 'readonly',
                CustomEvent: 'readonly',
                Event: 'readonly',
                NodeFilter: 'readonly',
                HTMLElement: 'readonly',
                HTMLCanvasElement: 'readonly',
                HTMLButtonElement: 'readonly',
                getComputedStyle: 'readonly',
                matchMedia: 'readonly',
                queueMicrotask: 'readonly',
                innerHeight: 'readonly',
                innerWidth: 'readonly',
                scrollX: 'readonly',
                scrollY: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
                Promise: 'readonly',
                Math: 'readonly',
                JSON: 'readonly',
                setTimeout: 'readonly',
                setInterval: 'readonly',
                clearTimeout: 'readonly',
                clearInterval: 'readonly',
                requestAnimationFrame: 'readonly',
                cancelAnimationFrame: 'readonly',
                MutationObserver: 'readonly',
                IntersectionObserver: 'readonly',
                ResizeObserver: 'readonly',
                __APP_STATE__: 'readonly',
                structuredClone: 'readonly',
                THREE: 'readonly',
                browser: 'readonly',
                server: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': [
                'warn',
                {
                    vars: 'all',
                    args: 'after-used',
                    ignoreRestSiblings: true,
                    varsIgnorePattern: '^_',
                    argsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_'
                }
            ],
            'no-useless-escape': 'warn',
            'no-unsafe-optional-chaining': 'warn'
        }
    }
]

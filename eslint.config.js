// eslint.config.js
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';

export default [
    js.configs.recommended,
    prettier,
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
            'no-unused-vars': ['warn', {
                vars: 'all',
                args: 'after-used',
                ignoreRestSiblings: true,
                varsIgnorePattern: '^_',
                argsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_'
            }],
            'no-undef': 'error',
            'no-console': ['error', { allow: ['warn', 'error'] }],
            'no-var': 'error',
            'eqeqeq': 'error',
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
                // Node globals
                console: 'readonly',
                process: 'readonly',
                require: 'readonly',
                Buffer: 'readonly',
                __dirname: 'readonly',
                global: 'readonly',
                // Browser globals (used in page.evaluate callbacks and JSDOM)
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
                // Project-internal: app exposes these for the visual QA suite
                __APP_STATE__: 'readonly',
                // Three.js: exposed at window.THREE in production; test code
                // that runs in page.evaluate() bodies references it bare
                THREE: 'readonly',
                // Playwright fixtures (available in spec files via test runner)
                browser: 'readonly',
                server: 'readonly'
            }
        },
        rules: {
            // Tests legitimately import many setup helpers that may not be
            // used in every test. Downgrade to warn so lint output is
            // actionable instead of noisy.
            'no-unused-vars': ['warn', {
                vars: 'all',
                args: 'after-used',
                ignoreRestSiblings: true,
                varsIgnorePattern: '^_',
                argsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_'
            }],
            // Regex tests often have intentional escaping; defensive optional
            // chaining in test setup is also a real pattern. Warn, don't error.
            'no-useless-escape': 'warn',
            'no-unsafe-optional-chaining': 'warn'
        }
    }
    // NOTE: tests/micro-demo-verify.js has 43 false-positive no-undef
    // errors at wrong line numbers due to an ESLint v10 shebang-handling
    // bug. The flat-config per-file rule override (no-undef: 'off') does
    // NOT resolve it. Options: (a) live with the 43 false positives,
    // (b) remove the shebang, (c) downgrade to ESLint v9, (d) patch
    // ESLint itself. Investigated in commit 5f9bd0c; see follow-up note
    // in AGENTS.md.
];

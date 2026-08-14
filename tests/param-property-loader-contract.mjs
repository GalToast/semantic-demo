/**
 * ts-resolve-loader parameter-property regression contract (W-109 / board task 109)
 *
 * Node's strip-only TypeScript mode rejects parameter properties at runtime
 * ("TypeScript parameter property is not supported in strip-only mode"). The
 * loader (tests/helpers/ts-resolve-loader.mjs) pre-strips them into explicit
 * field-assignments BEFORE Node's stripper sees them. This contract pins that
 * durable behavior so a future loader regression cannot silently re-break the
 * lifecycle/aria contract chain that depends on classes with parameter
 * properties.
 *
 * Run: node tests/param-property-loader-contract.mjs
 * (uses register() in-process — no --experimental-strip-types needed here
 *  because the loader normalizes the source before Node parses it).
 */

import { register } from 'node:module'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Register the repo's alias/strip loader so .ts fixture imports resolve and
// parameter properties are normalized before Node's module system parses them.
const tsResolve = new URL('./helpers/ts-resolve-loader.mjs', import.meta.url)
register(tsResolve, import.meta.url)

const fixtureUrl = new URL('./fixtures/param-prop-fixture.ts', import.meta.url)

let passed = 0
let failed = 0
function assert(cond, msg) {
    if (cond) {
        passed++
        console.log(`  ✓ ${msg}`)
    } else {
        failed++
        console.error(`  ✗ ${msg}`)
    }
}

function assertThrows(fn, msg) {
    try {
        fn()
        failed++
        console.error(`  ✗ ${msg} (expected throw, none happened)`)
    } catch {
        passed++
        console.log(`  ✓ ${msg}`)
    }
}

// Wrap in async so dynamic import of the .ts fixture is legal in ESM.
const run = async () => {
    console.log('[param-prop-loader-contract] loading fixture through ts-resolve-loader…')

    const mod = await import(fixtureUrl.href)

    // 1. private foo: string
    const priv = new mod.TestParamPropPrivate('hello')
    assert(priv.getFoo() === 'hello', 'private foo: string → getFoo() === "hello"')
    assert(
        priv.foo === 'hello',
        'private param stored as own field (TS parameter-property semantics — loader must preserve)'
    )

    // 2. public x = 1, private y: number — explicit args
    const pub = new mod.TestParamPropPublicDefault(42, 99)
    assert(pub.x === 42, 'public x: number = 42 migrated to own field')
    assert(pub.getY() === 99, 'private y: number = 99 migrated to own field')

    // 3. public x = 1 default (no args)
    const pubDefault = new mod.TestParamPropPublicDefault()
    assert(pubDefault.x === 1, 'public x defaults to 1 when no arg passed')
    assert(pubDefault.getY() === undefined, 'private y: number w/o arg yields undefined (stripper-safe)')

    // 4. readonly id: string
    const ro = new mod.TestParamPropReadonly('abc123')
    assert(ro.getId() === 'abc123', 'readonly id: string → getId() === "abc123"')
    assert(ro.id === 'abc123', 'readonly id exposed as own field (readonly → field assignment)')

    // 5. plain constructor (no parameter property) still works
    const plain = new mod.TestNoParamProp(7)
    assert(plain.getVal() === 7, 'control: plain ctor (val: number) — parameter-property-free path unaffected')

    // 6. multiple private params + body call still executes
    const multi = new mod.TestMultiParamProp('a', 1, true)
    assert(
        multi.getA() === 'a' && multi.getB() === 1 && multi.getFlag() === true,
        'multi private params (string, number, boolean) all mapped'
    )

    // 7. defaulted-parameter class (plain ctor preserved verbatim)
    const defOnly = new mod.TestDefaultThenPrivate('z')
    assert(defOnly.opt === 'z', 'plain ctor (defaulted param) passes value through unchanged')
    assert(defOnly.getFlag() === true, 'plain ctor non-param-property path unaffected by normalizer')

    // 8-11. loader-fragile edge shapes (Q3 coverage from external audit): combined
    // modifiers, protected, arrow-type params, and type+default-on-modifier.
    const comb = new mod.EdgeCombinedMods(42)
    assert(comb.get() === 42, 'combined private readonly id: number → preserved and readable')

    const prot = new mod.EdgeProtectedParam('guard')
    assert(prot.getName() === 'guard', 'protected param → method reads it correctly')

    const arrow = new mod.EdgeArrowFnParam(() => 7)
    assert(arrow.run() === 7, 'arrow-fn param (() => number) → parens-scanner handles it')

    const suff = new mod.EdgeTypedDefault(9)
    assert(suff.getY() === 9, 'type+default param with explicit arg')
    const bare = new mod.EdgeTypedDefault()
    assert(bare.getY() === 5, 'type+default param with no arg → default 5')

    console.log(`\n[RESULT] param-prop-loader-contract: ${passed} passed, ${failed} failed`)
    if (failed > 0) process.exitCode = 1
}

// top-level await in mjs
run()

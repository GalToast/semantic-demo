#!/usr/bin/env node
/**
 * param-property-loader-sweep.mjs
 *
 * Consolidated ts-resolve-loader parameter-property regression contract —
 * replaces param-property-loader-contract.mjs (119 LOC → ~90 LOC).
 *
 * This sweep loads .ts fixtures through the ts-resolve-loader to verify
 * that parameter properties are normalized before Node's strip-only
 * TypeScript mode sees them.
 *
 * Run: node tests/param-property-loader-sweep.mjs
 */

'use strict'

import { register } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Register the repo's alias/strip loader so .ts fixture imports resolve and
// parameter properties are normalized before Node's module system parses them.
const tsResolve = new URL('./helpers/ts-resolve-loader.mjs', import.meta.url)
register(tsResolve, import.meta.url)

const fixtureUrl = new URL('./fixtures/param-prop-fixture.ts', import.meta.url)

let passed = 0
let failed = 0
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`) }
    else { failed++; console.error(`  ✗ ${msg}`) }
}
function assertThrows(fn, msg) {
    try { fn(); failed++; console.error(`  ✗ ${msg} (expected throw, none happened)`) }
    catch { passed++; console.log(`  ✓ ${msg}`) }
}

const run = async () => {
    console.log('[param-prop-loader-sweep] loading fixture through ts-resolve-loader…')
    const mod = await import(fixtureUrl.href)

    // 1. private foo: string
    const priv = new mod.TestParamPropPrivate('hello')
    assert(priv.getFoo() === 'hello', 'private foo: string → getFoo() === "hello"')
    assert(priv.foo === 'hello', 'private param stored as own field')

    // 2. public x = 1, private y: number — explicit args
    const pub = new mod.TestParamPropPublicDefault(42, 99)
    assert(pub.x === 42, 'public x: number = 42 migrated to own field')
    assert(pub.getY() === 99, 'private y: number = 99 migrated to own field')

    // 3. public x = 1 default (no args)
    const pubDefault = new mod.TestParamPropPublicDefault()
    assert(pubDefault.x === 1, 'public x defaults to 1 when no arg passed')
    assert(pubDefault.getY() === undefined, 'private y w/o arg yields undefined')

    // 4. readonly id: string
    const ro = new mod.TestParamPropReadonly('abc123')
    assert(ro.getId() === 'abc123', 'readonly id: string → getId() === "abc123"')
    assert(ro.id === 'abc123', 'readonly id exposed as own field')

    // 5. plain constructor (no parameter property) still works
    const plain = new mod.TestNoParamProp(7)
    assert(plain.getVal() === 7, 'control: plain ctor unaffected')

    // 6. multiple private params + body call still executes
    const multi = new mod.TestMultiParamProp('a', 1, true)
    assert(multi.getA() === 'a' && multi.getB() === 1 && multi.getFlag() === true, 'multi private params mapped')

    // 7. defaulted-parameter class (plain ctor preserved verbatim)
    const defOnly = new mod.TestDefaultThenPrivate('z')
    assert(defOnly.opt === 'z', 'plain ctor defaulted param passes through')
    assert(defOnly.getFlag() === true, 'plain ctor non-param-property path unaffected')

    // 8-11. edge shapes
    const comb = new mod.EdgeCombinedMods(42)
    assert(comb.get() === 42, 'combined private readonly id preserved')

    const prot = new mod.EdgeProtectedParam('guard')
    assert(prot.getName() === 'guard', 'protected param readable')

    const arrow = new mod.EdgeArrowFnParam(() => 7)
    assert(arrow.run() === 7, 'arrow-fn param handled')

    const suff = new mod.EdgeTypedDefault(9)
    assert(suff.getY() === 9, 'type+default with explicit arg')
    const bare = new mod.EdgeTypedDefault()
    assert(bare.getY() === 5, 'type+default with no arg → default 5')

    console.log(`\n=== param-property-loader-sweep COMPLETE ===`)
    console.log(`Passed: ${passed}, Failed: ${failed}`)
    if (failed > 0) process.exitCode = 1
}

run()

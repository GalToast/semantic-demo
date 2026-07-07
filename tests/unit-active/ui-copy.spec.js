import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(process.cwd(), 'src')
const FORBIDDEN = /(Semantic Dive|semantic neighborhood|Inspecting a thread|Synthesis|Synthesize|mycelium)/i

function extractUserVisibleTs(content) {
    // grab headerText, emptyHeadline, emptySubtext values in object literals
    const results = []
    const propRe = /(headerText|emptyHeadline|emptySubtext)\s*:\s*['"`]([^'"`]+)['"`]/g
    let m
    while ((m = propRe.exec(content)) !== null) {
        results.push({ prop: m[1], value: m[2] })
    }
    return results
}

function extractUserVisibleSvelte(content) {
    const results = []
    // find markup after last </script>
    const markupStart = content.lastIndexOf('</script>')
    if (markupStart === -1) return results
    let markup = content.slice(markupStart + 9)
    // Strip <style>...</style> blocks — CSS class names like .synthesize-trigger
    // contain forbidden substrings but are not user-visible strings.
    markup = markup.replace(/<style[\s\S]*?<\/style>/gi, '')
    // scan quoted attribute values and text nodes
    // attribute values: ="..." or ='...'
    const attrRe = /=\s*['"`]([^'"`]+)['"`]/g
    let m
    while ((m = attrRe.exec(markup)) !== null) {
        const val = m[1]
        // skip class/id/style/data- etc.
        const before = markup.slice(Math.max(0, m.index - 20), m.index)
        if (/class|id|style|data-|href|src|type|role|aria-/i.test(before)) continue
        results.push({ type: 'attr', value: val })
    }
    // text nodes: >text< between tags (simple heuristic)
    const textRe = />([^<]{3,})</g
    while ((m = textRe.exec(markup)) !== null) {
        const val = m[1].trim()
        if (val.length > 2 && !/^\s*\{/.test(val)) results.push({ type: 'text', value: val })
    }
    return results
}

describe('UX copy — forbidden jargon audit (ocw_ui_fix)', () => {
    const files = [
        { path: resolve(ROOT, 'lib/orchestration/info-panel-state.ts'), type: 'ts' },
        { path: resolve(ROOT, 'components/SemanticOverlay.svelte'), type: 'svelte' },
        { path: resolve(ROOT, 'components/SemanticGuideCard.svelte'), type: 'svelte' }
    ]

    for (const f of files) {
        const content = readFileSync(f.path, 'utf-8')
        const entries = f.type === 'ts' ? extractUserVisibleTs(content) : extractUserVisibleSvelte(content)

        it(`${f.path} contains zero forbidden jargon`, () => {
            const violations = []
            for (const e of entries) {
                if (FORBIDDEN.test(e.value)) {
                    violations.push(`${e.type ?? e.prop}: "${e.value}"`)
                }
            }
            if (violations.length > 0) {
                console.error(`[${f.path}] violations:`, violations)
            }
            expect(violations).toEqual([])
        })
    }
})

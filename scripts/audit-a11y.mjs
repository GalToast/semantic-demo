#!/usr/bin/env node
/**
 * scripts/audit-a11y.mjs
 *
 * Component-level a11y lint for src/components/*.svelte.
 *
 * Surfaces:
 *   rule_1  <button> missing type="button" / "submit" / ...
 *   rule_2  <button> with no visible text and no aria-label/labelledby/title
 *   rule_3  <input>/<select>/<textarea> missing id and aria-label
 *   rule_4  click/key handler on a non-semantic container without role+tabindex
 *   rule_5  <img> missing alt
 *   rule_6  rgba(..., alpha<0.6) referenced as a color value (decorations count)
 *   rule_7  outline: none / 0 without focus-visible fallback
 *   rule_8  aria-hidden="true" element contains focusable children
 *
 * Usage:
 *   node scripts/audit-a11y.mjs                  # tabular report, exit 0
 *   node scripts/audit-a11y.mjs --strict         # exit 1 if any HIGH
 *   node scripts/audit-a11y.mjs --json           # raw JSON to stdout
 *   node scripts/audit-a11y.mjs --help
 *
 * The lint is intentionally lenient (no rule blocks a component commit
 * outright) — pair it with a HIGH-only sweep during bugsweeps to triage.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const COMPONENT_DIR = 'src/components'

const args = new Set(process.argv.slice(2))
const help = args.has('-h') || args.has('--help')
const jsonMode = args.has('--json')
const strictMode = args.has('--strict')
const severityFilter = (() => {
    const hit = process.argv.slice(2).find((a) => a.startsWith('--severity='))
    if (!hit) return null
    const v = hit.slice('--severity='.length).toUpperCase()
    return new Set(['HIGH', 'MEDIUM', 'LOW'].includes(v) ? [v] : [])
})()
const fileFilter = (() => {
    const hit = process.argv.slice(2).find((a) => a.startsWith('--file='))
    return hit ? hit.slice('--file='.length) : null
})()

if (help) {
    console.log(`audit-a11y — component-level a11y lint for ${COMPONENT_DIR}/

Options:
  --json                   Emit raw findings as JSON (machine-readable).
  --strict                 Exit 1 if any HIGH-severity finding is reported.
  --severity=HIGH|MED|LOW  Only include findings of this severity.
  --file=<substring>       Restrict to files whose basename contains <substring>.
  -h, --help               Show this help.

Default output is a tabulated summary plus a HIGH-list (when present).
Use --strict to wire this into a pre-commit / CI gate for blocking HIGH
findings; the lenient mode is suitable for human triage.`)
    process.exit(0)
}

// ── Audit logic ────────────────────────────────────────────────────────────

const svelteFiles = fs
    .readdirSync(COMPONENT_DIR)
    .filter((file) => file.endsWith('.svelte'))
    .map((file) => path.join(COMPONENT_DIR, file))

function auditFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split('\n')
    const baseName = path.basename(filePath)
    const findings = []

    const pushOnce = (f) => {
        // Dedup within a single file: same file+line+rule already present.
        if (findings.some((g) => g.line === f.line && g.rule === f.rule)) return
        findings.push(f)
    }

    // Per-line quick checks. The big multi-line tag parser follows.
    lines.forEach((line, index) => {
        const lineNum = index + 1

        // rule_1 quick pass (arrow-function safe: skips ">" preceded by "=" to ignore lambda arrow)
        if (line.includes('<button')) {
            const btnOffset = content.indexOf('<button', content.indexOf(line))
            if (btnOffset !== -1) {
                let endOffset = btnOffset
                let angleDepth = 0
                for (let i = btnOffset; i < content.length; i++) {
                    const c = content[i]
                    if (c === '<') angleDepth++
                    else if (c === '>') {
                        if (content[i - 1] === '=') continue
                        if (angleDepth > 1) {
                            angleDepth--
                            continue
                        }
                        endOffset = i
                        break
                    }
                }
                const tagAttrs = content.substring(btnOffset, endOffset + 1)
                if (!/type\s*=/.test(tagAttrs)) {
                    pushOnce({
                        file: baseName,
                        line: lineNum,
                        severity: 'LOW',
                        rule: 1,
                        desc: 'Button element without explicit type attribute'
                    })
                }
            }
        }

        // rule_3 quick pass (cross-line aware: avoids false positives on multi-line input/select/textarea tags)
        // \b word boundary prevents <select matching <SelectedBusinessDetails,
        // <input matching <inputs, <textarea matching <textareas, etc.
        if (line.match(/<(input|select|textarea)\b/i)) {
            // Find the matching close angle bracket by scanning forward, tracking < depth.
            // For input/select/textarea the tag is rarely nested; a simple forward scan suffices.
            const startOffset = content.indexOf(line)
            if (startOffset !== -1) {
                let depth = 0
                let endOffset = startOffset
                for (let i = startOffset; i < content.length; i++) {
                    const ch = content[i]
                    if (ch === String.fromCharCode(60)) depth++
                    else if (ch === String.fromCharCode(62)) {
                        if (depth > 1) {
                            depth--
                            continue
                        }
                        // Skip /> self-closing markers
                        if (i > startOffset && content[i - 1] === String.fromCharCode(47)) {
                            depth--
                            continue
                        }
                        endOffset = i
                        break
                    }
                }
                const tagScope = content.substring(startOffset, endOffset + 1)
                const hasId = /id=/.test(tagScope)
                const hasAriaLabel = /aria-label=|aria-labelledby=/i.test(tagScope)
                const isHiddenInput = /^[^>]*type=["']hidden["']/i.test(tagScope)
                if (!hasId && !hasAriaLabel && !isHiddenInput) {
                    pushOnce({
                        file: baseName,
                        line: lineNum,
                        severity: 'HIGH',
                        rule: 3,
                        desc: 'Form input missing identifying attribute (id or aria-label/aria-labelledby)'
                    })
                }
            }
        }

        // rule_4 quick pass
        if (
            line.match(/on(click|pointerdown|mousedown|keydown)/i) &&
            line.match(/<(div|span|section|header|footer|aside|p|article|li|ul|ol|h[1-6]|main|img|svg)/i)
        ) {
            const hasRole = line.includes('role=')
            const hasTabindex = line.includes('tabindex=')
            if (!hasRole || !hasTabindex) {
                pushOnce({
                    file: baseName,
                    line: lineNum,
                    severity: 'HIGH',
                    rule: 4,
                    desc: `Interactive non-semantic container with click/key handler missing ${!hasRole ? 'role' : 'tabindex'}`
                })
            }
        }

        // rule_5 quick pass
        if (line.includes('<img') && !line.includes('alt=')) {
            pushOnce({
                file: baseName,
                line: lineNum,
                severity: 'HIGH',
                rule: 5,
                desc: 'Image missing alt attribute'
            })
        }

        // rule_6: rgba with low alpha in a color slot (decorative-only is fine;
        // this rule is intentionally noisy so reviewers can verify by sight)
        const rgbaMatch = line.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(0?\.\d+|\d+)\s*\)/i)
        if (rgbaMatch) {
            const alpha = parseFloat(rgbaMatch[1])
            if (alpha < 0.6 && (line.includes('color') || line.includes('--color'))) {
                pushOnce({
                    file: baseName,
                    line: lineNum,
                    severity: 'MEDIUM',
                    rule: 6,
                    desc: `Low-alpha color (${rgbaMatch[0]}) — verify this is decorative, not foreground`
                })
            }
        }

        // rule_7
        if (line.includes('outline: none') || line.includes('outline: 0')) {
            pushOnce({
                file: baseName,
                line: lineNum,
                severity: 'MEDIUM',
                rule: 7,
                desc: 'outline disabled; confirm focus-visible fallback is provided'
            })
        }
    })

    // Multi-line HTML tag parser for accurate cross-line attribute checks.
    const tagRegex = /<([a-zA-Z1-6]+)([^>]*?)(>|\/>)/gs
    let tagMatch
    while ((tagMatch = tagRegex.exec(content)) !== null) {
        const tagName = tagMatch[1].toLowerCase()
        const attrsText = tagMatch[2]
        const fullTag = tagMatch[0]
        const offset = tagMatch.index
        const lineNumber = content.substring(0, offset).split('\n').length

        if (tagName === 'button') {
            // Refind the actual closing > with arrow-function safety, in case attrsText
            // got truncated prematurely by the [^>]*? regex's stop at the first ">".
            let buttonEndOffset = offset + fullTag.length
            for (let i = offset + 1; i < content.length; i++) {
                const ch = content[i]
                if (ch === '>' && content[i - 1] !== '=') {
                    buttonEndOffset = i + 1
                    break
                }
            }
            const buttonAttrs = content.substring(offset, buttonEndOffset)
            const typeLiteral = buttonAttrs.match(/type=["']([^"']+)["']/i)
            const typeExpression = buttonAttrs.match(/type=\{/)
            if (!typeLiteral && !typeExpression) {
                pushOnce({
                    file: baseName,
                    line: lineNumber,
                    severity: 'LOW',
                    rule: 1,
                    desc: 'Button missing type attribute'
                })
            }

            // rule_2: button must have visible content OR an aria-label/labelledby/title.
            const closeIdx = content.indexOf('</button>', offset + fullTag.length)
            if (closeIdx !== -1) {
                const innerText = content
                    .substring(offset + fullTag.length, closeIdx)
                    .replace(/<[^>]*>/g, '')
                    .trim()
                const hasAriaLabel = /aria-label=|aria-labelledby=/i.test(attrsText)
                const hasTitle = /title=/.test(attrsText)
                if (!innerText && !hasAriaLabel && !hasTitle) {
                    pushOnce({
                        file: baseName,
                        line: lineNumber,
                        severity: 'HIGH',
                        rule: 2,
                        desc: 'Button has no visible text and no aria-label / aria-labelledby / title'
                    })
                }
            }
        }

        if (tagName === 'input' || tagName === 'select' || tagName === 'textarea') {
            const hasId = /id=/.test(attrsText)
            const hasAriaLabel = /aria-label=|aria-labelledby=/i.test(attrsText)
            const isHiddenInput = /^[^>]*type=["']hidden["']/i.test(attrsText)
            if (!hasId && !hasAriaLabel && !isHiddenInput) {
                pushOnce({
                    file: baseName,
                    line: lineNumber,
                    severity: 'HIGH',
                    rule: 3,
                    desc: 'Form input missing identifying attribute (id or aria-label)'
                })
            }
        }

        if (tagName === 'img') {
            if (!/alt=/.test(attrsText)) {
                pushOnce({
                    file: baseName,
                    line: lineNumber,
                    severity: 'HIGH',
                    rule: 5,
                    desc: 'Image missing alt attribute'
                })
            }
        }

        // rule_4 multi-line: same as quick pass, but cross-line attribute-aware.
        // HTML5 landmark elements are explicitly exempted — they carry implicit
        // semantics and adding tabindex would harm keyboard UX (you'd tab into
        // empty regions). role="navigation"/"search"/"region"/"complementary"/"main"/"form"
        // attributes on a generic container also imply landmark semantics.
        const NON_SEMANTIC = new Set(['div', 'span', 'p', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'svg'])
        const isLandmarkRole =
            /roles*=s*["'{(](?:navigation|search|region|complementary|main|form|alertgroup|status)["'})]/i
        if (NON_SEMANTIC.has(tagName) && !isLandmarkRole.test(attrsText)) {
            const hasClick =
                /on(click|pointerdown|mousedown|keydown)\s*=/i.test(attrsText) ||
                /on(click|pointerdown|mousedown|keydown)\s*\{/i.test(attrsText)
            if (hasClick) {
                const hasRole = /role=/.test(attrsText)
                const hasTabindex = /tabindex=/.test(attrsText)
                if (!hasRole || !hasTabindex) {
                    const missing = !hasRole && !hasTabindex ? 'role + tabindex' : !hasRole ? 'role' : 'tabindex'
                    pushOnce({
                        file: baseName,
                        line: lineNumber,
                        severity: 'HIGH',
                        rule: 4,
                        desc: `Interactive <${tagName}> with click/key handler missing ${missing}`
                    })
                }
            }
        }
    }

    // rule_8: aria-hidden element wrapping focusable children. This is a
    // single-pass regex scan; nested children of the same tag are approximated.
    const ariaHiddenRegex = /<([a-zA-Z1-6]+)([^>]*?aria-hidden=(?:"true"|'true'|\{true\}|true)[^>]*?>)/gi
    let ariaMatch
    while ((ariaMatch = ariaHiddenRegex.exec(content)) !== null) {
        const tagName = ariaMatch[1].toLowerCase()
        const offset = ariaMatch.index
        const lineNumber = content.substring(0, offset).split('\n').length
        const innerStart = offset + ariaMatch[0].length
        const closeIdx = content.indexOf(`</${tagName}>`, innerStart)
        if (closeIdx === -1) continue
        const innerContent = content.substring(innerStart, closeIdx)
        if (
            /<(button|input|select|textarea)\b/i.test(innerContent) ||
            /<a\s+[^>]*\bhref=/i.test(innerContent) ||
            /\btabindex=["'{-]?\s*[0-9]/i.test(innerContent)
        ) {
            pushOnce({
                file: baseName,
                line: lineNumber,
                severity: 'HIGH',
                rule: 8,
                desc: `Element marked aria-hidden="true" contains focusable children`
            })
        }
    }

    return findings
}

let allFindings = []
for (const file of svelteFiles) {
    allFindings.push(...auditFile(file))
}

if (severityFilter && severityFilter.size > 0) {
    allFindings = allFindings.filter((f) => severityFilter.has(f.severity))
}
if (fileFilter) {
    const needle = fileFilter.toLowerCase()
    allFindings = allFindings.filter((f) => f.file.toLowerCase().includes(needle))
}

// ── Reporting ──────────────────────────────────────────────────────────────

const SEVERITY_RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 }

if (jsonMode) {
    process.stdout.write(JSON.stringify(allFindings, null, 2) + '\n')
} else {
    const bySeverity = allFindings.reduce(
        (acc, f) => {
            acc[f.severity] = (acc[f.severity] || 0) + 1
            return acc
        },
        { HIGH: 0, MEDIUM: 0, LOW: 0 }
    )

    const byFile = allFindings.reduce((acc, f) => {
        acc[f.file] = (acc[f.file] || 0) + 1
        return acc
    }, {})
    const topFiles = Object.entries(byFile)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)

    const fileCount = Object.keys(byFile).length
    console.log(`audit-a11y: scanned ${svelteFiles.length} components in ${COMPONENT_DIR}/`)
    console.log(
        `  ${allFindings.length} findings across ${fileCount} file(s) — ` +
            `HIGH=${bySeverity.HIGH} MEDIUM=${bySeverity.MEDIUM} LOW=${bySeverity.LOW}`
    )

    if (topFiles.length > 0) {
        console.log(`\nTop ${topFiles.length} files by finding count:`)
        for (const [file, count] of topFiles) {
            console.log(`  ${String(count).padStart(4)}  ${file}`)
        }
    }

    const highFindings = allFindings
        .filter((f) => f.severity === 'HIGH')
        .sort(
            (a, b) =>
                SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.file.localeCompare(b.file) || a.line - b.line
        )

    if (highFindings.length > 0) {
        console.log(`\nHIGH findings (${highFindings.length}):`)
        for (const f of highFindings) {
            console.log(`  ${f.file}:${f.line}  [rule_${f.rule}] ${f.desc}`)
        }
    } else {
        console.log('\nNo HIGH-severity findings. ✔')
    }

    if (strictMode && bySeverity.HIGH > 0) {
        console.error(`\naudit-a11y --strict: ${bySeverity.HIGH} HIGH finding(s) → exit 1.`)
        process.exit(1)
    }
}

if (allFindings.some((f) => f.severity === 'HIGH')) {
    // Even in non-strict mode, expose the exit code 0 default so CI can opt in
    // explicitly via --strict. We do not fail builds implicitly here.
}

process.exit(0)

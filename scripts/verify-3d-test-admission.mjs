#!/usr/bin/env node
// Browser-free admission check for the 3D Playwright inventory.
//
// For every `tests/3d-*.spec.js` file this verifies, without launching a
// browser or running any 3D test:
//   1. The file parses as a valid ES module (node --check, --input-type=module).
//   2. It contains no committed merge-conflict markers (<<<<<<< / >>>>>>> / |||||||).
//   3. Every local relative import (./ or ../) resolves to a file on disk.
//
// Exit codes:
//   0  every 3D spec is syntactically valid, marker-free, and its local
//      relative imports all resolve.
//   1  at least one 3D spec fails one of the checks above. The failing file
//      path is printed next to each specific problem so the error is
//      path-specific and actionable.
//
// Optional positional argument: a directory to scan instead of `tests` (used
// by the focused verification harness). The glob is always `3d-*.spec.js`
// (recursive) so nested specs are also admitted.

import { readFileSync, existsSync } from 'node:fs'
import { globSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const scanRoot = process.argv[2] || 'tests'
const execPath = process.execPath

// Relative-import extraction: import/export-from, side-effect import, dynamic
// import(). Bare/absolute specifiers (node_modules, @playwright/test, etc.) are
// intentionally ignored — only local relative paths are admission-checked.
const IMPORT_RE =
  /(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]|(?:import)\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g
const MERGE_RE = /^(?:<<<<<<<|>>>>>>>|\|\|\|\|\|\|\|)/

function checkSyntax(source) {
  try {
    execFileSync(execPath, ['--check', '--input-type=module'], {
      input: source,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    return null
  } catch (err) {
    const stderr = (err.stderr || Buffer.from('')).toString().trim()
    const lines = stderr.split('\n')
    // Locator line looks like "[stdin]:3" (parse errors). Stack frames such as
    // "check_syntax:72:5" also contain :digits:digits, so only read the
    // locator line, never the trace below it.
    const locLine = lines.find((l) => /^\[stdin]:\d+$|^\S+:\d+:\d+/.test(l.trim())) || ''
    const lineMatch = locLine.match(/:(\d+)/)
    const line = lineMatch ? ` (line ${lineMatch[1]})` : ''
    const msgLine = lines.find((l) => /\bSyntaxError\b|\bError:/.test(l)) || lines[lines.length - 1] || ''
    const msg = msgLine.replace(/^[^\w]*((?:\w+\.)?\w*Error):?/, '$1').trim() || 'parse failure'
    return `SYNTAX ERROR${line}: ${msg}`
  }
}

function checkFile(file) {
  const problems = []
  let source
  try {
    source = readFileSync(file, 'utf8')
  } catch (err) {
    problems.push(`UNREADABLE: ${err.message}`)
    return problems
  }

  // 1. Merge markers.
  const lines = source.split('\n')
  lines.forEach((line, i) => {
    if (MERGE_RE.test(line)) {
      problems.push(`MERGE MARKER at line ${i + 1}: ${line.slice(0, 32)}`)
    }
  })

  // 2. Syntax.
  const syntax = checkSyntax(source)
  if (syntax) problems.push(syntax)

  // 3. Local relative imports resolve.
  const dir = file.replace(/[/\\][^/\\]+$/, '') + '/'
  let m
  IMPORT_RE.lastIndex = 0
  while ((m = IMPORT_RE.exec(source))) {
    const spec = m[1] || m[2] || m[3]
    if (!spec) continue
    if (spec.startsWith('.')) {
      if (!existsSync(dir + spec)) {
        problems.push(`MISSING LOCAL IMPORT '${spec}'`)
      }
    }
  }

  return problems
}

function main() {
  let specs
  try {
    specs = globSync(join(scanRoot, '**', '3d-*.spec.js'), { absolute: true })
  } catch (err) {
    console.error(`verify:3d-tests: cannot scan '${scanRoot}': ${err.message}`)
    process.exit(1)
  }

  if (specs.length === 0) {
    console.log(`verify:3d-tests: no 3d-*.spec.js found under '${scanRoot}' (nothing to admit)`)
    process.exit(0)
  }

  let failed = 0
  const report = []
  for (const file of specs.sort()) {
    const problems = checkFile(file)
    if (problems.length > 0) {
      failed++
      report.push(`\nFAIL ${file}`)
      for (const p of problems) report.push(`  - ${p}`)
    }
  }

  if (failed > 0) {
    console.error(`verify:3d-tests: ${failed}/${specs.length} 3D spec(s) rejected:`)
    console.error(report.join('\n'))
    process.exit(1)
  }

  console.log(`verify:3d-tests: OK — ${specs.length} 3D spec(s) admitted (syntax, markers, local imports)`)
  process.exit(0)
}

main()

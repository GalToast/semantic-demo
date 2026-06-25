import fs from 'fs'

function unwrapWithStateMutation(content) {
    const lines = content.split('\n')
    const result = []
    let i = 0

    while (i < lines.length) {
        const line = lines[i]

        // Skip import line
        if (
            line.trim() === "import { withStateMutation } from '@lib/state/with-state-mutation'" ||
            line.trim() === 'import { withStateMutation } from "@lib/state/with-state-mutation"'
        ) {
            // Check if next line is blank
            if (i + 1 < lines.length && lines[i + 1].trim() === '') {
                i += 2
            } else {
                i++
            }
            continue
        }

        // Check for withStateMutation(() => {
        const match = line.match(/^(\s*)withStateMutation\(\(\)\s*=>\s*\{\s*$/)
        if (!match) {
            result.push(line)
            i++
            continue
        }

        const indent = match[1]
        // Find the matching close: '  })' at the same base indent level
        // We need to find the line that has exactly `indent + '})'`
        let j = i + 1
        let depth = 1
        const bodyLines = []

        while (j < lines.length && depth > 0) {
            const innerLine = lines[j]

            // Simple brace counting (doesn't handle strings/comments well, but good enough for our code)
            // Count braces
            let openCount = 0
            let closeCount = 0
            for (const char of innerLine) {
                if (char === '{') openCount++
                if (char === '}') closeCount++
            }

            // Check if this is the closing line
            // It should be like `    })` where indent matches the withStateMutation indent
            if (innerLine.trim() === '})' && depth - closeCount + openCount === 0) {
                // Found the matching close
                break
            }

            // Track net brace depth
            depth += openCount - closeCount

            // If depth drops to 0, we found the end (shouldn't happen with the check above, but safety)
            if (depth <= 0) {
                break
            }

            bodyLines.push(innerLine)
            j++
        }

        // Add body lines (already indented)
        for (const r of bodyLines) {
            result.push(r)
        }

        // Skip past the closing line
        i = j + 1
    }

    return result.join('\n')
}

const files = process.argv.slice(2)
if (files.length === 0) {
    console.error('Usage: node unwrap-wsm.mjs <file1> <file2> ...')
    process.exit(1)
}

for (const filePath of files) {
    try {
        const content = fs.readFileSync(filePath, 'utf8')
        const newContent = unwrapWithStateMutation(content)
        if (content !== newContent) {
            fs.writeFileSync(filePath, newContent)
            console.log('Processed:', filePath)
        } else {
            console.log('No changes:', filePath)
        }
    } catch (e) {
        console.error('Error processing', filePath, ':', e.message)
    }
}

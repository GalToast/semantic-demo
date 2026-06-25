import fs from 'fs'
import path from 'path'

const files = [
    'src/components/MapView.svelte',
    'src/lib/data-store.ts',
    'src/lib/engine/camera-choreography/orbit-slack.ts',
    'src/lib/engine/camera-controls-core.svelte.ts',
    'src/lib/engine/thread-manager.ts',
    'src/lib/journey/arrival-handoff.ts',
    'src/lib/journey/journey.ts',
    'src/lib/journey/thread-settler.ts',
    'src/lib/orchestration/cluster-filter-controller.ts',
    'src/lib/semantic-threads.ts',
    'src/lib/state/mutators.ts'
]

files.forEach((filePath) => {
    try {
        let content = fs.readFileSync(filePath, 'utf8')

        // Remove import line
        content = content.replace(
            /import\s*\{\s*withStateMutation\s*\}\s*from\s*['"]@?lib\/state\/with-state-mutation['"](?:\r?\n)?/g,
            ''
        )

        // Remove import with `./with-state-mutation`
        content = content.replace(
            /import\s*\{\s*withStateMutation\s*\}\s*from\s*['"]\.\/with-state-mutation['"](?:\r?\n)?/g,
            ''
        )

        // Unwrap withStateMutation(() => { ... }) to just { ... } at indentation
        // Pattern: withStateMutation(() => {\n  <body>\n})
        // We need to find the opening, then track to the matching closing
        // For simplicity, we'll handle the common single-indent pattern

        // Replace multiline withStateMutation with just the body
        // Match: withStateMutation(() => {
        //   <content>
        // })
        content = content.replace(/withStateMutation\(\(\)\s*=>\s*\{([\s\S]*?)\n\s*\}\)/g, (match, body) => {
            return body
        })

        // Some files use withStateMutation(() => Object.assign(state.navState, updates))
        // For single-line calls: withStateMutation(() => expression)
        content = content.replace(/withStateMutation\(\(\)\s*=>\s*/g, '')

        fs.writeFileSync(filePath, content)
        console.log('Cleaned: ' + filePath)
    } catch (e) {
        console.log('Skipping: ' + filePath + ' - ' + e.message)
    }
})

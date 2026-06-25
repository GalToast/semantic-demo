import fs from 'fs'

const path = 'src/lib/journey/route-trace.ts'
let content = fs.readFileSync(path, 'utf8')

// 1. Replace (state as any).routeTraceLines with state.routeTraceLines (all occurrences)
content = content.replace(/\(state as any\)\.routeTraceLines/g, 'state.routeTraceLines')

// 2. Replace (state as any).routeTraceConnectionPairs with state.routeTraceConnectionPairs
content = content.replace(/\(state as any\)\.routeTraceConnectionPairs/g, 'state.routeTraceConnectionPairs')

// 3. Replace (state as any).routeChoreographyState with state.routeChoreographyState
content = content.replace(/\(state as any\)\.routeChoreographyState/g, 'state.routeChoreographyState')

// 4. Replace (state as any).semanticDiveMode with state.semanticDiveMode
content = content.replace(/\(state as any\)\.semanticDiveMode/g, 'state.semanticDiveMode')

// 5. Remove state.withMutation() wrapping: state.withMutation(() => { body }) → body
content = content.replace(/state\.withMutation\(\(\)\s*=>\s*\{([\s\S]*?)\n\s*\}\)/g, (match, body) => {
    // Trim leading/trailing whitespace from body and indent back by one level
    const lines = body.split('\n')
    return lines.join('\n')
})

fs.writeFileSync(path, content)
console.log('Cleaned route-trace.ts')

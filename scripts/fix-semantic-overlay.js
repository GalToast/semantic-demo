const fs = require('fs')

const PATH = 'src/lib/journey/semantic-overlay.ts'
let s = fs.readFileSync(PATH, 'utf8')

// 1. Replace _state alias with interface + typed access
s = s.replace(
    /const _state = state as any\n/,
    `// Extended LineMaterial for custom shader uniforms
interface SemanticLineMaterial extends LineMaterial {
    uniforms: Record<string, { value: number }>
    userData: Record<string, unknown> & {
        shader?: { uniforms: Record<string, { value: number }> }
    }
}\n\n`
)

// 2. Replace all _state. with state.
s = s.replace(/_state\./g, 'state.')

// 3. Replace (lineMaterial as any) with lineMaterial
s = s.replace(/\(lineMaterial as any\)/g, 'lineMaterial')

// 4. Replace } as any) in constructor with }) — properly close the object
s = s.replace(/\}\s*as\s+any\)/g, '})')

// 5. Replace color constant as any with nothing
s = s.replace(/\(CLUSTER_COLORS as any\)/g, 'CLUSTER_COLORS')
s = s.replace(/\(FOCUS_SEMANTIC_COLORS as any\)/g, 'FOCUS_SEMANTIC_COLORS')

// 6. Fix function cast
s = s.replace(
    /getNextWalkCandidateForIndex as any/g,
    'getNextWalkCandidateForIndex as unknown as typeof getNextWalkCandidateForIndex'
)

fs.writeFileSync(PATH, s)
console.log('Done')

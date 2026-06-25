import fs from 'fs'

const filePath = 'src/lib/journey/semantic-overlay.ts'
let content = fs.readFileSync(filePath, 'utf8')

// 1. Add SemanticLineMaterial interface after imports
const interfaceBlock = `
// Extended LineMaterial with custom uniforms for semantic thread overlay
interface SemanticLineMaterial extends LineMaterial {
    uniforms: {
        time: { value: number }
        semanticScore: { value: number }
        denseBundleMode: { value: number }
        reducedMotion: { value: number }
        [key: string]: any
    }
    userData: {
        denseBundleMode?: number
        shader?: {
            uniforms: {
                time: { value: number }
                semanticScore: { value: number }
                denseBundleMode: { value: number }
                reducedMotion: { value: number }
                [key: string]: any
            }
        }
    }
}
`

// Insert the interface right before the first const declaration
const firstConst = content.indexOf('const _state')
if (firstConst > 0) {
    content = content.slice(0, firstConst) + interfaceBlock + '\n' + content.slice(firstConst)
}

// 2. Remove the _state alias and replace _state with state
content = content.replace(/const _state = state as any\n/, '')
content = content.replace(/_state\./g, 'state127g.')

// 3. Replace (lineMaterial as any) with lineMaterial (all occurrences)
content = content.replace(/\(lineMaterial as any\)/g, 'lineMaterial')

// 4. Replace line material constructor options as any
content = content.replace(/\{\s*linewidth: 1\.35,[/s]*?\} as any/, '{ linewidth: 1.35, /* options */ }')

// 5. Replace `shader: any` with typed shader
content = content.replace(/\(shader: any\)/g, '(shader: Record<string, any>)')

// 6. Replace color constant as any casts with direct access
// These mostly exist because of `Object.freeze()` typing - not needed for literal shapes
content = content.replace(/\(CLUSTER_COLORS as any\)/g, 'CLUSTER_COLORS')
content = content.replace(/\(FOCUS_SEMANTIC_COLORS as any\)/g, 'FOCUS_SEMANTIC_COLORS')

// 7. Replace `getNextWalkCandidateForIndex as any` with typed assertion
content = content.replace(
    /getNextWalkCandidateForIndex as any/g,
    'getNextWalkCandidateForIndex as unknown as typeof getNextWalkCandidateForIndex'
)

fs.writeFileSync(filePath, content)
console.log('Cleaned semantic-overlay.ts')

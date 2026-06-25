import fs from 'fs'

const PATH = 'src/lib/journey/semantic-overlay.ts'
let s = fs.readFileSync(PATH, 'utf8')

// Fix LineMaterial constructor: remove ' as unknown as any' from closing brace
s = s.replace(/\}\s*as unknown as any\)/g, '})')

// Fix function cast parameter
const orig = 'getNextWalkCandidateForIndex as any'
if (s.includes(orig)) {
    s = s.replace(
        orig,
        'getNextWalkCandidateForIndex as unknown as Parameters<typeof getNextExploreCandidateForIndex>[1]'
    )
}

// Remove color constant 'as any' casts
s = s.replace(/\(CLUSTER_COLORS as any\)/g, 'CLUSTER_COLORS')
s = s.replace(/\(FOCUS_SEMANTIC_COLORS as any\)/g, 'FOCUS_SEMANTIC_COLORS')

fs.writeFileSync(PATH, s)
console.log('Done')

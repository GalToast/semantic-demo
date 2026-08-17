import fs from 'node:fs'
import path from 'node:path'

const scriptPath = path.join('scripts', 'model-health-check.mjs')
const source = fs.readFileSync(scriptPath, 'utf8')

// Contract 1: default smoke-delay must be 250ms when --smoke-delay is omitted
const defaultMatch = source.match(/smokeDelayMs\s*=\s*smokeDelayArg[\s\S]*?:\s*250\b/)
if (!defaultMatch) {
    throw new Error('Default smokeDelayMs must be 250 when --smoke-delay is omitted')
}

// Contract 2: explicit zero must be preserved (no floor on user-supplied value)
if (/Math\.(max|min)\s*\([^)]*smokeDelay[^)]*\)/.test(source)) {
    throw new Error('Explicit --smoke-delay=0 must not be floored by Math.max/min')
}

// Contract 3: throttle must be inside smoke mode and gated by smokeDelayMs > 0
const smokeSection = source.slice(source.indexOf('if (smoke) {'))
const throttleMatch = smokeSection.match(
    /if\s*\(\s*smokeDelayMs\s*>\s*0\s*&&[\s\S]*?await\s+sleep\s*\(\s*smokeDelayMs\s*\)/
)
if (!throttleMatch) {
    throw new Error('Throttle must be inside smoke mode and gated by smokeDelayMs > 0')
}

console.log('PASS: model-health-check safety contract')

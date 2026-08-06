import fs from 'node:fs'
import path from 'node:path'

export function walkDir(dir) {
    const files = []
    try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, entry.name)
            if (entry.isDirectory()) files.push(...walkDir(fullPath))
            else files.push(fullPath)
        }
    } catch {
        // Missing build-input directories are handled as empty inputs.
    }
    return files
}

export function newestMtime(filePaths) {
    let newest = 0
    for (const filePath of filePaths) {
        try {
            newest = Math.max(newest, fs.statSync(filePath).mtimeMs)
        } catch {
            // Missing inputs are ignored so optional repo assets do not block QA.
        }
    }
    return newest
}

export function playwrightBuildInputs(root) {
    return [
        ...walkDir(path.join(root, 'src')),
        ...walkDir(path.join(root, 'css')),
        path.join(root, 'index.html'),
        path.join(root, 'semantic-demo.css'),
        path.join(root, 'vite.config.ts'),
        path.join(root, 'scripts/test-server.mjs')
    ]
}

export function getPlaywrightDistFreshness({ root, distIndex }) {
    if (!fs.existsSync(distIndex)) {
        return {
            fresh: false,
            reason: 'missing',
            distIndex,
            distMtime: 0,
            newestInput: newestMtime(playwrightBuildInputs(root))
        }
    }

    const distMtime = fs.statSync(distIndex).mtimeMs
    const newestInput = newestMtime(playwrightBuildInputs(root))
    return {
        fresh: newestInput <= distMtime,
        reason: newestInput <= distMtime ? 'fresh' : 'stale',
        distIndex,
        distMtime,
        newestInput
    }
}

// Smoke: launch qa-static-server, then run ONLY the SONIC-5 test.
// Usage: node scripts/run-sonic5.mjs
import fs from 'fs'
import path from 'path'
import net from 'net'
import { spawn, spawnSync, execSync } from 'child_process'

const ROOT = path.dirname(path.dirname(path.dirname(process.argv[1])))
const PORT = 8841

function pidsOn(port) {
    let out
    try {
        out = execSync(
            `powershell -NoProfile -Command "(Get-NetTCPConnection | Where-Object { $_.LocalPort -eq ${port} }).OwningProcess"`,
            { encoding: 'utf8', timeout: 8, stdio: ['ignore', 'pipe', 'pipe'] }
        )
    } catch {
        return []
    }
    return out
        .split(/\s+/)
        .map(Number)
        .filter((n) => Number.isFinite(n))
}

for (const pid of pidsOn(PORT)) {
    try {
        process.kill(pid, 'SIGKILL')
    } catch {
        /* ignore */
    }
}

const _server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'qa-static-server.mjs'), '--port', String(PORT)], {
    stdout: fs.openSync('/c/tmp/qa-server.log', 'w'),
    stderr: 'inherit'
})

const up = await new Promise((resolve) => {
    let done = false
    const tick = () => {
        const s = net.createConnection(PORT, '127.0.0.1')
        s.on('connect', () => {
            s.destroy()
            if (!done) {
                done = true
                resolve(true)
            }
        })
        s.on('error', () => {
            s.destroy()
            if (!done) {
                done = true
                resolve(false)
            }
        })
        s.setTimeout(500, () => {
            s.destroy()
            if (!done) {
                done = true
                resolve(false)
            }
        })
    }
    const loop = () => {
        if (done) return
        tick()
        setTimeout(loop, 500)
    }
    loop()
    setTimeout(() => {
        if (!done) {
            done = true
            resolve(false)
        }
    }, 15000)
})

if (!up) {
    console.error('server did not come up')
    console.error(fs.readFileSync('/c/tmp/qa-server.log', 'utf8').slice(-1500))
    process.exit(2)
}
console.log(`server up on ${PORT}`)

const env = { ...process.env, TEST_BASE_URL: `http://127.0.0.1:${PORT}` }
const r = spawnSync(
    'npx',
    [
        'playwright',
        'test',
        'tests/journey/sonic.spec.js',
        '-g',
        'SONIC-5',
        '--timeout=180000',
        '--retries=0',
        '--reporter=list'
    ],
    { cwd: ROOT, env, stdio: 'pipe', encoding: 'utf8', timeout: 600_000 }
)
console.log('=== stdout ===')
console.log(r.stdout.slice(-4000))
console.log('=== stderr ===')
console.log((r.stderr || '').slice(-1500))
console.log('EXIT', r.status)
process.exit(r.status ?? 1)

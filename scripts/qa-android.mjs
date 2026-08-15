#!/usr/bin/env node

/**
 * Start a repeatable real-device Android Chrome smoke session.
 *
 * This is intentionally a browser workflow, not an APK workflow:
 *   1. ensure the existing QA server on 127.0.0.1:8795;
 *   2. reverse that host port to the selected Android device;
 *   3. open Semantic Explorer in Chrome;
 *   4. optionally expose Chrome CDP and run a bounded DOM smoke check.
 *
 * ADB forwards are left in place for manual DevTools inspection. Nothing in
 * this script stops or kills a process.
 */

import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const DEFAULT_SERIAL = process.env.ANDROID_SERIAL || '77aeb8a8'
const DEFAULT_ADB = process.env.ADB_WIN || (process.platform === 'win32' ? 'adb.exe' : 'adb')
const DEFAULT_HOST_PORT = 8795
const DEFAULT_DEVICE_PORT = 8795
const DEFAULT_CDP_PORT = 9222
const DEFAULT_PATH = '/dist/svelte/index.html?nodemo=1'
const CDP_WAIT_MS = 15_000

function assertSerial(value) {
    if (!value || !/^[A-Za-z0-9._:-]+$/.test(value)) {
        throw new Error('ADB serial must contain only letters, numbers, dots, underscores, colons, or hyphens')
    }
    return value
}

function parsePort(value, label) {
    const port = Number(value)
    if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error(`${label} must be a valid TCP port`)
    return port
}

function parseUrl(value) {
    let url
    try {
        url = new URL(value)
    } catch {
        throw new Error(`URL is invalid: ${value}`)
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new Error('URL must be an http(s) URL without embedded credentials')
    }
    return url.toString()
}

export function buildPageUrl({ devicePort = DEFAULT_DEVICE_PORT, url = null } = {}) {
    if (url) return parseUrl(url)
    return `http://127.0.0.1:${parsePort(devicePort, 'device port')}${DEFAULT_PATH}`
}

export function adbArgs(serial, args) {
    return ['-s', assertSerial(serial), ...args]
}

export function parseArgs(argv = process.argv.slice(2)) {
    const options = {
        adb: DEFAULT_ADB,
        serial: DEFAULT_SERIAL,
        hostPort: DEFAULT_HOST_PORT,
        devicePort: DEFAULT_DEVICE_PORT,
        cdpPort: DEFAULT_CDP_PORT,
        url: null,
        ensureServer: true,
        launch: true,
        forwardCdp: true,
        smoke: false,
        help: false
    }

    for (const arg of argv) {
        if (arg === '--no-server') options.ensureServer = false
        else if (arg === '--no-launch') options.launch = false
        else if (arg === '--no-cdp') options.forwardCdp = false
        else if (arg === '--smoke') options.smoke = true
        else if (arg === '--help' || arg === '-h') options.help = true
        else if (arg.startsWith('--adb=')) options.adb = arg.slice('--adb='.length)
        else if (arg.startsWith('--serial=')) options.serial = arg.slice('--serial='.length)
        else if (arg.startsWith('--host-port='))
            options.hostPort = parsePort(arg.slice('--host-port='.length), 'host port')
        else if (arg.startsWith('--device-port='))
            options.devicePort = parsePort(arg.slice('--device-port='.length), 'device port')
        else if (arg.startsWith('--cdp-port=')) options.cdpPort = parsePort(arg.slice('--cdp-port='.length), 'CDP port')
        else if (arg.startsWith('--url=')) options.url = parseUrl(arg.slice('--url='.length))
        else throw new Error(`Unknown argument: ${arg}`)
    }

    if (!options.help) {
        assertSerial(options.serial)
        options.url = buildPageUrl(options)
        if (options.smoke && !options.forwardCdp) throw new Error('--smoke requires CDP forwarding; remove --no-cdp')
    }
    return options
}

function scrub(value) {
    return String(value || '')
        .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer <redacted>')
        .replace(/(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}/gi, '<redacted-key>')
        .trim()
        .slice(0, 800)
}

function runAdb(adb, args, { allowFailure = false } = {}) {
    const result = spawnSync(adb, args, { encoding: 'utf8', maxBuffer: 200_000 })
    if (result.error || result.status !== 0) {
        if (!allowFailure) {
            throw new Error(scrub(result.stderr || result.error?.message || `adb exited ${result.status}`))
        }
    }
    return {
        status: result.status,
        stdout: result.stdout || '',
        stderr: result.stderr || ''
    }
}

export function parseAdbState(stdout) {
    const lines = String(stdout || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    return lines.includes('device') ? 'device' : lines.at(-1) || ''
}

function ensureDevice(options) {
    // ADB can restart its daemon during this call and print the restart banner
    // into stdout before the actual state line. Parse the state token instead
    // of requiring the entire output to equal "device".
    const state = parseAdbState(runAdb(options.adb, adbArgs(options.serial, ['get-state'])).stdout)
    if (state === 'device') return

    const devices = runAdb(options.adb, ['devices', '-l'], { allowFailure: true })
    throw new Error(
        `ADB device ${options.serial} is not ready (state: ${state || 'unavailable'}).\n${scrub(devices.stdout)}`
    )
}

function ensureQaServer() {
    const result = spawnSync(process.execPath, ['scripts/qa-server.mjs', 'ensure'], {
        encoding: 'utf8',
        stdio: 'inherit',
        windowsHide: true
    })
    if (result.error || result.status !== 0) throw new Error(`QA server ensure failed with exit ${result.status}`)
}

function forwardPorts(options) {
    runAdb(options.adb, adbArgs(options.serial, ['reverse', `tcp:${options.devicePort}`, `tcp:${options.hostPort}`]))
    if (options.forwardCdp) {
        runAdb(
            options.adb,
            adbArgs(options.serial, ['forward', `tcp:${options.cdpPort}`, 'localabstract:chrome_devtools_remote'])
        )
    }
}

function launchChrome(options) {
    runAdb(
        options.adb,
        adbArgs(options.serial, ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', options.url])
    )
}

async function waitForJson(url, predicate, timeoutMs = CDP_WAIT_MS) {
    const deadline = Date.now() + timeoutMs
    let lastError = 'not available'
    while (Date.now() < deadline) {
        try {
            const response = await fetch(url)
            if (response.ok) {
                const payload = await response.json()
                if (!predicate || predicate(payload)) return payload
            } else {
                lastError = `HTTP ${response.status}`
            }
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error)
        }
        await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error(`Chrome CDP endpoint did not become ready: ${url} (${lastError})`)
}

async function evaluateCdp(webSocketUrl, expression) {
    const WebSocketImpl = globalThis.WebSocket
    if (typeof WebSocketImpl !== 'function') throw new Error('Node WebSocket support is required for --smoke')

    const socket = new WebSocketImpl(webSocketUrl)
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.close()
            reject(new Error('Timed out waiting for Chrome CDP evaluation'))
        }, CDP_WAIT_MS)
        let settled = false

        const finish = (error, value) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            socket.close()
            if (error) reject(error)
            else resolve(value)
        }

        socket.addEventListener('error', () => finish(new Error('Chrome CDP WebSocket connection failed')))
        socket.addEventListener('message', (event) => {
            let message
            try {
                message = JSON.parse(String(event.data))
            } catch {
                finish(new Error('Chrome CDP returned invalid JSON'))
                return
            }
            if (message.id !== 1) return
            if (message.error) {
                finish(new Error(message.error.message || 'Chrome CDP evaluation failed'))
                return
            }
            const exception = message.result?.exceptionDetails
            if (exception) {
                finish(new Error(exception.text || 'Page evaluation threw an exception'))
                return
            }
            finish(null, message.result?.result?.value)
        })
        socket.addEventListener('open', () => {
            socket.send(
                JSON.stringify({
                    id: 1,
                    method: 'Runtime.evaluate',
                    params: { expression, awaitPromise: true, returnByValue: true }
                })
            )
        })
    })
}

export const ANDROID_SMOKE_EXPRESSION = `
(async () => {
  const deadline = Date.now() + ${CDP_WAIT_MS};
  while (Date.now() < deadline) {
    const input = document.querySelector('#search-input');
    if (input) {
      return {
        ok: true,
        title: document.title,
        url: location.href,
        readyState: document.readyState,
        searchInput: true,
        canvas: Boolean(document.querySelector('canvas')),
        viewport: { width: innerWidth, height: innerHeight },
        devicePixelRatio: window.devicePixelRatio,
        panelSurface: document.body?.dataset?.panelSurface ?? null
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { ok: false, title: document.title, url: location.href, readyState: document.readyState, searchInput: false };
})()
`

async function runSmoke(options) {
    await waitForJson(`http://127.0.0.1:${options.cdpPort}/json/version`, (payload) =>
        Boolean(payload.webSocketDebuggerUrl)
    )
    const targets = await waitForJson(
        `http://127.0.0.1:${options.cdpPort}/json/list`,
        (payload) =>
            Array.isArray(payload) && payload.some((target) => target.type === 'page' && target.webSocketDebuggerUrl)
    )
    const page =
        targets.find((target) => target.type === 'page' && target.url.includes(options.url.split('?')[0])) ||
        targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl)
    if (!page?.webSocketDebuggerUrl) throw new Error('Chrome CDP exposed no inspectable page target')

    const result = await evaluateCdp(page.webSocketDebuggerUrl, ANDROID_SMOKE_EXPRESSION)
    if (!result?.ok || result.searchInput !== true) {
        throw new Error(`Android UI smoke failed: ${JSON.stringify(result)}`)
    }
    return result
}

export async function run(options) {
    ensureDevice(options)
    if (options.ensureServer) ensureQaServer()
    forwardPorts(options)
    if (options.launch) launchChrome(options)

    console.log(`[qa:android] device=${options.serial}`)
    console.log(`[qa:android] url=${options.url}`)
    console.log(`[qa:android] reverse=127.0.0.1:${options.hostPort} -> device:127.0.0.1:${options.devicePort}`)
    if (options.forwardCdp)
        console.log(`[qa:android] cdp=http://127.0.0.1:${options.cdpPort} (inspect via chrome://inspect)`)

    if (options.smoke) {
        const result = await runSmoke(options)
        console.log(`[qa:android] smoke=${JSON.stringify(result)}`)
    }
    return options
}

function printHelp() {
    console.log(`Usage: npm run qa:android -- [options]

Options:
  --serial=ID          ADB device serial (default: ANDROID_SERIAL or ${DEFAULT_SERIAL})
  --adb=PATH           adb executable (default: ADB_WIN or ${DEFAULT_ADB})
  --host-port=N        Windows QA server port (default: ${DEFAULT_HOST_PORT})
  --device-port=N      Android localhost port (default: ${DEFAULT_DEVICE_PORT})
  --cdp-port=N         Local Chrome CDP port (default: ${DEFAULT_CDP_PORT})
  --url=URL            Override the default Semantic Explorer URL
  --smoke              Run a bounded CDP DOM smoke check after launch
  --no-server          Do not run qa-server.mjs ensure
  --no-launch          Configure forwards without opening Chrome
  --no-cdp             Skip Chrome CDP forwarding
  -h, --help           Show this help

The command never stops or kills processes. ADB forwards remain active for manual inspection.`)
}

export async function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv)
    if (options.help) {
        printHelp()
        return
    }
    await run(options)
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    main().catch((error) => {
        console.error(`[qa:android] ERROR: ${error instanceof Error ? error.message : String(error)}`)
        process.exitCode = 1
    })
}

#!/usr/bin/env node
/**
 * scripts/playwright-web-server.mjs
 * Cross-platform wrapper for the Playwright webServer command.
 * Sets VITE_API_BASE_URL then runs build + test-server.
 * Works on Windows, Linux, and macOS.
 */
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dirname, '..')

process.env.VITE_API_BASE_URL = 'http://127.0.0.1:8795'

console.log('[playwright-web-server] VITE_API_BASE_URL=http://127.0.0.1:8795')
console.log('[playwright-web-server] Running npm run build...')
execSync('npm run build', { cwd: ROOT, stdio: 'inherit' })

console.log('[playwright-web-server] Starting test server on port 8796...')
execSync('node scripts/test-server.mjs', { cwd: ROOT, stdio: 'inherit' })

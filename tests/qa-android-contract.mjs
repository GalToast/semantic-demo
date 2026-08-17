#!/usr/bin/env node

import assert from 'node:assert/strict'
import { adbArgs, buildPageUrl, parseAdbState, parseArgs } from '../scripts/qa-android.mjs'

const options = parseArgs([
    '--serial=77aeb8a8',
    '--host-port=8795',
    '--device-port=18095',
    '--cdp-port=19222',
    '--no-server',
    '--no-launch',
    '--smoke'
])

assert.equal(options.serial, '77aeb8a8')
assert.equal(options.hostPort, 8795)
assert.equal(options.devicePort, 18095)
assert.equal(options.cdpPort, 19222)
assert.equal(options.ensureServer, false)
assert.equal(options.launch, false)
assert.equal(options.forwardCdp, true)
assert.equal(options.smoke, true)
assert.equal(options.url, 'http://127.0.0.1:18095/dist/svelte/index.html?nodemo=1')
assert.deepEqual(adbArgs('77aeb8a8', ['get-state']), ['-s', '77aeb8a8', 'get-state'])
assert.equal(
    parseAdbState('adb server is out of date.  killing...\r\n* daemon started successfully *\r\ndevice\r\n'),
    'device'
)
assert.equal(parseAdbState('offline\r\n'), 'offline')
assert.equal(buildPageUrl({ devicePort: 18095 }), options.url)
assert.throws(() => parseArgs(['--serial=bad serial']), /serial/)
assert.throws(() => parseArgs(['--smoke', '--no-cdp']), /requires CDP/)
assert.throws(() => parseArgs(['--url=file:///tmp/index.html']), /http\(s\)/)

console.log('qa-android contract: ok')

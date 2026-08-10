import fs from 'node:fs'
import zlib from 'node:zlib'

function decode(p) {
  const buf = fs.readFileSync(p)
  let pos = 8, idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    if (type === 'IDAT') idat.push(buf.subarray(pos + 8, pos + 8 + len))
    pos += 12 + len
    if (type === 'IEND') break
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  let sum = 0, sum2 = 0, n = 0
  for (let i = 0; i < raw.length; i += 8) { const v = raw[i]; sum += v; sum2 += v * v; n++ }
  const mean = sum / n
  return Math.round(sum2 / n - mean * mean)
}

const dir = process.argv[2] + '/'
for (const f of fs.readdirSync(process.argv[2]).filter((f) => f.endsWith('.png')).sort()) {
  console.log(f.padEnd(32), 'variance:', String(decode(dir + f)).padStart(7))
}
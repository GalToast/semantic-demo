// Parallel direct vision jury: N worker processes each handle a slice of the JOBS list,
// one HTTP call per image (no context accumulation). Each slice writes its own results file.
import fs from 'node:fs'

const SLICE = process.argv[2] ? Number(process.argv[2]) : 0
const SLICES = process.argv[3] ? Number(process.argv[3]) : 1
const OUT_ID = process.argv[4] || 'x'
const ROUTER = 'http://127.0.0.1:8788'
const MODEL = 'meta/llama-3.2-90b-vision-instruct'
const KEY = 'local-router'
const DIR = 'tmp/vision-jury/jpeg-q90'
const OUT = `tmp/vision-jury/direct-jury-slice-${OUT_ID}.md`

const jobsPath = process.argv[5] ? process.argv[5] : 'tmp/vision-jury/jobs.json'
const JOBS = JSON.parse(fs.readFileSync(jobsPath, 'utf8'))

const GUIDE = (
    name,
    hint
) => `Visual QA of ONE screenshot named "${name}" from a WebGL 3D semantic mycelium data-viz app (8,406 Montgomery County TX businesses). Intended state: ${hint}.

Answer concisely (max 110 words):
1. The ACTUAL pixels in 1-3 sentences: real content vs placeholder graphic vs blank/black/or real 3D mycelium.
2. VISUAL DEFECTS actually visible (location + element): overlap, clipped text, misalignment, blank region, z-index, broken layout. Skip low-contrast unless text is genuinely unreadable.
3. Severity each: MAJOR / MEDIUM / LOW, or "none".
If entirely blank/solid: exactly "EMPTY FRAME". If no pixel data received: exactly "VISION UNAVAILABLE".`

async function one(i, [name, file, hint]) {
    const p = `${DIR}/${file}`
    if (!fs.existsSync(p)) {
        console.log(`[${name}] MISSING ${file}`)
        return
    }
    const b64 = fs.readFileSync(p).toString('base64')
    const t0 = Date.now()
    try {
        const res = await fetch(`${ROUTER}/nvidia/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: GUIDE(name, hint) },
                            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } }
                        ]
                    }
                ],
                max_tokens: 600
            }),
            signal: AbortSignal.timeout(180000)
        })
        const txt = await res.text()
        let j
        try {
            j = JSON.parse(txt)
        } catch {
            j = null
        }
        const content = typeof j?.choices?.[0]?.message?.content === 'string' ? j.choices[0].message.content : null
        const body = content || `(no content) ${j?.error?.message || txt.slice(0, 120)}`
        fs.appendFileSync(OUT, `\n## ${name} (HTTP ${res.status}, ${Date.now() - t0}ms)\n${body}\n`)
        console.log(`[slice${SLICE}] ${name} ${res.status} ${Date.now() - t0}ms`)
    } catch (e) {
        fs.appendFileSync(OUT, `\n## ${name}\nERROR ${e.message}\n`)
        console.log(`[slice${SLICE}] ${name} ERR ${e.message}`)
    }
}

// this slice's job range
const per = Math.ceil(JOBS.length / SLICES)
const start = SLICE * per
const end = Math.min(start + per, JOBS.length)
fs.writeFileSync(OUT, `# slice ${SLICE} of ${SLICES}\n`)
console.log(`slice ${SLICE}/${SLICES}: jobs ${start}-${end} (${end - start})`)
for (let i = start; i < end; i++) {
    await one(i, JOBS[i])
    await new Promise((r) => setTimeout(r, 1800))
}
console.log(`== slice ${SLICE} done ==`)

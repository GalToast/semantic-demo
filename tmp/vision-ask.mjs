/* vision-ask.mjs — inline main-lane vision probe: base64 image -> router chat.
 * Usage: node vision-ask.mjs <providerSlug> <modelId> <imagePath> [prompt]
 */
import fs from 'node:fs'

const [slug, model, img, ...rest] = process.argv.slice(2)
const prompt = rest.join(' ') || 'Describe what you see in this UI screenshot in 2-3 sentences, listing any visible tags/buttons.'
if (!slug || !model || !img) {
    console.error('usage: node vision-ask.mjs <slug> <modelId> <image> [prompt]')
    process.exit(1)
}
const b64 = fs.readFileSync(img).toString('base64')
const body = {
    model,
    max_tokens: 220,
    messages: [{
        role: 'user',
        content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } }
        ]
    }]
}
const t0 = Date.now()
const res = await fetch(`http://127.0.0.1:8788/${slug}/v1/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
})
const ms = Date.now() - t0
const j = await res.json().catch(() => null)
if (!res.ok || !j) { console.log(`[${slug}/${model}] HTTP ${res.status} ${ms}ms — ${JSON.stringify(j)?.slice(0, 160)}`); process.exit(2) }
const msg = j.choices?.[0]?.message
const txt = (msg?.content || msg?.text || '') + (msg?.reasoning_content ? `\n[reasoning] ${msg.reasoning_content.slice(0, 200)}` : '')
console.log(`[${slug}/${model}] ${ms}ms usage=${JSON.stringify(j.usage)}`)
console.log(txt.trim())
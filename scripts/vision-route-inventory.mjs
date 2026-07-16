#!/usr/bin/env node
// scripts/vision-route-inventory.mjs — canonical vision-capable inventory.
//
// Pulls /v1/models from every configured provider-prefix on the key router,
// deduplicates, and classifies by:
//   - explicit vision (architecture.input_modalities includes "image" OR
//     architecture.modality contains "image->text" or "video->text" coverage,
//     OR capabilities.vision === true, OR description mentions
//     "vision" / "multimodal" / "image")
//   - explicit video (architecture.input_modalities contains "video" OR
//     architecture.modality contains "video->text" / "+video")
//   - inferred-vision (model id matches conservative name-pattern + the meta —
//     plus a "vision-by-name-only" tag for fuyu/neva/kosmos/internvl/minicpm/
//     pixtral/moondream/qwen2-vl/qwen3-vl/llava/gemma-3/gemma-4/gemini/claude
//     family candidates) — to be empirically verified downstream.
//
// Output: tmp/vision-route-inventory.json + stdout count summary.
// No API-key values are echoed or written to disk.

const ROUTER = process.env.KEY_ROUTER_URL || 'http://127.0.0.1:8788'
const PROVIDERS = [
    { prefix: 'nvidia', upstream: 'NIM', description: 'NVIDIA NIM' },
    { prefix: 'modelscope', upstream: 'ModelScope', description: 'Alibaba ModelScope' },
    { prefix: 'openrouter', upstream: 'OpenRouter', description: 'OpenRouter aggregator' },
    { prefix: 'kilo', upstream: 'Kilo', description: 'Kilo' },
    { prefix: 'mistral', upstream: 'Mistral', description: 'Mistral La Plateforme' },
    { prefix: 'agnes', upstream: 'Agnes', description: 'Agnes' },
    { prefix: 'opencode-zen', upstream: 'OpenCode Zen', description: 'OpenCode Zen (anthropic/gpt routes)' },
    { prefix: 'logfare', upstream: 'Logfare', description: 'Logfare reseller' },
    { prefix: 'cloudflare', upstream: 'Cloudflare', description: 'Cloudflare Workers AI' },
    { prefix: 'freemodel', upstream: 'FreeModel', description: 'FreeModel' }
]

const VISION_NAME_RE =
    /(vision|vlm|\b-vl\b|\bvl-|\bvl$|-vl$|\bvl\b|pixtral|moondream|internvl|minicpm|\bllava\b|fuyu|neva|kosmos|idefics|cogvlm|glm-4v|gemini|gpt-4o|gpt-5.5|gpt-5.6|claude|gemma-\d|gemma-\d+|qwen.\d-vl|qwen\d-vl|phi-\d-vision|phi-\d.\d-vision|phi-4-multimodal|video|multimodal|image|chart|deplot|video-v|vl-)/i

async function fetchModels(provider) {
    const url = `${ROUTER}/${provider.prefix}/v1/models`
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 30000)
    try {
        const res = await fetch(url, { signal: ctrl.signal })
        const txt = await res.text()
        if (!res.ok) {
            return { provider: provider.prefix, ok: false, status: res.status, error: txt.slice(0, 200), models: [] }
        }
        let json
        try {
            json = JSON.parse(txt)
        } catch {
            return { provider: provider.prefix, ok: false, status: res.status, error: 'json parse failed', models: [] }
        }
        // different schemas:
        //   Mistral:   { data: [{ id, capabilities: { vision: true } }] }
        //   OpenRouter:{ data: [{ id, architecture: { input_modalities: ["text","image"] }, architecture.modality }] }
        //   Cloudflare:{ data:[{ id, architecture: { input_modalities } }] }
        //   NIM:       { data:[{ id, owned_by }] } — no modalities field
        //   ModelScope:{ data:[{ id, owner }] }    — no modalities field
        //   Agnes:     { data:[{ id, supported_endpoint_types:["openai"] }] }
        //   Zen:       { data:[{ id, owned_by }] } — claude/gpt routes
        //   Logfare:   { data:[{ id, display_name }] }
        //   Kilo:      { data:[{ id, architecture:{ input_modalities } }] }
        const list = json?.data ?? []
        const models = list.map((m) => {
            const id = m.id ?? m.name ?? m.canonical_slug ?? ''
            const upstream = provider.upstream
            const route = `${provider.prefix}:${id}`
            const arch = m.architecture ?? {}
            const caps = m.capabilities ?? {}
            const inputMods = arch.input_modalities ?? []
            const modalityStr = arch.modality ?? ''
            const description = m.description ?? ''
            // classification flags
            const hasImageMod = Array.isArray(inputMods) && inputMods.includes('image')
            const hasVideoMod = Array.isArray(inputMods) && inputMods.includes('video')
            const modalityHasImage =
                /image|video|multimodal/i.test(modalityStr) ||
                /text\+image|text\+video|image->text|video->text/i.test(modalityStr)
            const capVision = caps.vision === true || caps.ocr === true
            const nameHeuristic = VISION_NAME_RE.test(id)
            // logfare is text-only usually
            const noImageModListed = inputMods.length === 0 && !modalityStr && !caps.vision
            const inferredVision = hasImageMod || modalityHasImage || capVision || (noImageModListed && nameHeuristic)
            const inferredVideo = hasVideoMod || /video/i.test(modalityStr)
            return {
                route,
                id,
                upstream,
                hasImageMod,
                hasVideoMod,
                modalityStr,
                capVision,
                nameHeuristic,
                inferredVision,
                inferredVideo,
                description: description.slice(0, 260)
            }
        })
        return { provider: provider.prefix, ok: true, status: res.status, error: null, models, total: models.length }
    } catch (e) {
        return {
            provider: provider.prefix,
            ok: false,
            status: null,
            error: e?.name === 'AbortError' ? 'timeout' : e?.message || String(e),
            models: []
        }
    } finally {
        clearTimeout(t)
    }
}

;(async () => {
    const perProvider = []
    for (const p of PROVIDERS) {
        process.stderr.write(`[vision-route-inventory] fetching ${p.prefix}…`)
        const r = await fetchModels(p)
        process.stderr.write(` ok=${r.ok} models=${r.models.length} ${r.error ? `err=${r.error}` : ''}\n`)
        perProvider.push(r)
        await new Promise((res) => setTimeout(res, 500))
    }
    // Build dedup universe of vision candidates (inferred or explicit).
    const visionCandidates = []
    const videoCandidates = []
    for (const r of perProvider) {
        if (!r.ok) continue
        for (const m of r.models) {
            if (m.inferredVision) visionCandidates.push(m)
            if (m.inferredVideo) videoCandidates.push(m)
        }
    }
    const out = {
        generatedAt: new Date().toISOString(),
        router: ROUTER,
        perProvider: perProvider.map((r) => ({
            provider: r.provider,
            ok: r.ok,
            status: r.status,
            error: r.error,
            total: r.total ?? 0,
            visionCount: r.models.filter((m) => m.inferredVision).length,
            videoCount: r.models.filter((m) => m.inferredVideo).length
        })),
        visionCandidateRoutes: visionCandidates.map((m) => m.route),
        videoCandidateRoutes: videoCandidates.map((m) => m.route),
        models: visionCandidates
    }
    const outPath = 'tmp/vision-route-inventory.json'
    const fs = await import('node:fs')
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2))
    console.log('\n=== vision-route-inventory summary ===')
    for (const r of perProvider) {
        const visionCount = r.models.filter((m) => m.inferredVision).length
        const videoCount = r.models.filter((m) => m.inferredVideo).length
        console.log(
            `${(r.provider || '-').padEnd(14)} ok=${r.ok} total=${String(r.total ?? 0).padStart(4)} vision=${String(visionCount).padStart(3)} video=${String(videoCount).padStart(3)}${r.error ? `  err=${r.error}` : ''}`
        )
    }
    console.log(`\nVision candidate COUNT (dedup incl. inferred): ${visionCandidates.length}`)
    console.log(`Video candidate COUNT (dedup): ${videoCandidates.length}`)
    console.log(`\nwrote ${outPath}`)
    console.log(`first 20 vision routes:`)
    for (const m of visionCandidates.slice(0, 20)) {
        console.log(`  ${m.route}`)
    }
})()

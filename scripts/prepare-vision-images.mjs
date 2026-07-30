#!/usr/bin/env node
// scripts/prepare-vision-images.mjs
//
// Prepare screenshots for vision-model grading WITHOUT the lossy downscale that
// caused VLM hallucinations (W53 V4: 50% -> 640x400 washed out small text so
// models perceived "low contrast" on WCAG-AA-compliant DOM).
//
// CONTRACT:
//   DEFAULT = lossless passthrough. Source PNGs are copied verbatim — no rescale,
//   no re-encode. The 1280x800 / 375x667 captures are already the right resolution
//   for modern VLMs (Qwen3-VL, minimax-m3, agnes-2.0-flash) which do their own
//   dynamic tiling. The old `.small.png` 50% downscale was a misdiagnosis of the
//   NIM constraint (NIM caps image COUNT at 1/request, not bytes/pixels).
//
//   When a provider genuinely needs a smaller body, opt in EXPLICITLY with
//   `--long-edge=N` (lossless PNG, longest edge <= N, aspect preserved). JPEG is
//   NEVER produced for UI text screenshots unless you pass `--jpeg-q=Q` and accept
//   the documented degradation.
//
// USAGE:
//   node scripts/prepare-vision-images.mjs [--src "<glob>"] [--out <dir>]
//        [--long-edge=N] [--jpeg-q=Q] [--manifest <path>] [--dry-run]
//
//   --src        source glob (default: tmp/phase2-*.png, EXCLUDES *.small.png)
//   --out        output dir (default: tmp/vision-input)
//   --long-edge  lossless PNG rescale so longest edge <= N (default: none/passthrough)
//   --jpeg-q     JPEG quality 1-100 (DEGRADES text — only for hard byte-cap providers)
//   --manifest   write a JSON manifest of source->output dims+bytes (default: <out>/manifest.json)
//   --dry-run    print the plan, write nothing
//
// REQUIRES: ImageMagick 7 (`magick`) on PATH for rescale/jpeg modes. Passthrough
// mode uses only node:fs (no external deps).

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

// ---------- arg parsing ----------
function parseArgs(argv) {
    const opts = { src: null, out: null, longEdge: null, jpegQ: null, manifest: null, dryRun: false }
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--dry-run') opts.dryRun = true
        else if (a === '--src') opts.src = argv[++i]
        else if (a === '--out') opts.out = argv[++i]
        else if (a === '--manifest') opts.manifest = argv[++i]
        else if (a.startsWith('--long-edge=')) opts.longEdge = Number(a.slice('--long-edge='.length))
        else if (a.startsWith('--jpeg-q=')) opts.jpegQ = Number(a.slice('--jpeg-q='.length))
        else if (a.startsWith('--')) {
            console.error(`unknown flag: ${a}`)
            process.exit(2)
        }
    }
    return opts
}

// ---------- PNG IHDR reader (no deps) ----------
function pngDims(p) {
    const b = fs.readFileSync(p)
    if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) {
        throw new Error(`not a PNG: ${p}`)
    }
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length }
}

// ---------- glob (simple, no deps) ----------
function listSources(globPattern, cwd) {
    // Support a single literal dir or a prefix glob like tmp/phase2-*.png.
    // We do NOT pull in a glob lib; the audit fixtures follow a stable prefix.
    if (globPattern.endsWith('/')) globPattern = globPattern.slice(0, -1)
    const star = globPattern.indexOf('*')
    if (star === -1) {
        // literal file or dir
        const abs = path.resolve(cwd, globPattern)
        if (fs.statSync(abs).isDirectory()) {
            return fs
                .readdirSync(abs)
                .filter((f) => f.toLowerCase().endsWith('.png') && !f.includes('.small.'))
                .map((f) => path.join(abs, f))
        }
        return [abs]
    }
    const dir = path.resolve(cwd, path.dirname(globPattern))
    const fileGlob = path.basename(globPattern)
    const prefix = fileGlob.slice(0, fileGlob.indexOf('*'))
    const suffix = fileGlob.slice(fileGlob.lastIndexOf('*') + 1)
    if (!fs.existsSync(dir)) return []
    return (
        fs
            .readdirSync(dir)
            .filter((f) => {
                const lf = f.toLowerCase()
                return lf.endsWith(suffix.toLowerCase()) && f.startsWith(prefix) && lf.endsWith('.png')
            })
            // exclude the legacy downscaled variants so we never feed them back in
            .filter((f) => !f.includes('.small.'))
            .map((f) => path.join(dir, f))
            .sort()
    )
}

// ---------- magick availability ----------
function hasMagick() {
    try {
        execFileSync('magick', ['-version'], { stdio: ['ignore', 'ignore', 'ignore'] })
        return true
    } catch {
        return false
    }
}

// ---------- rescale via magick (lossless PNG by default) ----------
function magickRescale(src, dst, longEdge, jpegQ) {
    // `NxN>` resizes only if larger than N on the longest edge, preserves aspect.
    // PNG output is lossless. JPEG is opt-in and DEGRADES text.
    const args = [src, '-resize', `${longEdge}x${longEdge}>`]
    if (jpegQ != null) {
        args.push('-quality', String(jpegQ))
        // ensure .jpg output
        args.push(`${dst.replace(/\.png$/i, '.jpg')}`)
    } else {
        // lossless PNG, strip metadata to keep bytes down without touching pixels
        args.push('-strip', `${dst}`)
    }
    execFileSync('magick', args, { stdio: ['ignore', 'ignore', 'inherit'] })
    return jpegQ != null ? dst.replace(/\.png$/i, '.jpg') : dst
}

// ---------- main ----------
async function main() {
    const opts = parseArgs(process.argv.slice(2))
    const cwd = process.cwd()
    const srcGlob = opts.src || 'tmp/phase2-*.png'
    const outDir = path.resolve(cwd, opts.out || 'tmp/vision-input')
    const manifestPath = path.resolve(opts.manifest || path.join(outDir, 'manifest.json'))

    const sources = listSources(srcGlob, cwd)
    if (sources.length === 0) {
        console.error(`no source PNGs matched: ${srcGlob}`)
        console.error('hint: capture first with tests/visual-state-audit.mjs or tests/capture-phase2.spec.js')
        process.exit(1)
    }

    const wantRescale = opts.longEdge != null || opts.jpegQ != null
    if (wantRescale && !hasMagick()) {
        console.error('rescale/jpeg modes require ImageMagick 7 (`magick`) on PATH.')
        console.error('install: https://imagemagick.org  OR use default lossless passthrough (no --long-edge).')
        process.exit(3)
    }

    console.error(`prepare-vision-images: ${sources.length} source(s) -> ${outDir}`)
    console.error(
        `  mode: ${opts.longEdge != null ? `lossless PNG rescale long-edge<=${opts.longEdge}` : opts.jpegQ != null ? `JPEG q=${opts.jpegQ} (DEGRADES text)` : 'lossless passthrough (no rescale)'}`
    )

    if (!opts.dryRun) fs.mkdirSync(outDir, { recursive: true })

    const manifest = {
        generatedAt: new Date().toISOString(),
        mode: opts.longEdge != null ? 'long-edge-lossless' : opts.jpegQ != null ? 'jpeg-lossy' : 'passthrough-lossless',
        longEdge: opts.longEdge ?? null,
        jpegQ: opts.jpegQ ?? null,
        entries: []
    }

    for (const src of sources) {
        const srcDim = pngDims(src)
        const base = path.basename(src)
        const dst = path.join(outDir, base)
        let outPath = dst
        if (opts.dryRun) {
            console.error(`  [dry-run] ${src} ${srcDim.w}x${srcDim.h} -> ${dst}`)
            manifest.entries.push({
                src,
                dst,
                srcW: srcDim.w,
                srcH: srcDim.h,
                srcBytes: srcDim.bytes,
                outW: null,
                outH: null,
                outBytes: null
            })
            continue
        }
        if (wantRescale) {
            outPath = magickRescale(src, dst, opts.longEdge ?? 1e9, opts.jpegQ)
        } else {
            // lossless passthrough: copy bytes verbatim, do NOT re-encode
            fs.copyFileSync(src, outPath)
        }
        // pngDims throws on JPEG; guard
        let outW, outH, outBytes
        try {
            const d = pngDims(outPath)
            outW = d.w
            outH = d.h
            outBytes = d.bytes
        } catch {
            // JPEG output — read size from fs only
            outW = null
            outH = null
            outBytes = fs.statSync(outPath).size
        }
        const ratio = (((outW && outH ? outW * outH : 0) / (srcDim.w * srcDim.h)) * 100).toFixed(0)
        console.error(
            `  ${base}: ${srcDim.w}x${srcDim.h} (${srcDim.bytes}B) -> ${outW ?? '?'}x${outH ?? '?'} (${outBytes}B) ${ratio ? ratio + '%px' : ''}`
        )
        manifest.entries.push({
            src,
            dst: outPath,
            srcW: srcDim.w,
            srcH: srcDim.h,
            srcBytes: srcDim.bytes,
            outW,
            outH,
            outBytes
        })
    }

    if (!opts.dryRun) {
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
        console.error(`\nmanifest -> ${manifestPath}`)
        console.error(`feed to grader: node scripts/vision-grader-inline.mjs --models=... --images-dir=${outDir}`)
    }
    console.error('done.')
}

main().catch((e) => {
    console.error('FATAL:', e)
    process.exit(1)
})

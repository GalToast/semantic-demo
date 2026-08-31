#!/usr/bin/env node
// Regression test for the NVIDIA capabilities MCP outputPath save flow.
//
// Bug history (2026-06-12):
//   The MCP treated any call with `args.outputPath` set as a raw-binary response,
//   so FLUX/Visual GenAI replies (Content-Type: application/json wrapping base64
//   JPEG in `artifacts[].base64`) were saved as raw JSON text on disk instead
//   of decoded image bytes. Windows Photos and other image viewers correctly
//   refused the misnamed JSON-as-JPG file.
//
// Run after MCP changes:
//   node tools/agent-runtime/mcp/nvidia-capabilities/test-outputpath-save.mjs
//
// What it covers:
//   1) FLUX-shape body  { artifacts: [{ base64, finishReason, seed }] }      → real JPEG bytes
//   2) OpenAI-shape body { data: [{ b64_json, revised_prompt }] }           → real binary
//   3) Body with no extractable base64                                      → no misleading file
//
// Implementation note: importing index.mjs directly registers a process.stdin
// listener at the bottom of the file. That's fine for the test — we never
// read stdin, run our checks, then process.exit(0).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const mcpPath = path.join(here, "index.mjs");
const tempDir = path.join(here, "..", "..", "..", "..", "reports", "nvidia-capabilities", "_regression");
fs.mkdirSync(tempDir, { recursive: true });

function tinyJpegBytes() {
  return Buffer.from(
    [
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
    ],
    "binary"
  );
}
const tinyJpegB64 = tinyJpegBytes().toString("base64");
function isJpeg(buf) {
  return buf && buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

// Import the patched helpers from the MCP source. The MCP doesn't export them
// (it's a server, not a library), so we copy the source to a temp file, stub
// the stdin handler at the bottom, and add `export` keywords to the helpers
// the test needs. This avoids modifying the MCP source itself while still
// exercising the real (patched) implementation.
const original = fs.readFileSync(mcpPath, "utf8");
const stubbed = original
  .replace(/let buffer = ""[\s\S]*$/, "// stdin handler stubbed for regression test\n")
  .replace(/^function (findFirstStringByKeys|saveBase64Artifact|saveTextArtifact|postprocessNvidiaData|outputPathFor|outputPathWithExt)\(/gm, "export function $1(");
const devMcpPath = path.join(tempDir, "_mcp_for_test.mjs");
fs.writeFileSync(devMcpPath, stubbed);
const mod = await import(pathToFileURL(devMcpPath).href);
const { saveBase64Artifact, postprocessNvidiaData } = mod;

if (typeof saveBase64Artifact !== "function" || typeof postprocessNvidiaData !== "function") {
  console.error("FAIL  import: helpers not exposed on module. got keys=" + Object.keys(mod).filter(k => typeof mod[k] === "function").join(","));
  process.exit(1);
}

let failures = 0;
function check(label, condition, detail = "") {
  const tag = condition ? "PASS" : "FAIL";
  console.log(`${tag}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) FLUX-shape JSON-wrapped JPEG
const fluxBody = {
  artifacts: [{ base64: tinyJpegB64, finishReason: "SUCCESS", seed: 42 }],
};
const fluxOutPath = path.join(tempDir, "flux.bin");
try { fs.unlinkSync(fluxOutPath); } catch {}
const r1 = saveBase64Artifact(fluxBody, "image", fluxOutPath);
const r1buf = r1 ? fs.readFileSync(r1.outputPath) : null;
check("FLUX-shape: file exists", !!r1 && fs.existsSync(r1.outputPath));
check("FLUX-shape: file is real JPEG", isJpeg(r1buf), `bytes=${r1 ? r1.bytes : 0}`);

// ─────────────────────────────────────────────────────────────────────────────
// 2) OpenAI-shape data[].b64_json
const oaiBody = { data: [{ b64_json: tinyJpegB64, revised_prompt: "irrelevant" }] };
const oaiOutPath = path.join(tempDir, "oai.bin");
try { fs.unlinkSync(oaiOutPath); } catch {}
const r2 = saveBase64Artifact(oaiBody, "image", oaiOutPath);
const r2buf = r2 ? fs.readFileSync(r2.outputPath) : null;
check("OpenAI-shape: file exists", !!r2 && fs.existsSync(r2.outputPath));
check("OpenAI-shape: file is real JPEG", isJpeg(r2buf));

// ─────────────────────────────────────────────────────────────────────────────
// 3) postprocessNvidiaData with the same FLUX body should follow the same path
const r3 = postprocessNvidiaData(fluxBody, { artifactKind: "image", outputPath: fluxOutPath });
const r3buf = r3 ? fs.readFileSync(r3.outputPath) : null;
check("postprocessNvidiaData: decodes FLUX-shape", isJpeg(r3buf), `bytes=${r3 ? r3.bytes : 0}`);

// ─────────────────────────────────────────────────────────────────────────────
// 4) Empty body must NOT write a misleading file
const empty = { artifacts: [{ finishReason: "SUCCESS", seed: 99 }] };
const emptyOutPath = path.join(tempDir, "should_not_exist.bin");
try { fs.unlinkSync(emptyOutPath); } catch {}
const r4 = saveBase64Artifact(empty, "image", emptyOutPath);
check("Empty body: returns undefined", r4 === undefined);
check("Empty body: no file written", !fs.existsSync(emptyOutPath));

// Cleanup the regression scratch (keep the dir for inspection)
try { fs.unlinkSync(fluxOutPath); } catch {}
try { fs.unlinkSync(oaiOutPath); } catch {}

console.log("");
console.log(failures === 0 ? "ALL_PASS" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

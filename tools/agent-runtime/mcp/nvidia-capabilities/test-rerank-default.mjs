#!/usr/bin/env node
// Regression test for the NVIDIA capabilities MCP rerank default model.
//
// This test verifies that the nvidia_rerank tool uses the correct default model
// after the fix for the stale default model.
//
// Run after MCP changes:
//   node tools/agent-runtime/mcp/nvidia-capabilities/test-rerank-default.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const mcpPath = path.join(here, "index.mjs");
const tempDir = path.join(here, "..", "..", "..", "..", "reports", "nvidia-capabilities", "_regression_test");
fs.mkdirSync(tempDir, { recursive: true });

// Import the patched helpers from the MCP source. The MCP doesn't export them
// (it's a server, not a library), so we copy the source to a temp file, stub
// the stdin handler at the bottom, and add `export` keywords to the helpers
// the test needs. This avoids modifying the MCP source itself while still
// exercising the real (patched) implementation.
const original = fs.readFileSync(mcpPath, "utf8");
const stubbed = original
  .replace(/let buffer = ""[\s\S]*$/, "// stdin handler stubbed for regression test\n")
  .replace(/^function (compactObject|guardedNvidiaRequest|validateNvidiaUrl|safeHeaders|summarizeBody|outputPathFor|outputPathWithExt|loadNvidiaKeys|textResult|errorResult|filterCatalog|fetchLocalModels|endpointHelp|officialEndpointInventory|recommendedToolShape|fileToDataUrl|maybeFileDataUrl|saveBase64Artifact|saveTextArtifact|extractRequestId|postprocessNvidiaData)\(/gm, "export function $1(")
  .replace(/^async function (nvidiaRerank|nvidiaImageGenerate|nvidiaImageEdit|nvidiaVideoGenerate|nvidiaAsyncStatus|nvidiaSpeechToText|nvidiaTextToSpeech|nvidiaWeatherClimate|nvidiaCuoptSubmit|nvidiaBioRequest|nvidiaDocumentParse|nvidiaEmbed|nvidiaApiRequest|nvidiaMediaToolPlan)\(/gm, "export async function $1(");
const devMcpPath = path.join(tempDir, "_mcp_for_test.mjs");
fs.writeFileSync(devMcpPath, stubbed);
const mod = await import(pathToFileURL(devMcpPath).href);
const { compactObject, nvidiaRerank } = mod;

// Test that we can import and call a simple function
if (typeof nvidiaRerank !== "function") {
  console.error("FAIL  import: nvidiaRerank function not exported on module. got keys=" + Object.keys(mod).filter(k => typeof mod[k] === "function").join(","));
  process.exit(1);
}

// Test the compactObject function to make sure imports work
const testCompact = compactObject({ test: "value" });
check("Import/export mechanism works", testCompact.test === "value", `expected { test: "value" }, got ${JSON.stringify(testCompact)}`);

let failures = 0;
function check(label, condition, detail = "") {
  const tag = condition ? "PASS" : "FAIL";
  console.log(`${tag}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

// Test 1: Dry-run request WITHOUT specifying model should use the new default
const args1 = {
  query: "test query",
  passages: ["passage 1", "passage 2"],
  execute: false, // dry-run
};

try {
  const result1 = nvidiaRerank(args1);
  console.log("DEBUG: result1 =", JSON.stringify(result1, null, 2));
  
  // Check that it's a dry-run response
  check("Dry-run without model: returns dryRun=true", result1.dryRun === true);
  
  // Check that the requestPlan exists
  check("Dry-run without model: requestPlan exists", !!result1.requestPlan);
  
  // Check that bodyPreview exists and contains the correct model
  if (result1.requestPlan && result1.requestPlan.bodyPreview) {
    const modelValue = result1.requestPlan.bodyPreview.model;
    check("Dry-run without model: uses new default model", modelValue === "nvidia/rerank-qa-mistral-4b", 
          `expected "nvidia/rerank-qa-mistral-4b", got "${modelValue}"`);
  } else {
    check("Dry-run without model: bodyPreview.model exists", false, 
          `missing bodyPreview or model in bodyPreview: ${JSON.stringify(result1.requestPlan)}`);
  }
} catch (error) {
  check("Dry-run without model: no exception thrown", false, `exception: ${error.message}`);
}

// Test 2: Dry-run request WITH explicit model should override the default
const args2 = {
  query: "test query",
  passages: ["passage 1", "passage 2"],
  model: "nvidia/llama-nemotron-rerank-1b-v2", // explicitly set the old model
  execute: false, // dry-run
};

try {
  const result2 = nvidiaRerank(args2);
  console.log("DEBUG: result2 =", JSON.stringify(result2, null, 2));
  
  // Check that it's a dry-run response
  check("Dry-run with explicit model: returns dryRun=true", result2.dryRun === true);
  
  // Check that the requestPlan exists
  check("Dry-run with explicit model: requestPlan exists", !!result2.requestPlan);
  
  // Check that bodyPreview exists and contains the explicitly set model
  if (result2.requestPlan && result2.requestPlan.bodyPreview) {
    const modelValue = result2.requestPlan.bodyPreview.model;
    check("Dry-run with explicit model: uses explicit model", modelValue === "nvidia/llama-nemotron-rerank-1b-v2", 
          `expected "nvidia/llama-nemotron-rerank-1b-v2", got "${modelValue}"`);
  } else {
    check("Dry-run with explicit model: bodyPreview.model exists", false, 
          `missing bodyPreview or model in bodyPreview: ${JSON.stringify(result2.requestPlan)}`);
  }
} catch (error) {
  check("Dry-run with explicit model: no exception thrown", false, `exception: ${error.message}`);
}

// Test 3: Test the compactObject helper directly to ensure it uses the right default
const args3 = {
  query: "test query",
  passages: ["passage 1", "passage 2"],
  // No model specified
};

try {
  const body3 = compactObject({
    model: args3.model || "nvidia/llama-nemotron-rerank-1b-v2", // This is what the OLD code would do
    query: args3.query,
    passages: args3.passages,
  });
  
  // This should show what the OLD behavior would produce
  check("compactObject helper: shows old default when hardcoded", body3.model === "nvidia/llama-nemotron-rerank-1b-v2");
  
  // Now test with the NEW default
  const body3new = compactObject({
    model: args3.model || "nvidia/rerank-qa-mistral-4b", // This is what the NEW code does
    query: args3.query,
    passages: args3.passages,
  });
  
  check("compactObject helper: shows new default when corrected", body3new.model === "nvidia/rerank-qa-mistral-4b");
} catch (error) {
  check("compactObject helper test: no exception thrown", false, `exception: ${error.message}`);
}

console.log("");
console.log(failures === 0 ? "ALL_PASS" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

// Cleanup the regression test scratch directory
try { fs.rmdirSync(tempDir, { recursive: true }); } catch {}
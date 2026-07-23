import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root =
    'C:/Users/HP/AppData/Roaming/npm/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist'

const files = {
    jsonParse: join(root, 'utils/json-parse.js'),
    openai: join(root, 'api/openai-completions.js')
}

// Patch 1: json-parse.js - make parseStreamingJson throw on malformed input
let jsonParse = readFileSync(files.jsonParse, 'utf8')
const oldParse = `export function parseStreamingJson(partialJson) {
    if (!partialJson || partialJson.trim() === "") {
        return {};
    }
    try {
        return parseJsonWithRepair(partialJson);
    }
    catch {
        try {
            const result = partialParse(partialJson);
            return (result ?? {});
        }
        catch {
            try {
                const result = partialParse(repairJson(partialJson));
                return (result ?? {});
            }
            catch {
                return {};
            }
        }
    }
}`

const newParse = `export function parseStreamingJson(partialJson) {
    if (!partialJson || partialJson.trim() === "") {
        return {};
    }
    let parsed;
    try {
        parsed = parseJsonWithRepair(partialJson);
    }
    catch (e1) {
        try {
            parsed = partialParse(partialJson);
        }
        catch (e2) {
            try {
                parsed = partialParse(repairJson(partialJson));
            }
            catch (e3) {
                const err = new Error(
                    "[pi-ai patch] parseStreamingJson failed: malformed partial JSON: " + JSON.stringify(partialJson.slice(0, 120))
                );
                err.cause = e3;
                throw err;
            }
        }
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(
            "[pi-ai patch] parseStreamingJson returned non-object: " + typeof parsed + " (" + JSON.stringify(parsed).slice(0, 120) + ")"
        );
    }
    return parsed;
}`

if (!jsonParse.includes(newParse)) {
    if (!jsonParse.includes(oldParse)) {
        console.error('PATCH SKIP: json-parse.js already patched or anchor missing')
    } else {
        jsonParse = jsonParse.replace(oldParse, newParse)
        writeFileSync(files.jsonParse, jsonParse)
        console.log('Patched json-parse.js')
    }
} else {
    console.log('SKIP: json-parse.js already patched')
}

// Patch 2: openai-completions.js - accept top-level toolCall.arguments
let openai = readFileSync(files.openai, 'utf8')
const oldArgs = `                            let delta = "";
                            if (toolCall.function?.arguments) {
                                delta = toolCall.function.arguments;
                                block.partialArgs = (block.partialArgs ?? "") + toolCall.function.arguments;
                                block.arguments = parseStreamingJson(block.partialArgs);
                            }`

const newArgs = `                            let delta = "";
                            const rawArgs = toolCall.function?.arguments ?? toolCall.arguments;
                            if (rawArgs) {
                                delta = typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs);
                                block.partialArgs = (block.partialArgs ?? "") + delta;
                                block.arguments = parseStreamingJson(block.partialArgs);
                            }`

if (!openai.includes(newArgs)) {
    if (!openai.includes(oldArgs)) {
        console.error('PATCH SKIP: openai-completions.js already patched or anchor missing')
    } else {
        openai = openai.replace(oldArgs, newArgs)
        writeFileSync(files.openai, openai)
        console.log('Patched openai-completions.js')
    }
} else {
    console.log('SKIP: openai-completions.js already patched')
}

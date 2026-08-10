import assert from "node:assert/strict"
import { test } from "node:test"
import { publicStreamSummary, summarizePiJsonRpcStream } from "../../tools/agent-runtime/external-subagents/pi-stream-parser.mjs"

test("keeps public summary truthful when bounded tail starts inside huge Pi JSON", () => {
  const parsed = summarizePiJsonRpcStream('nt":[{"type":"text","text":"partial inside a truncated line"}]}}\n')
  const summary = publicStreamSummary(parsed, {
    assistantOutputSeen: true,
    lastTextPreview: "final worker answer from persisted metadata",
  })
  assert.equal(summary.visible_text_seen, true)
  assert.equal(summary.last_activity, "assistant_text")
  assert.equal(summary.parsed_events, 0)
  assert.equal(summary.skipped_fragments, 1)
})

test("extracts visible text from complete Pi message_update events", () => {
  const event = {
    type: "message_update",
    assistantMessageEvent: {
      partial: {
        content: [
          { type: "thinking", thinking: "checking" },
          { type: "text", text: "done" },
        ],
      },
    },
  }
  const summary = publicStreamSummary(summarizePiJsonRpcStream(`${JSON.stringify(event)}\n`))
  assert.equal(summary.visible_text_seen, true)
  assert.equal(summary.thinking_seen, true)
  assert.equal(summary.last_activity, "assistant_text")
})

function asString(value) {
  return typeof value === "string" ? value : ""
}

export function summarizePiJsonRpcStream(text) {
  const summary = { parsedEvents: 0, skippedFragments: 0, text: [], thinking: [], toolCalls: 0, lastActivity: undefined }
  for (const rawLine of asString(text).split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    if (!line.startsWith("{") && !line.startsWith("[")) {
      summary.skippedFragments += 1
      continue
    }
    try {
      const parsed = JSON.parse(line)
      summary.parsedEvents += 1
      const blocks = parsed?.assistantMessageEvent?.partial?.content || parsed?.partial?.content || parsed?.message?.content || []
      for (const block of Array.isArray(blocks) ? blocks : []) {
        if (block?.type === "text" && block.text) {
          summary.text.push(block.text)
          summary.lastActivity = "assistant_text"
        }
        if (block?.type === "thinking" && block.thinking) {
          summary.thinking.push(block.thinking)
          if (!summary.lastActivity) summary.lastActivity = "thinking"
        }
        if (block?.type === "tool_use" || block?.type === "tool_call") {
          summary.toolCalls += 1
          summary.lastActivity = "tool_call"
        }
      }
    } catch {
      summary.skippedFragments += 1
    }
  }
  return summary
}

export function publicStreamSummary(parsed, fallback = {}) {
  const text = parsed.text.join("")
  const thinking = parsed.thinking.join("")
  const fallbackVisibleTextSeen = Boolean(fallback.assistantOutputSeen && asString(fallback.lastTextPreview).trim())
  return {
    last_activity: parsed.lastActivity || (fallbackVisibleTextSeen ? "assistant_text" : undefined),
    visible_text_seen: Boolean(text) || fallbackVisibleTextSeen,
    thinking_seen: Boolean(thinking),
    thinking_preview: thinking ? thinking.slice(-1200) : undefined,
    tool_call_seen: parsed.toolCalls > 0,
    parsed_events: parsed.parsedEvents,
    skipped_fragments: parsed.skippedFragments,
  }
}

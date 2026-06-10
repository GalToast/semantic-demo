# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# MCP Subagents
- Use current MCP external subagents tool nomenclature, not outdated "decompose and delegate skill" terminology. Confidence: 0.85
- When dispatching subagents, use Kilo provider with nex-agi/nex-n2-pro:free model. Confidence: 0.80
- Actively monitor dispatched subagents via external_subagent_poll and external_subagent_read, don't just fire-and-forget. Confidence: 0.75

# Tool Awareness
- Trust that MCP tools are available when user confirms they're connected, even if not immediately visible in tool catalog. Confidence: 0.70
- When user configures custom agents via `/agents` command and confirms they're available, trust this and attempt to use them. Confidence: 0.80
- When agent tools fail with generic errors, consult Command Code documentation for troubleshooting guidance. Confidence: 0.65

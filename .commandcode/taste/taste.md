# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# MCP Subagents
See [mcp-subagents/taste.md](mcp-subagents/taste.md)

# Tool Awareness
- Trust that MCP tools are available when user confirms they're connected, even if not immediately visible in tool catalog. Confidence: 0.70
- When user configures custom agents via `/agents` command and confirms they're available, trust this and attempt to use them. Confidence: 0.80
- When agent tools fail with generic errors, consult Command Code documentation for troubleshooting guidance. Confidence: 0.65

# Semantic Explorer
- Migrate production entry from legacy dist/bundle.js to src/ Vite/Svelte entry. Confidence: 0.75
- Update build/deploy/tests when switching to new entry point. Confidence: 0.70

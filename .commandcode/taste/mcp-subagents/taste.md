# MCP Subagents
- Use current MCP external subagents tool nomenclature, not outdated "decompose and delegate skill" terminology. Confidence: 0.85
- When dispatching subagents, use Kilo provider with nex-agi/nex-n2-pro:free model. Confidence: 0.80
- Actively monitor dispatched subagents via external_subagent_poll and external_subagent_read, don't just fire-and-forget. Confidence: 0.75
- Prefer paid opencode-go/mimo-v2.5 model over free tiers for complex migration work. Confidence: 0.90
- Use live_steer=true on qwen harness for paid models to enable real-time guidance. Confidence: 0.85
- When workers get stuck at 9KB stdout (bootstrapping bottleneck), cancel and relaunch with shorter prompts or different model. Confidence: 0.80

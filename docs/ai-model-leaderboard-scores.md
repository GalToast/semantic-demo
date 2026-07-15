# AI Model LLM Leaderboard Scores

**Source:** [artificialanalysis.ai LLM Leaderboard](https://artificialanalysis.ai/leaderboards/models)  
**Date verified:** 2026-07-15

## Intelligence Scores

Models from the project's Pi harness lane inventory, mapped to their official names on the artificialanalysis.ai leaderboard.

| Project ID                  | Leaderboard Name            | Intelligence Index | Notes                               |
| --------------------------- | --------------------------- | ------------------ | ----------------------------------- |
| `mimo-v2.5-free`            | **MiMo-V2.5-Pro**           | **42**             | Reasoning model variant             |
| `deepseek-v4-flash-free`    | **DeepSeek V4 Flash (Max)** | **40**             | Max effort reasoning                |
| `qwen3.6-plus-free`         | **Qwen3.6 Plus**            | **40**             | Not in live free catalog 2026-07-15 |
| `nemotron-3-ultra-free`     | **Nemotron 3 Ultra**        | **38**             | —                                   |
| `grok 4.3`                  | **Grok 4.3 (high)**         | **38**             | High reasoning tier                 |
| `north-mini-code-free`      | **North Mini Code**         | **21\***           | Asterisk = reasoning variant        |
| `hy3-free`                  | —                           | **N/A**            | Not listed on artificialanalysis.ai, new lane (added 2026-07-15) |
| `kilo/openrouter/owl-alpha` | —                           | **N/A**            | Not listed on artificialanalysis.ai |
| `agnes-2.0-flash`           | —                           | **N/A**            | Not listed on artificialanalysis.ai |

### Key

- **Intelligence Index** (range ~10–60): composite benchmark from artificialanalysis.ai v4.1 (GDPval-AA, Terminal-Bench, SciCode, HLE, GPQA, etc.)
- **Asterisk (\*)** on the leaderboard indicates a reasoning/thought variant.

## Coding Scores

| Project ID                  | Coding Index | Status                      |
| --------------------------- | ------------ | --------------------------- |
| `mimo-v2.5-free`            | —            | **Not currently available** |
| `deepseek-v4-flash-free`    | —            | **Not currently available** |
| `qwen3.6-plus-free`         | —            | **Not currently available** (dormant in live free catalog 2026-07-15) |
| `nemotron-3-ultra-free`     | —            | **Not currently available** |
| `grok 4.3`                  | —            | **Not currently available** |
| `north-mini-code-free`      | —            | **Not currently available** |
| `hy3-free`                  | —            | **N/A** (new lane, score TBD) |
| `kilo/openrouter/owl-alpha` | —            | Not listed                  |
| `agnes-2.0-flash`           | —            | Not listed                  |

**Note:** artificialanalysis.ai shows per-model "Coding Index" tabs, but all tested models display "Not currently available" at this time. This appears to be a platform-wide data unavailability rather than model-specific.

## Individual Coding Benchmarks (Intelligence Breakdown)

For models that _are_ on the leaderboard, the Intelligence Breakdown section includes the following coding-related sub-scores (as percentages):

### DeepSeek V4 Flash (Max)

- **Terminal-Bench v2.1:** 62%
- **SciCode:** 45%

(Other models' detailed sub-scores can be queried per-model on the site, but the dedicated "Coding Index" composite is not yet published.)

## Why `owl-alpha` and `agnes-2.0-flash` Are Missing

- **`kilo/openrouter/owl-alpha`:** This is a custom router/model identifier (Kilo via OpenRouter). It does not appear as a named model on artificialanalysis.ai.
- **`agnes-2.0-flash`:** Agnes models are not yet indexed on artificialanalysis.ai. They may be added in a future leaderboard update.

---

_For internal use — cross-reference with `docs/subagent-models.md` and the harness `model-providers.json` before routing subagents._

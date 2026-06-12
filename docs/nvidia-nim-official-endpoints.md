# NVIDIA NIM Official Endpoint Inventory

Generated 2026-06-12 from the official NVIDIA NIM API reference page `https://docs.api.nvidia.com/nim/reference/models-1` plus the local router snapshot `http://127.0.0.1:8788/nvidia/v1/models`.

This is the exhaustive endpoint checklist from the official API reference sidebar as parsed this run. It intentionally includes endpoints that are not currently exposed by our local OpenAI-compatible router.

## Counts

- Official API reference parent endpoints: 138
- Official API reference categories: 7
- Local router-exposed NVIDIA lane models: 120

## Local Router Snapshot

The local router snapshot is saved at `tmp/nvidia-router-models-2026-06-12.json`. Use the `nvidia/<model-id>` provider-qualified launch ref for external subagents when the model appears in the local router list.

## Official API Reference Endpoints
## climate simulation (2)
- nvidia / corrdiff </nim/reference/nvidia-corrdiff>
- nvidia / fourcastnet </nim/reference/nvidia-fourcastnet>

## Healthcare (15)
- arc / evo2-40b </nim/reference/arc-evo2-40b>
- colabfold / msa-search </nim/reference/colabfold-msa-search>
- deepmind / alphafold2 </nim/reference/deepmind-alphafold2>
- deepmind / alphafold2-multimer </nim/reference/deepmind-alphafold2-multimer>
- ipd / proteinmpnn </nim/reference/ipd-proteinmpnn>
- ipd / rfdiffusion </nim/reference/ipd-rfdiffusion>
- meta / esm2-650m </nim/reference/meta-esm2-650m>
- meta / esmfold </nim/reference/meta-esmfold>
- mit / boltz2 </nim/reference/mit-boltz2>
- mit / diffdock </nim/reference/mit-diffdock>
- nvidia / genmol </nim/reference/nvidia-genmol>
- nvidia / molmim </nim/reference/nvidia-molmim>
- nvidia / vista3d </nim/reference/nvidia-vista3d>
- openfold / openfold2 </nim/reference/openfold-openfold2>
- openfold / openfold3 </nim/reference/openfold-openfold3>

## Large Language models (53)
- abacusai / dracarys-llama-3.1-70b-instruct </nim/reference/abacusai-dracarys-llama-3_1-70b-instruct>
- bytedance / seed-oss-36b-instruct </nim/reference/bytedance-seed-oss-36b-instruct>
- deepseek-ai / deepseek-v4-flash </nim/reference/deepseek-ai-deepseek-v4-flash>
- deepseek-ai / deepseek-v4-pro </nim/reference/deepseek-ai-deepseek-v4-pro>
- google / codegemma-7b </nim/reference/google-codegemma-7b>
- google / gemma-2-2b-it </nim/reference/google-gemma-2-2b-it>
- google / gemma-7b </nim/reference/google-gemma-7b>
- meta / llama-3.1-70b-instruct </nim/reference/meta-llama-3_1-70b>
- meta / llama-3.1-8b-instruct </nim/reference/meta-llama-3_1-8b>
- meta / llama-3.2-1b-instruct </nim/reference/meta-llama-3_2-1b-instruct>
- meta / llama-3.2-3b-instruct </nim/reference/meta-llama-3_2-3b-instruct>
- meta / llama-3.3-70b-instruct </nim/reference/meta-llama-3_3-70b-instruct>
- meta / llama2-70b </nim/reference/meta-llama2-70b>
- microsoft / phi-4-mini-flash-reasoning </nim/reference/microsoft-phi-4-mini-flash-reasoning>
- microsoft / phi-4-mini-instruct </nim/reference/microsoft-phi-4-mini-instruct>
- minimaxai / minimax-m2.5 </nim/reference/minimaxai-minimax-m2.5>
- minimaxai / minimax-m2.7 </nim/reference/minimaxai-minimax-m2.7>
- mistralai / mistral-nemotron </nim/reference/mistralai-mistral-nemotron>
- mistralai / mixtral-8x22b-instruct </nim/reference/mistralai-mixtral-8x22b-instruct>
- mistralai / mixtral-8x7b-instruct </nim/reference/mistralai-mixtral-8x7b-instruct>
- moonshotai / kimi-k2-instruct </nim/reference/moonshotai-kimi-k2-instruct>
- moonshotai / kimi-k2-thinking </nim/reference/moonshotai-kimi-k2-thinking>
- nvidia / gliner-pii </nim/reference/nvidia-gliner-pii>
- nvidia / llama-3.1-nemoguard-8b-content-safety </nim/reference/nvidia-llama-3_1-nemoguard-8b-content-safety>
- nvidia / llama-3.1-nemoguard-8b-topic-control </nim/reference/nvidia-llama-3_1-nemoguard-8b-topic-control>
- nvidia / llama-3.1-nemotron-nano-8b-v1 </nim/reference/nvidia-llama-3_1-nemotron-nano-8b-v1>
- nvidia / llama-3.1-nemotron-safety-guard-8b-v3 </nim/reference/nvidia-llama-3_1-nemotron-safety-guard-8b-v3>
- nvidia / llama-3.1-nemotron-ultra-253b-v1 </nim/reference/nvidia-llama-3_1-nemotron-ultra-253b-v1>
- nvidia / llama-3.3-nemotron-super-49b-v1 </nim/reference/nvidia-llama-3_3-nemotron-super-49b-v1>
- nvidia / llama-3.3-nemotron-super-49b-v1.5 </nim/reference/nvidia-llama-3_3-nemotron-super-49b-v1_5>
- nvidia / nemoguard-jailbreak-detect </nim/reference/nvidia-nemoguard-jailbreak-detect>
- nvidia / nemotron-3-nano-30b-a3b </nim/reference/nvidia-nemotron-3-nano-30b-a3b>
- nvidia / nemotron-3-super-120b-a12b </nim/reference/nvidia-nemotron-3-super-120b-a12b>
- nvidia / nemotron-3-ultra-550b-a55b </nim/reference/nvidia-nemotron-3-ultra-550b-a55b>
- nvidia / nemotron-content-safety-reasoning-4b </nim/reference/nvidia-nemotron-content-safety-reasoning-4b>
- nvidia / nemotron-mini-4b-instruct </nim/reference/nvidia-nemotron-mini-4b-instruct>
- nvidia / nvidia-nemotron-nano-9b-v2 </nim/reference/nvidia-nvidia-nemotron-nano-9b-v2>
- nvidia / riva-translate-4b-instruct-v1_1 </nim/reference/nvidia-riva-translate-4b-instruct-v1_1>
- nvidia / usdcode </nim/reference/nvidia-usdcode>
- openai / gpt-oss-120b </nim/reference/openai-gpt-oss-120b>
- openai / gpt-oss-20b </nim/reference/openai-gpt-oss-20b>
- qwen / qwen2.5-coder-32b-instruct </nim/reference/qwen-qwen2_5-coder-32b-instruct>
- qwen / qwen3-5-122b-a10b </nim/reference/qwen-qwen3-5-122b-a10b>
- qwen / qwen3-coder-480b-a35b-instruct </nim/reference/qwen-qwen3-coder-480b-a35b-instruct>
- qwen / qwen3-next-80b-a3b-instruct </nim/reference/qwen-qwen3-next-80b-a3b-instruct>
- qwen / qwen3-next-80b-a3b-thinking </nim/reference/qwen-qwen3-next-80b-a3b-thinking>
- qwen / qwq-32b </nim/reference/qwen-qwq-32b>
- sarvamai / sarvam-m </nim/reference/sarvamai-sarvam-m>
- stepfun-ai / step-3-5-flash </nim/reference/stepfun-ai-step-3-5-flash>
- stockmark / stockmark-2-100b-instruct </nim/reference/stockmark-stockmark-2-100b-instruct>
- upstage / solar-10.7b-instruct </nim/reference/upstage-solar-10_7b-instruct>
- z-ai / glm4.7 </nim/reference/z-ai-glm4-7>
- z-ai / glm5.1 </nim/reference/z-ai-glm5.1>

## multimodAl (9)
- black-forest-labs / flux.1-kontext-dev </nim/reference/black-forest-labs-flux_1-kontext-dev>
- google / paligemma </nim/reference/google-paligemma>
- meta / llama-3.2-11b-vision-instruct </nim/reference/meta-llama-3_2-11b-vision-instruct>
- meta / llama-3.2-90b-vision-instruct </nim/reference/meta-llama-3_2-90b-vision-instruct>
- meta / llama-4-maverick-17b-128e-instruct </nim/reference/meta-llama-4-maverick-17b-128e-instruct>
- moonshotai / kimi-k2.5 </nim/reference/moonshotai-kimi-k2-5>
- nvidia / llama-3.1-nemotron-nano-vl-8b-v1 </nim/reference/nvidia-llama-3_1-nemotron-nano-vl-8b-v1>
- nvidia / nemotron-3-content-safety </nim/reference/nvidia-nemotron-3-content-safety>
- qwen / qwen3.5-397b-a17b </nim/reference/qwen-qwen3-5-397b-a17b>

## Retrieval (21)
- baai / bge-m3 </nim/reference/baai-bge-m3>
- nvidia / embed-qa-4 </nim/reference/nvidia-embed-qa-4>
- nvidia / llama-3.2-nemoretriever-1b-vlm-embed-v1 </nim/reference/nvidia-llama-3_2-nemoretriever-1b-vlm-embed-v1>
- nvidia / llama-3.2-nemoretriever-300m-embed-v1 </nim/reference/nvidia-llama-3_2-nemoretriever-300m-embed-v1>
- nvidia / llama-3.2-nemoretriever-300m-embed-v2 </nim/reference/nvidia-llama-3_2-nemoretriever-300m-embed-v2>
- nvidia / llama-3.2-nemoretriever-500m-rerank-v2 </nim/reference/nvidia-llama-3_2-nemoretriever-500m-rerank-v2>
- nvidia / llama-3.2-nv-embedqa-1b-v1 </nim/reference/nvidia-llama-3_2-nv-embedqa-1b-v1>
- nvidia / llama-3.2-nv-embedqa-1b-v2 </nim/reference/nvidia-llama-3_2-nv-embedqa-1b-v2>
- nvidia / llama-3.2-nv-rerankqa-1b-v1 </nim/reference/nvidia-llama-3_2-nv-rerankqa-1b-v1>
- nvidia / llama-3.2-nv-rerankqa-1b-v2 </nim/reference/nvidia-llama-3_2-nv-rerankqa-1b-v2>
- nvidia / llama-nemotron-embed-1b-v2 </nim/reference/nvidia-llama-nemotron-embed-1b-v2>
- nvidia / llama-nemotron-embed-vl-1b-v2 </nim/reference/nvidia-llama-nemotron-embed-vl-1b-v2>
- nvidia / llama-nemotron-rerank-1b-v2 </nim/reference/nvidia-llama-nemotron-rerank-1b-v2>
- nvidia / llama-nemotron-rerank-vl-1b-v2 </nim/reference/nvidia-llama-nemotron-rerank-vl-1b-v2>
- nvidia / nv-embed-v1 </nim/reference/nvidia-nv-embed-v1>
- nvidia / nv-embedcode-7b-v1 </nim/reference/nvidia-nv-embedcode-7b-v1>
- nvidia / nv-embedqa-e5-v5 </nim/reference/nvidia-nv-embedqa-e5-v5>
- nvidia / nv-rerankqa-mistral-4b-v3 </nim/reference/nvidia-nv-rerankqa-mistral-4b-v3>
- nvidia / nvclip </nim/reference/nvidia-nvclip>
- nvidia / rerank-qa-mistral-4b </nim/reference/nvidia-rerank-qa-mistral-4b>
- snowflake / arctic-embed-l </nim/reference/snowflake-arctic-embed-l>

## route optimization (1)
- nvidia / cuOpt </nim/reference/nvidia-cuopt>

## Visual Models (37)
- black forest labs / flux.1-dev </nim/reference/black-forest-labs-flux_1-dev>
- black forest labs / flux.1-schnell </nim/reference/black-forest-labs-flux_1-schnell>
- black forest labs / flux.2-klein-4b </nim/reference/black-forest-labs-flux_2-klein-4b>
- google / diffusiongemma-26b-a4b-it </nim/reference/diffusiongemma-26b-a4b-it>
- google / gemma-3-27b-it </nim/reference/google-gemma-3-27b-it>
- google / gemma-3n-e2b-it </nim/reference/google-gemma-3n-e2b-it>
- google / gemma-3n-e4b-it </nim/reference/google-gemma-3n-e4b-it>
- google / gemma-4-31b-it </nim/reference/google-gemma-4-31b-it>
- hive / ai-generated-image-detection </nim/reference/hive-ai-generated-image-detection>
- hive / deepfake-image-detection </nim/reference/hive-deepfake-image-detection>
- meta / llama-guard-4-12b </nim/reference/meta-llama-guard-4-12b>
- microsoft / phi-4-multimodal-instruct </nim/reference/microsoft-phi-4-multimodal-instruct>
- microsoft / trellis </nim/reference/microsoft-trellis>
- mistralai / ministral-14b-instruct-2512 </nim/reference/mistralai-ministral-14b-instruct-2512>
- mistralai / mistral-7b-instruct-v0.3 </nim/reference/mistralai-mistral-7b-instruct-v03>
- mistralai / mistral-large-3-675b-instruct-2512 </nim/reference/mistralai-mistral-large-3-675b-instruct-2512>
- mistralai / mistral-medium-3.5-128b </nim/reference/mistralai-mistral-medium-3-5-128b>
- mistralai / mistral-small-4-119b-2603 </nim/reference/mistralai-mistral-small-4-119b-2603>
- moonshotai / kimi-k2.6 </nim/reference/moonshotai-kimi-k2-6>
- nvidia / bevformer </nim/reference/nvidia-bevformer>
- nvidia / ising-calibration-1-35b-a3b </nim/reference/nvidia-ising-calibration-1-35b-a3b>
- nvidia / nemoretriever-parse </nim/reference/nvidia-nemoretriever-parse>
- nvidia / nemotron-3-nano-omni-30b-a3b-reasoning </nim/reference/nvidia-nemotron-3-nano-omni-30b-a3b-reasoning>
- nvidia / nemotron-nano-12b-v2-vl </nim/reference/nvidia-nemotron-nano-12b-v2-vl>
- nvidia / nemotron-parse </nim/reference/nvidia-nemotron-parse>
- nvidia / nv-dinov2 </nim/reference/nvidia-nv-dinov2>
- nvidia / nv-grounding-dino </nim/reference/nvidia-nv-grounding-dino>
- nvidia / retail-object-detection </nim/reference/nvidia-retail-object-detection>
- nvidia / sparsedrive </nim/reference/nvidia-sparsedrive>
- nvidia / streampetr </nim/reference/nvidia-streampetr>
- nvidia / vila </nim/reference/nvidia-vila>
- nvidia / visual-changenet </nim/reference/nvidia-visual-changenet>
- nvidia /nemotron-3.5-content-safety </nim/reference/nvidia-nemotron-3-5-content-safety>
- stabilityai / stable-diffusion-3-medium </nim/reference/stabilityai-stable-diffusion-3-medium>
- stabilityai / stable-diffusion-xl </nim/reference/stabilityai-stable-diffusion-xl>
- stabilityai / stable-video-diffusion </nim/reference/stabilityai-stable-video-diffusion>
- stepfun-ai / step-3-7-flash </nim/reference/stepfun-ai-step-3-7-flash>



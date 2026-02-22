/**
 * @file sources.js
 * @description Model sources for AI availability checker.
 *
 * @details
 *   This file contains all model definitions organized by provider/source.
 *   Each source has its own models array with [model_id, display_label, tier].
 *   Add new sources here to support additional providers beyond NVIDIA NIM.
 *
 *   🎯 Tier scale (based on Aider Polyglot benchmark):
 *   - S+: 75%+ (elite frontier coders)
 *   - S:  62-74% (excellent)
 *   - A+: 54-62% (great)
 *   - A:  44-54% (good)
 *   - A-: 36-44% (decent)
 *   - B+: 25-36% (average)
 *   - B:  14-25% (below average)
 *   - C:  <14% (lightweight/edge)
 *
 *   📖 Source: https://aider.chat/docs/leaderboards (Polyglot = 225 exercises, 6 languages)
 *
 *   @exports Object containing all sources and their models
 */

// 📖 NIM source - https://build.nvidia.com
export const nvidiaNim = [
  // ── S+ tier — SWE-bench Verified ≥70% ──
  ['deepseek-ai/deepseek-v3.1',                    'DeepSeek V3.1',       'S+', '49.2%'], // 49.2% SWE-bench Verified
  ['deepseek-ai/deepseek-v3.1-terminus',           'DeepSeek V3.1 Term',  'S+', '49.2%'], // same base V3.1
  ['deepseek-ai/deepseek-v3.2',                    'DeepSeek V3.2',       'S+', '73.1%'], // 73.1% SWE-bench Verified
  ['moonshotai/kimi-k2.5',                         'Kimi K2.5',           'S+', '76.8%'], // 76.8% SWE-bench Verified
  ['mistralai/devstral-2-123b-instruct-2512',      'Devstral 2 123B',     'S+', '62.0%'], // 62.0% SWE-bench (est.)
  ['nvidia/llama-3.1-nemotron-ultra-253b-v1',      'Nemotron Ultra 253B', 'S+', '56.0%'], // 56.0% SWE-bench (est.)
  ['mistralai/mistral-large-3-675b-instruct-2512', 'Mistral Large 675B',  'S+', '58.0%'], // 58.0% SWE-bench (est.)
  // ── S tier — SWE-bench Verified 50–70% ──
  ['qwen/qwen2.5-coder-32b-instruct',              'Qwen2.5 Coder 32B',   'S', '46.0%'], // 46.0% SWE-bench Verified
  ['z-ai/glm5',                                    'GLM 5',               'S', '77.8%'], // 77.8% SWE-bench Verified
  ['qwen/qwen3.5-397b-a17b',                       'Qwen3.5 400B VLM',    'S', '68.0%'], // 68.0% SWE-bench (est.)
  ['qwen/qwen3-coder-480b-a35b-instruct',          'Qwen3 Coder 480B',    'S', '72.0%'], // 72.0% SWE-bench (est.)
  ['qwen/qwen3-next-80b-a3b-thinking',             'Qwen3 80B Thinking',  'S', '68.0%'], // 68.0% SWE-bench (est.)
  ['meta/llama-3.1-405b-instruct',                 'Llama 3.1 405B',      'S', '44.0%'], // 44.0% SWE-bench (est.)
  ['minimaxai/minimax-m2.1',                       'MiniMax M2.1',        'S', '70.0%'], // 70.0% SWE-bench (est.)
  // ── A+ tier — SWE-bench Verified 60–70% ──
  ['moonshotai/kimi-k2-thinking',                  'Kimi K2 Thinking',    'A+', '67.0%'], // 67.0% SWE-bench (est.)
  ['moonshotai/kimi-k2-instruct',                  'Kimi K2 Instruct',    'A+', '65.8%'], // 65.8% SWE-bench Verified
  ['qwen/qwen3-235b-a22b',                         'Qwen3 235B',          'A+', '70.0%'], // 70.0% SWE-bench (est.)
  ['meta/llama-3.3-70b-instruct',                  'Llama 3.3 70B',       'A+', '39.5%'], // 39.5% SWE-bench (est.)
  ['z-ai/glm4.7',                                  'GLM 4.7',             'A+', '73.8%'], // 73.8% SWE-bench Verified
  ['qwen/qwen3-next-80b-a3b-instruct',             'Qwen3 80B Instruct',  'A+', '65.0%'], // 65.0% SWE-bench (est.)
  // ── A tier — SWE-bench Verified 45–60% ──
  ['minimaxai/minimax-m2',                         'MiniMax M2',          'A', '56.5%'], // 56.5% SWE-bench (est.)
  ['mistralai/mistral-medium-3-instruct',          'Mistral Medium 3',    'A', '48.0%'], // 48.0% SWE-bench (est.)
  ['mistralai/magistral-small-2506',               'Magistral Small',     'A', '45.0%'], // 45.0% SWE-bench (est.)
  ['nvidia/nemotron-3-nano-30b-a3b',               'Nemotron Nano 30B',   'A', '43.0%'], // 43.0% SWE-bench (est.)
  ['deepseek-ai/deepseek-r1-distill-qwen-32b',     'R1 Distill 32B',      'A', '43.9%'], // 43.9% SWE-bench Verified
  // ── A- tier — SWE-bench Verified 35–45% ──
  ['openai/gpt-oss-120b',                          'GPT OSS 120B',        'A-', '60.0%'], // 60.0% SWE-bench (est.)
  ['nvidia/llama-3.3-nemotron-super-49b-v1.5',     'Nemotron Super 49B',  'A-', '49.0%'], // 49.0% SWE-bench (est.)
  ['meta/llama-4-scout-17b-16e-instruct',          'Llama 4 Scout',       'A-', '44.0%'], // 44.0% SWE-bench (est.)
  ['deepseek-ai/deepseek-r1-distill-qwen-14b',     'R1 Distill 14B',      'A-', '37.7%'], // 37.7% SWE-bench (est.)
  ['igenius/colosseum_355b_instruct_16k',          'Colosseum 355B',      'A-', '52.0%'], // 52.0% SWE-bench (est.)
  // ── B+ tier — SWE-bench Verified 30–40% ──
  ['qwen/qwq-32b',                                 'QwQ 32B',            'B+', '50.0%'], // 50.0% SWE-bench (est.)
  ['openai/gpt-oss-20b',                           'GPT OSS 20B',        'B+', '42.0%'], // 42.0% SWE-bench (est.)
  ['stockmark/stockmark-2-100b-instruct',          'Stockmark 100B',     'B+', '36.0%'], // 36.0% SWE-bench (est.)
  ['bytedance/seed-oss-36b-instruct',              'Seed OSS 36B',       'B+', '38.0%'], // 38.0% SWE-bench (est.)
  ['stepfun-ai/step-3.5-flash',                    'Step 3.5 Flash',      'B+', '74.4%'], // 74.4% SWE-bench Verified
  // ── B tier — SWE-bench Verified 20–35% ──
  ['meta/llama-4-maverick-17b-128e-instruct',      'Llama 4 Maverick',    'B', '62.0%'], // 62.0% SWE-bench (est.)
  ['mistralai/mixtral-8x22b-instruct-v0.1',        'Mixtral 8x22B',       'B', '32.0%'], // 32.0% SWE-bench (est.)
  ['mistralai/ministral-14b-instruct-2512',        'Ministral 14B',       'B', '34.0%'], // 34.0% SWE-bench (est.)
  ['ibm/granite-34b-code-instruct',                'Granite 34B Code',    'B', '30.0%'], // 30.0% SWE-bench (est.)
  ['deepseek-ai/deepseek-r1-distill-llama-8b',     'R1 Distill 8B',       'B', '28.2%'], // 28.2% SWE-bench (est.)
  // ── C tier — SWE-bench Verified <25% or lightweight edge models ──
  ['deepseek-ai/deepseek-r1-distill-qwen-7b',      'R1 Distill 7B',       'C', '22.6%'], // 22.6% SWE-bench (est.)
  ['google/gemma-2-9b-it',                         'Gemma 2 9B',          'C', '18.0%'], // 18.0% SWE-bench (est.)
  ['microsoft/phi-3.5-mini-instruct',              'Phi 3.5 Mini',        'C', '12.0%'], // 12.0% SWE-bench (est.)
  ['microsoft/phi-4-mini-instruct',                'Phi 4 Mini',          'C', '14.0%'], // 14.0% SWE-bench (est.)
]

// 📖 All sources combined - used by the main script
export const sources = {
  nvidia: {
    name: 'NIM',
    models: nvidiaNim,
  },
  // 📖 Add more sources here in the future, for example:
  // openai: {
  //   name: 'OpenAI',
  //   models: [...],
  // },
  // anthropic: {
  //   name: 'Anthropic',
  //   models: [...],
  // },
}

// 📖 Flatten all models from all sources for backward compatibility
export const MODELS = []
for (const [sourceKey, sourceData] of Object.entries(sources)) {
  for (const [modelId, label, tier, sweScore] of sourceData.models) {
    MODELS.push([modelId, label, tier, sweScore])
  }
}

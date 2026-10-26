# Chinese vs English inference latency

## What the current evidence says

The exploratory paired run in [`reports/chinese-evaluation-v1.md`](../reports/chinese-evaluation-v1.md) used the same Qwen3.5-9B artifact and machine for five short cases per language. Chinese warm outputs averaged 7.18 generated tokens/second and English 7.19. Chinese averaged 194 generated tokens and 35.1 seconds total (four warm cases), compared with English at 132 tokens and 26.0 seconds (five warm cases). This points to longer output as the main latency difference in these examples, rather than slower Chinese token decoding. It is a small fixed-order run without a seed, so it does not settle behavior on the user's longer articles.

The exact model artifact used was `qwen3.5:9b`, digest `56671c2ab9385f9cfcb404638e32cd62d88e3501d44822208363c010179a3c90`, Q4_K_M, using Ollama 0.40.9. The machine was an Intel Core Ultra 7 265H with 31.5 GiB detected RAM; Ollama reported no VRAM use. The older saved phrase-quality records contain no paired Chinese/English timing data.

The extraction code uses one model and one chat endpoint for every language. The general instructions are shared, with a short Chinese-specific instruction. Chinese responses also require a `pinyin` value per phrase; all languages require Korean meaning and note fields. Those extra generated fields can increase output token count and time. Differences in source length, number of phrases, cold model loading, and input/output tokenization can also affect latency. The measured decode rates are similar, but longer article requests still need a paired benchmark. Chinese capability and inference speed are separate properties; strong Chinese quality does not imply equal tokens-per-second or equal end-to-end latency across languages.

## Instrumentation added

Phrase responses now expose Ollama's model load, prompt evaluation, and generation durations, cached and total prompt token counts, generated token count, and prompt/generation token rates alongside total duration. Ollama reports these raw durations in nanoseconds; the API converts them to milliseconds and computes tokens per second. This lets the existing harness separate startup, prompt processing, and decoding costs.

## Comparison to run

Use the same installed model digest, machine, extraction settings, and maximum phrase count. Prepare reviewed English and Chinese passages of similar length and comparable difficulty, and record the required Chinese pinyin field as part of the output contract. Run five cold and five warm requests per language, alternate language order, and retain all per-request stats. Report p50/p95 for total, load, prompt, and generation time; prompt/output tokens; and prompt/output tokens per second. Compare both absolute time and time per generated token. Keep quality review separate from latency conclusions.

Interpretation: a large Chinese `generated_tokens` count with similar generation tokens/second points to output length; lower Chinese generation tokens/second points to a decode/runtime or hardware path difference; high `model_load_ms` points to cold-start variance; high `prompt_eval_ms` points to prompt length or prompt processing. Cached prompt counts and warm runs help identify cache effects. Only after this baseline should a prompt or output-schema change be tested as one variable against the same examples. Do not fine-tune weights to address latency until the measured bottleneck and a separate quality need justify it.

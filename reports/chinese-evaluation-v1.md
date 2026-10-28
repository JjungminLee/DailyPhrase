# Qwen Chinese extraction evaluation · v1

**Run:** 2026-10-26 17:33 KST

**Dataset:** `daily-phrase-eval-v1` (`data/evaluation-set-v1.json`, 20 self-authored cases; SHA-256 recorded in the result JSON)
**Raw run:** [`model-evaluation-2026-10-26T08-33-09.981Z.json`](../results/model-evaluation-2026-10-26T08-33-09.981Z.json)

## Setup

- Model: `qwen3.5:9b`, digest `56671c2ab9385f9cfcb404638e32cd62d88e3501d44822208363c010179a3c90`, GGUF `Q4_K_M`, 9B parameters.
- Runtime: Ollama 0.40.9, llama.cpp runner, 4096 context; observed VRAM use 0 bytes.
- Machine: Intel Core Ultra 7 265H, 16 logical CPUs, 31.5 GiB detected RAM, Windows x64.
- Same extraction prompt template, one phrase requested per case, temperature 0.1, output cap 500 tokens. No seed was set. Model outputs and per-request Ollama statistics are in the raw result.
- Cases are evaluation-only and must not be used for training, prompt examples, or retrieval. Their short source passages and labels were authored for this evaluation.

## Results

| Language | Successful | Source-grounded outputs | Exact canonical phrase | Required pronunciation field |
|---|---:|---:|---:|---:|
| Chinese | 5/5 | 4/5 | 0/5 | Pinyin field 5/5; correct tone-marked pinyin 0/5 |
| English | 5/5 | 5/5 | 3/5 | Not applicable |
| French | 5/5 | 5/5 | 2/5 | Not applicable |
| Japanese | 5/5 | 5/5 | 2/5 | Reading field 5/5 |

An exact canonical phrase match is intentionally strict: a different but valid phrase is counted as a mismatch, so it is not a standalone quality score. Human review of the Chinese outputs found four usable, source-grounded phrase choices and one unusable template (`离...很近`) that is not a literal source substring. The production source validator should reject that template.

All five Chinese responses populated `pinyin`, but none met the complete required format. Four omitted tone marks or used numeric tone notation; one included some tone marks but failed to separate every syllable. One gave the syllables for `可能会` in the wrong order. This is the clearest repeated Chinese-specific quality defect in this sample. Chinese phrase selection was generally useful, although `可能会` by itself is less useful than the complete source pattern `可能会下雨`.

### Human review of Chinese outputs

Scores use the repository's 1–3 rubric (1 incorrect/unusable, 2 partly correct/needs editing, 3 correct/useful). These are five-case counts, not statistically reliable estimates.

| Case | Grounding | Chinese correctness | Beginner usefulness | Pinyin | Korean fields | Review note |
|---|---:|---:|---:|---:|---:|---|
| zh-01 | 3 | 3 | 2 | 1 | 2 | `可能会` is grounded but incomplete; pinyin syllables are out of order. |
| zh-02 | 3 | 3 | 3 | 1 | 2 | `每天早上` is useful; pinyin has some tones but does not separate all syllables, and the Korean note is awkward. |
| zh-03 | 3 | 3 | 3 | 1 | 3 | Good phrase choice; pinyin uses tone numbers and has tone errors. |
| zh-04 | 1 | 2 | 1 | 1 | 1 | `离...很近` is a generated template, not a source substring. |
| zh-05 | 3 | 3 | 3 | 1 | 3 | Good phrase and Korean fields; pinyin omits tones. |
| **Mean** | **2.6** | **2.8** | **2.4** | **1.0** | **2.2** | |

## Chinese vs English speed

The first Chinese request was cold and spent 10.2 seconds loading the model. Excluding it, Chinese warm requests averaged 35.1 seconds total and 7.18 generated tokens/second (n=4). English averaged 26.0 seconds total and 7.19 generated tokens/second (n=5). Mean output length was 194 Chinese tokens versus 132 English tokens. French and Japanese decode rates were also similar (7.35 and 7.33 tokens/second), while average output length and warm total time were 191 tokens/33.6 seconds for French and 124 tokens/25.6 seconds for Japanese. The measured decode rates are nearly equal across languages; the longer Chinese and French output sequences explain more of their higher end-to-end times than a slower per-token generation rate. Chinese output includes required pinyin, which adds tokens, and some notes/outputs were verbose. The first cold model load also adds latency to the first request.

This is an exploratory run, not a final performance comparison: only five cases per language, fixed language order, no fixed seed, no paired cold/warm repeats, and examples are short. Repeated runs produced a different valid phrase for zh-02, confirming that generation can vary at temperature 0.1. For the user's article experience, long input length, requested phrase count, and output length still need a controlled same-article comparison. Do not infer a speed improvement from a fine-tune.

## Decision: RAG and SFT + LoRA

- **RAG: no-go for this failure.** The task already supplies the source passage. It needs no external factual knowledge, and retrieval would add prompt context without addressing incorrect pinyin or invented templates.
- **LoRA SFT: conditional pilot, not a general Chinese tune yet.** The pinyin format failure recurred in all five cases despite an explicit prompt instruction, so adapting task behavior is a reasonable experiment. First test a deterministic pinyin validation/correction path and exact-substring rejection, since those checks directly target the measured defects. If Chinese field quality still needs learned behavior, prepare at least 30 separate, reviewed, short user-authored/licensed SFT examples; keep this v1 evaluation set out of training; expand the Chinese held-out set to at least 20 cases; and compare base Qwen vs a small LoRA SFT adapter on the same holdout. Include English and Japanese regression checks for multilingual forgetting.
- **Latency: no-go as a tuning objective based on this evidence.** Warm generation rates were effectively the same, while output token counts differed. Any adapter must be timed separately; it should not be expected to improve throughput.

The current decision is therefore **do not add RAG; prepare a tightly scoped LoRA-SFT pilot only if a deterministic pinyin/source-grounding fix is insufficient**. The five-case Chinese holdout suggests what to test, but is too small to claim broad Chinese quality improvement.

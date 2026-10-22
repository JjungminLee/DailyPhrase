# Repository guidance

## Study direction

Daily Phrase is a language-learning service that extracts useful, beginner-appropriate expressions from articles in English, Chinese, French, and Japanese. The active study direction is improving the quality of open-weight language models for this task. Treat AWS provisioning and deployment as out of scope unless the user explicitly brings them back into the study.

[`Study.md`](Study.md) is the source of truth for the eight-week study plan, weekly goals, metrics, and completion criteria. Read it before planning study work or drafting a weekly issue. Keep weekly issues aligned with both that plan and `.github/ISSUE_TEMPLATE/study.yml`.

## Model experiments

- Use the current Ollama/Qwen setup as the reproducible baseline and record the exact model artifact or digest, prompt revision, runtime settings, and machine details.
- Compare changes on the same reviewed, held-out examples. Keep training examples separate from evaluation examples.
- Measure output quality separately from inference speed and memory. Report source grounding, target-language correctness, beginner usefulness, pronunciation fields, Korean meaning/note quality, latency, and memory where available.
- Prefer parameter-efficient adapters such as LoRA for a tuning study. Do not assume that fine-tuning improves latency; measure it independently.
- Check the exact model artifact's license and compatibility before tuning, converting, or redistributing it.
- Do not train on full article text unless its license permits that use. Prefer short, licensed or user-provided examples with reviewed labels.
- If local hardware cannot run the proposed experiment, document the limit and propose the smallest reproducible experiment. Do not provision paid cloud infrastructure without an explicit request.

## Repository changes

- Preserve user data under `data/` and generated results under `results/`. Avoid polling commands that replace the article inbox when a read-only feed scan is sufficient.
- Feed collection entry points must enable Node's system CA store (`--use-system-ca`) so HTTPS feeds can be validated with the machine's trusted roots. Never disable certificate validation.
- Keep the GitHub study issue aligned with `.github/ISSUE_TEMPLATE/study.yml` headings and define measurable completion criteria.
- Do not claim an experiment improved quality unless its fixed evaluation set supports that conclusion. Record failed or inconclusive runs too.

# Issue #5 phrase quality review

Complete this report after running and manually reviewing the 20-case dataset.

## Dataset

- Case count / language split: pending (target: 20 / 5 each for en, zh, fr, ja)
- Annotation review: pending
- Dataset validation (`npm run quality`): pending

## Comparison run

- Run record (`results/phrase-quality-*.json`): pending
- Local endpoint and model/provider version: pending
- Deployed endpoint and model/provider version: pending
- Prompt revision: pending
- API request IDs: pending (see run record)
- API comparison completed for both endpoints: pending

### Latest local verification (2026-10-22)

- `npm run harness:language`: passed, including language/source checks, Japanese title checks, and pasted Japanese news extraction.
- `npm run quality`: failed. One case is present; 20 are required, with five for each of `en`, `zh`, `fr`, and `ja`.
- `npm run harness:phrases`, first attempt: HTTP 502, `Ollama returned invalid structured phrase data`; request ID `0b80a065-481d-467e-89f7-e2a13e808f6e`.
- `npm run harness:phrases`, retry with four requested phrases: HTTP 200, but zero validated phrases. The model returned four candidates; three were rejected by phrase validation and one did not match the source. Request ID `607464f2-eefc-4a40-a3d9-25871693d04a`.
- Local run records (ignored by Git): `results/phrase-quality-2026-10-22T00-35-22-987Z.json` and `results/phrase-quality-2026-10-22T00-37-03-879Z.json`.
- The model/provider and prompt revision were not recorded in these runs.

## Human quality review

Review final returned phrases, not only validator counters. For each returned phrase, note source match, naturalness, context fit, reusability, and learner-level suitability. Use the phrase's sense and register when checking YouGlish or a corpus.

- Native usage source and reviewed sample count: pending
- Natural / context-fit / reusable / level-appropriate: pending
- Unsupported returned phrases / returned phrase count: pending
- Expected vs actual outcomes, including blocked cases: pending
- Rejected phrases and reasons: pending

## Findings

- Representative failures: pending
- Fixes and rerun comparison: pending
- Commands and results: pending
- Conclusion against Issue #5 acceptance criteria: pending

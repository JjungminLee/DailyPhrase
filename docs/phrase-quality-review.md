# Phrase quality review (Issue #5)

## What the model can and cannot establish

The extraction prompt asks for commonly used, reusable expressions, but that instruction is a selection preference, not evidence that an expression is common. The source-match validator proves only that a returned expression appears in the article. It does not prove naturalness, frequency, context fit, or learning value. A human review and a fixed dataset are needed to measure those qualities and compare prompt or model changes.

YouGlish supports English, Chinese, French, and Japanese searches and is useful for checking spoken examples in context. It is not limited to English. For stronger evidence about frequency, use a language corpus as well; corpora differ in whether they represent speech, news, or other writing, so record which source you used.

| Language | Example usage/frequency source | What it is useful for |
| --- | --- | --- |
| English | [YouGlish](https://youglish.com/) | Spoken video examples and context. Treat the clip count as a rough signal. |
| French | [YouGlish French](https://youglish.com/french) | Search French video clips to inspect spoken expressions in context. Treat the clip count as a rough signal. |
| Chinese | [Peking University CCL Corpus](https://corpus.pku.edu.cn/) or [BLCU BCC Corpus](https://bcc.blcu.edu.cn/) | Search modern Chinese corpus examples and frequency. Check the selected subcorpus and written/spoken register. |
| Japanese | [NINJAL Shōnagon / BCCWJ](https://shonagon.ninjal.ac.jp/) | Search contemporary written Japanese examples. The more advanced [Chūnagon](https://chunagon.ninjal.ac.jp/) supports corpus queries and requires an account/application. |

Use the same sense and comparable registers when checking a phrase. A corpus count supports frequency only within that corpus; it does not by itself establish that a phrase is natural in the article context or useful to a learner.

## Review procedure

For each phrase returned by the local or deployed API:

1. Check that the phrase is copied from the source and that the quoted context supports the Korean meaning.
2. Search the phrase on [YouGlish](https://youglish.com/) in the target language. For English, optionally narrow the accent (US, UK, etc.) when it matters.
3. Inspect up to five distinct clips, stopping early if fewer are available. Record the number inspected and the number that use the phrase naturally with the same sense. Ignore duplicates and unrelated homonyms.
4. Mark whether the expression is natural, fits the article context, is reusable outside that article, and is appropriate for the learner level. Record a short reason for every rejection.
5. Compare the returned set with the expected set. Count missing useful phrases, unsuitable phrases, and phrases absent from the source separately.

For a blocked or empty-result case, record why an empty result is expected and confirm the API did not return an unsupported phrase. Do not count `dropped_not_in_source` as a substitute for checking the final returned phrases.

## Dataset and run record

Keep the canonical 20 cases in `data/inputs.json`, with five cases per language and a mix of expected success and expected blocked/empty outcomes. Each case includes a stable `id`, language, verified `feed_id`, `size_class`, article URL or reproducible pasted source, expected outcome, expected useful phrases (or block reason), source citation, and `reviewed: true` after a human checks the annotation. Do not add guessed expected results. `npm run quality` checks the count, language split, references, and required review fields.

For each run, preserve the model/provider and version, prompt revision, timestamp, input case IDs, local or deployed endpoint, API `request_id`, returned phrases, quality counters, and reviewer decisions. Compare runs against the same fixed cases so changes can be attributed to the prompt/model change.

Current repository status: `data/inputs.json` contains one reviewed French positive case. Add 19 more reviewed cases (four more per language plus the remaining French cases) before the quality dataset is complete.

## Commands and PR notes

Run the deterministic language/source regression harness with:

```sh
npm run harness:language
```

Run the live API phrase-quality cases with the local API running (`npm run dev:api`):

```sh
npm run harness:phrases
```

The runner reads the same `data/inputs.json` cases as the dataset validator. It always targets local (`LOCAL_PHRASE_API_URL`, default `http://127.0.0.1:3000/api`; legacy `PHRASE_API_URL` is also accepted). Set `DEPLOYED_PHRASE_API_URL` to run the exact same cases against the deployed API in the same run. It records endpoint, case, request ID, returned phrases, counters, latency, and pass/fail under `results/phrase-quality-<timestamp>.json`. Set `MODEL_PROVIDER`, `MODEL_VERSION`, and `PROMPT_REVISION` to annotate a run. A missing deployed endpoint skips only that comparison; it does not claim deployment coverage.

The French article `fr-le-chat-forestier-positive` is a known positive case. Phrases such as `ne la confondez pas avec`, `il pourrait bien s'agir`, and `fait son retour dans la région` occur in its French text and can be reused in other contexts. This case is intended to catch an empty response on an article with teachable expressions.

Validate the 20-case dataset with:

```sh
npm run quality
```

`npm run quality` validates annotations only; it does not call the API. Review each generated run's `review.status` and `review.decisions` by hand, count unsupported phrases from final returned cards, and save the completed summary in `docs/phrase-quality-review-issue-5.md`. Local generated JSON under `results/` is ignored by Git, so copy or summarize the reviewed evidence into this tracked report.

### PR report template

```text
Cases / language split:
Prompt or model revision:
API endpoint and model version:
Runs completed (local / deployed):
Native-usage review method and source counts:
Returned phrase sample review (natural, context-fit, reusable, level-appropriate):
Unsupported phrase count / returned phrase count:
Expected vs. actual outcomes, including blocked cases:
Representative failures and fixes:
API request IDs:
Commands and results:
Changed files and behavior:
```

import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { rootDir } from '../src/config.mjs';
import { evaluateReward, makeInjectedErrors } from '../src/evaluation/reward.mjs';

const datasetPath = path.join(rootDir, 'data/evaluation-set-v2.json');
const datasetRaw = await readFile(datasetPath, 'utf8');
const dataset = JSON.parse(datasetRaw);
const config = JSON.parse(await readFile(path.join(rootDir, 'config/languages.json'), 'utf8'));
const datasetSha256 = createHash('sha256').update(datasetRaw).digest('hex');
const resultsDir = path.join(rootDir, 'results');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

async function findBaseline() {
  if (process.env.EVAL_BASELINE) {
    const file = path.resolve(rootDir, process.env.EVAL_BASELINE);
    return { file: path.relative(rootDir, file), report: JSON.parse(await readFile(file, 'utf8')) };
  }
  const files = (await readdir(resultsDir)).filter((file) => /^model-evaluation-.*\.json$/u.test(file)).sort();
  for (const file of files.reverse()) {
    const report = JSON.parse(await readFile(path.join(resultsDir, file), 'utf8'));
    if (report.dataset?.sha256 === datasetSha256 && report.results?.length === dataset.cases.length)
      return { file: path.join('results', file), report };
  }
  throw new Error(
    'No matching 40-case evaluation result found. Run `npm run evaluate:model` first or set EVAL_BASELINE to a matching results JSON.',
  );
}

const { file: baselineFile, report: baseline } = await findBaseline();
if (baseline.dataset?.sha256 !== datasetSha256)
  throw new Error('Baseline dataset SHA-256 does not match data/evaluation-set-v2.json.');
if (baseline.results?.length !== dataset.cases.length)
  throw new Error(`Expected ${dataset.cases.length} result rows; found ${baseline.results?.length ?? 0}.`);
const caseById = new Map(dataset.cases.map((item) => [item.id, item]));
const baselineById = new Map(baseline.results.map((item) => [item.id, item]));
if (caseById.size !== baselineById.size || [...caseById.keys()].some((id) => !baselineById.has(id)))
  throw new Error('Baseline case IDs do not exactly match the held-out evaluation set.');

const repetitionCount = 10;
const scored = [];
const injected = [];
for (const item of dataset.cases) {
  const row = baselineById.get(item.id);
  const phrase = row.status === 'success' ? row.output : null;
  const limits = config.languages[item.language];
  const reward = evaluateReward({ sourceText: item.source_text, language: item.language, limits, phrase });
  const repeated = Array.from({ length: repetitionCount }, () =>
    evaluateReward({ sourceText: item.source_text, language: item.language, limits, phrase }),
  );
  const stable = repeated.every((result) => JSON.stringify(result) === JSON.stringify(reward));
  scored.push({
    case_id: item.id,
    language: item.language,
    generation_status: row.status,
    output: phrase,
    checks: reward.checks,
    reward: reward.reward,
    eligible: reward.eligible,
    deterministic_rechecks: repetitionCount,
    deterministic_rechecks_stable: stable,
    language_identity_scope: reward.language_identity_scope,
    pronunciation_scope: reward.pronunciation_scope,
  });

  for (const errorCase of makeInjectedErrors({ sourceText: item.source_text, language: item.language, limits, phrase })) {
    const result = evaluateReward(errorCase);
    injected.push({
      case_id: item.id,
      language: item.language,
      injection: errorCase.injection,
      expected_failed_check: errorCase.expected_failed_check,
      checks: result.checks,
      detected: !result.checks[errorCase.expected_failed_check],
      reward: result.reward,
    });
  }
}

const languages = [...new Set(dataset.cases.map(({ language }) => language))];
const perLanguage = Object.fromEntries(languages.map((language) => {
  const rows = scored.filter((row) => row.language === language);
  const errorRows = injected.filter((row) => row.language === language);
  const checkNames = Object.keys(rows[0]?.checks || {});
  return [language, {
    cases: rows.length,
    successful_generations: rows.filter((row) => row.generation_status === 'success').length,
    eligible_outputs: rows.filter((row) => row.eligible).length,
    mean_code_reward: rows.length ? rows.reduce((sum, row) => sum + row.reward, 0) / rows.length : null,
    checks: Object.fromEntries(checkNames.map((name) => [name, {
      passed: rows.filter((row) => row.checks[name]).length,
      failed: rows.filter((row) => !row.checks[name]).length,
    }])),
    injected_errors: {
      total: errorRows.length,
      detected: errorRows.filter((row) => row.detected).length,
      by_type: Object.fromEntries([...new Set(errorRows.map((row) => row.injection))].map((type) => {
        const items = errorRows.filter((row) => row.injection === type);
        return [type, { detected: items.filter((row) => row.detected).length, total: items.length }];
      })),
  }}];
}));

const gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf8' }).trim();

const output = {
  kind: 'verifiable-reward-harness',
  run_id: randomUUID(),
  timestamp: new Date().toISOString(),
  git_sha: gitSha,
  dataset: {
    id: dataset.dataset_id,
    file: 'data/evaluation-set-v2.json',
    sha256: datasetSha256,
    cases: dataset.cases.length,
    split: dataset.training_split,
    used_as_training_or_retrieval_data: false,
  },
  baseline: {
    file: baselineFile,
    model: baseline.model,
    ollama_version: baseline.model?.ollama_version,
    generation: baseline.generation,
    prompt_sha256_by_language: baseline.prompt_sha256_by_language,
    machine: baseline.machine,
  },
  reward_revision_sha256: sha256(await readFile(path.join(rootDir, 'src/evaluation/reward.mjs'))),
  reward: {
    composite: '1 only when schema, source grounding, configured length, target script, pronunciation format, and Korean fields all pass; otherwise 0.',
    components: ['schema_valid', 'source_grounded', 'phrase_length_valid', 'target_script_compatible', 'pronunciation_format_valid', 'korean_fields_present'],
    interpretation: 'Code-check eligibility signal only; it does not judge naturalness, contextual fit, beginner usefulness, semantic correctness, or pronunciation accuracy.',
  },
  repeatability: {
    repetitions_per_fixed_output: repetitionCount,
    stable_cases: scored.filter((row) => row.deterministic_rechecks_stable).length,
    total_cases: scored.length,
    interpretation: 'This checks deterministic evaluator consistency, not stochastic generation stability.',
  },
  injected_errors: {
    kinds: ['unsupported_source_phrase', 'wrong_script', 'too_short_phrase', 'malformed_schema'],
    total: injected.length,
    detected: injected.filter((row) => row.detected).length,
    by_type: Object.fromEntries([...new Set(injected.map((row) => row.injection))].map((type) => {
      const rows = injected.filter((row) => row.injection === type);
      return [type, { detected: rows.filter((row) => row.detected).length, total: rows.length }];
    })),
  },
  per_language: perLanguage,
  rag: {
    status: 'not_run',
    reason: 'The held-out evaluation sentences are explicitly excluded from retrieval indexing. No separately licensed or user-provided expression corpus is present in the repository; article-derived examples do not have recorded reuse rights.',
  },
  limitations: [
    'English and French share Latin script; this code check cannot distinguish their language identity.',
    'Han script compatibility cannot prove Chinese or Japanese semantic identity.',
    'Pinyin presence/format does not verify syllable readings or tones; kana-only format does not verify Japanese reading accuracy.',
    'Korean field presence does not verify translation quality.',
    'Synthetic error injections cover only the coded failure conditions and do not establish natural-language quality.',
    'A score of 1 is eligibility for a later controlled learning experiment, not proof that an output is correct or useful.',
  ],
  cases: scored,
  injected_cases: injected,
};

await mkdir(resultsDir, { recursive: true });
const filename = `reward-harness-${new Date().toISOString().replaceAll(':', '-')}.json`;
await writeFile(path.join(resultsDir, filename), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  output: path.join('results', filename),
  baseline: output.baseline.file,
  dataset_cases: dataset.cases.length,
  eligible: scored.filter((row) => row.eligible).length,
  injected_detected: output.injected_errors.detected,
  injected_total: output.injected_errors.total,
  repeatable: output.repeatability.stable_cases === output.repeatability.total_cases,
  rag: output.rag.status,
}, null, 2));

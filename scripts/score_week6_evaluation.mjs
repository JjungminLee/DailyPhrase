import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { rootDir } from '../src/config.mjs';
import { evaluateReward } from '../src/evaluation/reward.mjs';

const raw = JSON.parse(await readStdin());
const config = JSON.parse(await readFile(path.join(rootDir, 'config/languages.json'), 'utf8'));
const cases = raw.results.map((row) => {
  let phrase = null;
  try {
    const start = row.raw_output.indexOf('{');
    const end = row.raw_output.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(row.raw_output.slice(start, end + 1));
      phrase = parsed.phrases?.[0] || null;
    }
  } catch {
    phrase = null;
  }
  const reward = evaluateReward({
    sourceText: row.source_text,
    language: row.language,
    limits: config.languages[row.language],
    phrase,
  });
  return {
    id: row.id,
    language: row.language,
    source_text: row.source_text,
    reference: row.reference,
    status: row.status,
    elapsed_ms: row.elapsed_ms,
    input_tokens: row.input_tokens,
    output_tokens: row.output_tokens,
    raw_output: row.raw_output,
    output: phrase,
    checks: reward.checks,
    reward: reward.reward,
    eligible: reward.eligible,
    exact_reference_match: phrase?.text === row.reference?.text,
  };
});
const languages = ['zh', 'en', 'fr', 'ja'];
const perLanguage = Object.fromEntries(languages.map((language) => {
  const rows = cases.filter((row) => row.language === language);
  const succeeded = rows.filter((row) => row.status === 'success');
  const checkNames = Object.keys(rows[0]?.checks || {});
  return [language, {
    cases: rows.length,
    requests_succeeded: succeeded.length,
    source_grounded: rows.filter((row) => row.checks.source_grounded).length,
    eligible_outputs: rows.filter((row) => row.eligible).length,
    mean_code_reward: rows.length ? rows.reduce((sum, row) => sum + row.reward, 0) / rows.length : null,
    exact_reference_matches: rows.filter((row) => row.exact_reference_match).length,
    mean_latency_ms: mean(rows.map((row) => row.elapsed_ms)),
    checks: Object.fromEntries(checkNames.map((name) => [name, {
      passed: rows.filter((row) => row.checks[name]).length,
      failed: rows.filter((row) => !row.checks[name]).length,
    }])),
  }];
}));
const timestamp = new Date().toISOString();
const report = {
  kind: 'week6-sft-evaluation',
  run_id: randomUUID(),
  timestamp,
  git_sha: raw.git_sha || null,
  model: raw.model,
  dataset: raw.dataset,
  prompt_sha256_by_language: raw.prompt_sha256_by_language,
  generation: raw.generation,
  machine: raw.machine,
  runtime: { torch: raw.torch_version, transformers: raw.transformers_version },
  summary: {
    cases: cases.length,
    requests_succeeded: cases.filter((row) => row.status === 'success').length,
    eligible_outputs: cases.filter((row) => row.eligible).length,
    mean_code_reward: mean(cases.map((row) => row.reward)),
    mean_latency_ms: mean(cases.map((row) => row.elapsed_ms)),
    p50_latency_ms: percentile(cases.map((row) => row.elapsed_ms), 0.5),
    p95_latency_ms: percentile(cases.map((row) => row.elapsed_ms), 0.95),
    total_output_tokens: cases.reduce((sum, row) => sum + row.output_tokens, 0),
  },
  per_language: perLanguage,
  limitations: [
    'The 32-example training set is assistant-authored synthetic data and was not reviewed by native speakers.',
    'The 40-case evaluation set is held out from training; small sample results do not establish general improvement.',
    'Code reward checks eligibility conditions only and does not establish naturalness, meaning accuracy, or beginner usefulness.',
    'The Qwen3-0.6B pilot is not a controlled comparison with the Qwen3.5-9B Ollama baseline.',
  ],
  cases,
};

const resultsDir = path.join(rootDir, 'results');
await mkdir(resultsDir, { recursive: true });
const filename = `week6-evaluation-${raw.model.variant}-${timestamp.replaceAll(':', '-')}.json`;
await writeFile(path.join(resultsDir, filename), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  output: path.join('results', filename),
  model: report.model,
  summary: report.summary,
  per_language: Object.fromEntries(languages.map((language) => [language, {
    eligible: perLanguage[language].eligible_outputs,
    total: perLanguage[language].cases,
  }])),
}, null, 2));

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
}

async function readStdin() {
  let value = '';
  for await (const chunk of process.stdin) value += chunk;
  return value;
}

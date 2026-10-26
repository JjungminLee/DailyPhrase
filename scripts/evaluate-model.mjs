import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { extractPhrases, buildExtractionInstructions } from '../src/extract/model.mjs';
import { readJson, rootDir } from '../src/config.mjs';

const datasetPath = path.join(rootDir, 'data/evaluation-set-v1.json');
const datasetRaw = await readFile(datasetPath, 'utf8');
const dataset = JSON.parse(datasetRaw);
const config = await readJson('config/languages.json');
const model = process.env.OLLAMA_MODEL || 'qwen3.5:9b';
const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
const timeoutMs = Number(process.env.MODEL_TIMEOUT_MS || 240000);
const maxTokens = Number(process.env.EVAL_MAX_OUTPUT_TOKENS || 500);
const seed = Number(process.env.EVAL_SEED || 42);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const normalizeText = (value, language) => {
  const normalized = String(value || '').normalize('NFKC').toLocaleLowerCase();
  return ['zh', 'ja'].includes(language) ? normalized.replace(/\s+/g, '') : normalized;
};
const revisionHashes = Object.fromEntries(
  [...new Set(dataset.cases.map(({ language }) => language))].map((language) => [
    language,
    sha256(
      buildExtractionInstructions({
        language,
        limits: config.languages[language],
        maxPhrases: 1,
        sourceType: 'article',
      }),
    ),
  ]),
);

let ollamaVersion = null;
let availableModels = [];
try {
  const [versionResponse, tagsResponse] = await Promise.all([
    fetch(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(3000) }),
    fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) }),
  ]);
  if (versionResponse.ok) ollamaVersion = (await versionResponse.json()).version || null;
  if (tagsResponse.ok) availableModels = (await tagsResponse.json()).models || [];
} catch {
  // Keep a report even when Ollama is unavailable; each case records its request failure.
}

const modelInfo = availableModels.find((item) => item.name === model || item.model === model);
let gitSha = null;
try {
  gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf8' }).trim();
} catch {
  gitSha = 'unavailable';
}

const results = [];
for (const [caseIndex, item] of dataset.cases.entries()) {
  const started = Date.now();
  try {
    const generated = await extractPhrases({
      article: { description: item.source_text, source_type: 'article' },
      language: item.language,
      limits: config.languages[item.language],
      maxPhrases: 1,
      maxTokens,
      seed,
      timeoutMs,
      model,
    });
    const phrase = generated.phrases[0] || null;
    const expected = item.expected_phrases[0];
    results.push({
      id: item.id,
      language: item.language,
      source_text: item.source_text,
      status: 'success',
      elapsed_ms: Date.now() - started,
      model_stats: generated.model_stats,
      output: phrase,
      checks: {
        has_phrase: Boolean(phrase),
        exact_reference_match: phrase?.text === expected.text,
        grounded_in_source: phrase
          ? normalizeText(item.source_text, item.language).includes(
              normalizeText(phrase.text, item.language),
            )
          : false,
        pronunciation_present: item.language === 'zh'
          ? Boolean(phrase?.pinyin)
          : item.language === 'ja'
            ? Boolean(phrase?.reading)
            : null,
        chinese_pinyin_has_tone_marks: item.language === 'zh'
          ? /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/u.test(phrase?.pinyin || '')
          : null,
        korean_meaning_present: Boolean(phrase?.meaning_ko),
        korean_note_present: Boolean(phrase?.note_ko),
        human_review: 'pending',
      },
      reference: expected,
    });
  } catch (error) {
    results.push({
      id: item.id,
      language: item.language,
      source_text: item.source_text,
      status: 'error',
      elapsed_ms: Date.now() - started,
      error: error.message,
      checks: { human_review: 'pending' },
      reference: item.expected_phrases[0],
    });
  }
  console.log(`Evaluated ${caseIndex + 1}/${dataset.cases.length}: ${item.id}`);
}

const summary = Object.fromEntries(
  [...new Set(dataset.cases.map(({ language }) => language))].map((language) => {
    const rows = results.filter((item) => item.language === language);
    const successful = rows.filter((item) => item.status === 'success');
    return [language, {
      cases: rows.length,
      requests_succeeded: successful.length,
      exact_reference_matches: successful.filter((item) => item.checks.exact_reference_match).length,
      grounded_outputs: successful.filter((item) => item.checks.grounded_in_source).length,
      pronunciation_present: successful.filter((item) => item.checks.pronunciation_present === true).length,
      chinese_pinyin_with_tone_marks: successful.filter((item) => item.checks.chinese_pinyin_has_tone_marks === true).length,
      human_review_required: true,
    }];
  }),
);

const report = {
  kind: 'model-evaluation-baseline',
  run_id: randomUUID(),
  timestamp: new Date().toISOString(),
  dataset: {
    id: dataset.dataset_id,
    sha256: sha256(datasetRaw),
    split: dataset.training_split,
    cases: dataset.cases.length,
  },
  model: {
    requested: model,
    digest: modelInfo?.digest || null,
    size_bytes: modelInfo?.size || null,
    ollama_version: ollamaVersion,
    available_tags: availableModels.map(({ name, digest, size }) => ({ name, digest, size })),
  },
  prompt_sha256_by_language: revisionHashes,
  generation: { temperature: 0.1, max_tokens: maxTokens, seed, stream: false },
  machine: {
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model || null,
    logical_cpu_count: os.cpus().length,
    total_memory_bytes: os.totalmem(),
  },
  git_sha: gitSha,
  summary,
  manual_review: {
    status: 'pending',
    fields: ['source grounding', 'target-language correctness', 'beginner usefulness', 'pronunciation accuracy', 'Korean meaning and note quality'],
    rubric: 'Score 1-3 per field: 1 incorrect/unusable, 2 partly correct or needs editing, 3 correct and useful. Record counts with scores.',
  },
  results,
};

const outputDir = path.join(rootDir, 'results');
await mkdir(outputDir, { recursive: true });
const outputPath = path.join(outputDir, `model-evaluation-${new Date().toISOString().replaceAll(':', '-')}.json`);
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output: path.relative(rootDir, outputPath), model: report.model, summary }, null, 2));

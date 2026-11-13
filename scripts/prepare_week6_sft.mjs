import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { rootDir } from '../src/config.mjs';
import { buildExtractionInstructions, buildExtractionMessages } from '../src/extract/model.mjs';
import { evaluateReward } from '../src/evaluation/reward.mjs';

const dataPath = path.join(rootDir, 'data/week6-training-draft.json');
const evaluationPath = path.join(rootDir, 'data/evaluation-set-v2.json');
const configPath = path.join(rootDir, 'config/languages.json');
const dataRaw = await readFile(dataPath, 'utf8');
const data = JSON.parse(dataRaw);
const evaluation = JSON.parse(await readFile(evaluationPath, 'utf8'));
const config = JSON.parse(await readFile(configPath, 'utf8'));
const languages = ['en', 'zh', 'fr', 'ja'];

if (data.split !== 'training_only') throw new Error('Training data must be marked training_only.');
if (data.status !== 'approved_for_training')
  throw new Error('Training stopped: review and approve the dataset before training.');
if (data.rights?.reuse_authorized !== true || data.rights?.review_status !== 'approved')
  throw new Error('Training stopped: source reuse rights are not approved.');

const evaluationIds = new Set(evaluation.cases.map(({ id }) => id));
const evaluationSources = new Set(evaluation.cases.map(({ source_text }) => normalize(source_text)));
const evaluationPhrases = new Set(
  evaluation.cases.flatMap(({ expected_phrases }) => expected_phrases.map(({ text }) => normalize(text))),
);
const ids = new Set();
const counts = Object.fromEntries(languages.map((language) => [language, 0]));
const rows = [];

for (const item of data.cases || []) {
  if (!item.id || ids.has(item.id) || evaluationIds.has(item.id))
    throw new Error(`Missing, duplicate, or held-out case ID: ${item.id || '(empty)'}`);
  ids.add(item.id);
  if (!languages.includes(item.language) || !item.source_text?.trim())
    throw new Error(`Invalid language or empty source in ${item.id}.`);
  if (normalize(item.source_text) && evaluationSources.has(normalize(item.source_text)))
    throw new Error(`Held-out source sentence reused in ${item.id}.`);

  const review = item.label_review;
  if (review?.status !== 'approved' || !review.reviewer || !review.reviewed_on)
    throw new Error(`Training stopped: label review is incomplete for ${item.id}.`);

  const phrase = item.expected_phrase;
  if (evaluationPhrases.has(normalize(phrase?.text || '')))
    throw new Error(`Held-out reference phrase reused in ${item.id}.`);
  const reward = evaluateReward({
    sourceText: item.source_text,
    language: item.language,
    limits: config.languages[item.language],
    phrase,
  });
  if (!reward.eligible)
    throw new Error(`Training label fails the code reward checks in ${item.id}: ${JSON.stringify(reward.checks)}`);

  const limits = config.languages[item.language];
  const article = { description: item.source_text, source_type: 'article' };
  rows.push({
    prompt: [
      {
        role: 'system',
        content: buildExtractionInstructions({
          language: item.language,
          limits,
          maxPhrases: 1,
          sourceType: 'article',
        }),
      },
      ...buildExtractionMessages(article, { language: item.language }),
    ],
    completion: [{ role: 'assistant', content: JSON.stringify({ phrases: [phrase] }) }],
  });
  counts[item.language] += 1;
}

if (!rows.length || languages.some((language) => counts[language] < 8))
  throw new Error(`Expected at least 8 approved examples per language; found ${JSON.stringify(counts)}.`);

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
console.log(JSON.stringify({
  dataset_id: data.dataset_id,
  dataset_sha256: sha256(dataRaw),
  evaluation_dataset_sha256: sha256(await readFile(evaluationPath)),
  prompt_sha256_by_language: Object.fromEntries(languages.map((language) => [
    language,
    sha256(buildExtractionInstructions({
      language,
      limits: config.languages[language],
      maxPhrases: 1,
      sourceType: 'article',
    })),
  ])),
  counts,
  evaluation_dataset_used_for_training: false,
  rows,
}, null, 2));

function normalize(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase();
}

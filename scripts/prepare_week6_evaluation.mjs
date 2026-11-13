import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { rootDir } from '../src/config.mjs';
import { buildExtractionInstructions, buildExtractionMessages, phraseSchema } from '../src/extract/model.mjs';

const datasetPath = path.join(rootDir, 'data/evaluation-set-v2.json');
const datasetRaw = await readFile(datasetPath, 'utf8');
const dataset = JSON.parse(datasetRaw);
const config = JSON.parse(await readFile(path.join(rootDir, 'config/languages.json'), 'utf8'));
const cases = dataset.cases.map((item) => {
  const limits = config.languages[item.language];
  return {
    id: item.id,
    language: item.language,
    source_text: item.source_text,
    reference: item.expected_phrases[0],
    schema: phraseSchema(item.language),
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
      ...buildExtractionMessages({ description: item.source_text, source_type: 'article' }, { language: item.language }),
    ],
  };
});
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const promptHashes = Object.fromEntries([...new Set(cases.map(({ language }) => language))].map((language) => {
  const item = cases.find((candidate) => candidate.language === language);
  return [language, sha256(item.prompt[0].content)];
}));

console.log(JSON.stringify({
  dataset: {
    id: dataset.dataset_id,
    sha256: sha256(datasetRaw),
    cases: dataset.cases.length,
    split: dataset.training_split,
    used_as_training_data: false,
  },
  prompt_sha256_by_language: promptHashes,
  cases,
}, null, 2));

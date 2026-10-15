import assert from 'node:assert/strict';
import { validatePhrases } from '../src/postprocess/validate.mjs';
import { readJson } from '../src/config.mjs';

const languageConfig = await readJson('config/languages.json');
function phrase(text, language, context) {
  return {
    text,
    language,
    meaning_ko: 'harness fixture',
    context_sentence: context,
    level: language === 'zh' ? '3' : language === 'ja' ? 'N3' : 'B2',
    type: 'other',
    note_ko: '',
  };
}

const cases = [
  {
    id: 'fr-rejects-english-parallel-translation',
    language: 'fr',
    rejected: phrase(
      "you'd rather practice",
      'fr',
      "Maybe cats aren't your thing, and you'd rather practice your oral comprehension by listening to a vlogger discuss her budget and train-train quotidien.",
    ),
    accepted: phrase(
      'compréhension orale',
      'fr',
      'Peut-être que les chats ne sont pas votre truc, et que vous préféreriez pratiquer votre compréhension orale en écoutant une vlogueuse parler de son budget et de son quotidien.',
    ),
  },
  {
    id: 'en-rejects-french-parallel-translation',
    language: 'en',
    rejected: phrase(
      'compréhension orale',
      'en',
      'Peut-être que les chats ne sont pas votre truc, et que vous préféreriez pratiquer votre compréhension orale.',
    ),
    accepted: phrase('listen more closely', 'en', 'Listen more closely to the speaker.'),
  },
  {
    id: 'zh-rejects-japanese-script',
    language: 'zh',
    rejected: phrase('勉強しています', 'zh', '彼女は日本語を勉強しています。'),
    accepted: phrase('学习法语', 'zh', '她正在学习法语。'),
  },
  {
    id: 'ja-rejects-chinese-script',
    language: 'ja',
    rejected: phrase('学习法语', 'ja', '她正在学习法语。'),
    accepted: phrase('勉強しています', 'ja', '彼女は日本語を勉強しています。'),
  },
];

for (const item of cases) {
  const sourceText = `${item.rejected.context_sentence}\n${item.accepted.context_sentence}`;
  const result = validatePhrases(
    [item.rejected, item.accepted],
    { description: sourceText },
    item.language,
    languageConfig.languages[item.language],
    4,
    languageConfig.languages,
  );
  assert.deepEqual(
    result.phrases.map(({ text }) => text),
    [item.accepted.text],
    `Unexpected language-filter result in ${item.id}.`,
  );
  assert.equal(result.droppedWrongLanguage, 1, `Expected one rejected phrase in ${item.id}.`);
}

console.log(`Phrase language harness passed (${cases.length} language cases).`);

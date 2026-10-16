import assert from 'node:assert/strict';
import { validatePhrases } from '../src/postprocess/validate.mjs';
import { originalLanguageText } from '../src/extract/source-text.mjs';
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
    pinyin: language === 'zh' ? 'xué xí fǎ yǔ' : '',
    reading: language === 'ja' ? 'がっこうへいきます' : '',
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

const chineseSource = originalLanguageText(
  [
    'English introduction and vocabulary notes',
    '月亮 – yuè liang – moon',
    '彼女は日本語を勉強しています。',
    '你问我爱你有多深',
    '我爱你有几分',
    'Show English translation',
    'You ask me how deep my love for you is',
  ].join('\n'),
  'zh',
  languageConfig.languages.zh,
);
assert.match(chineseSource, /你问我爱你有多深/);
assert.doesNotMatch(chineseSource, /彼女は日本語/);
assert.doesNotMatch(chineseSource, /yuè liang|English/);
assert.doesNotMatch(chineseSource, /You ask me/);

const spacedChineseSource = originalLanguageText(
  '爷 爷 的 蜂 蜜\n小 美 ： 爷 爷 ， 你 好 。',
  'zh',
);
assert.equal(spacedChineseSource, '爷爷的蜂蜜\n小美：爷爷，你好。');

const japaneseSource = originalLanguageText(
  [
    'English introduction',
    'こんにちは – and welcome to this Japanese story.',
    'こんにちは。きょうは学校へ行きます。',
    'Konnichiwa. Kyou wa gakkou e ikimasu.',
    '私は学校へ行きます。',
    'Read the English explanation.',
  ].join('\n'),
  'ja',
  languageConfig.languages.ja,
);
assert.match(japaneseSource, /こんにちは。きょうは学校へ行きます。/);
assert.match(japaneseSource, /私は学校へ行きます。/);
assert.doesNotMatch(japaneseSource, /Konnichiwa|English introduction|welcome/);

const spacedJapaneseSource = originalLanguageText(
  '今日 は 学校 に 行 き ます。\n私 は 学生 です。',
  'ja',
);
assert.equal(spacedJapaneseSource, '今日は学校に行きます。\n私は学生です。');

const derivedContext = validatePhrases(
  [{ ...phrase('学校へ行きます', 'ja', ''), context_sentence: undefined }],
  { description: '今日は早く起きました。\n私は学校へ行きます。' },
  'ja',
  languageConfig.languages.ja,
  1,
  languageConfig.languages,
);
assert.equal(derivedContext.phrases[0]?.context_sentence, '私は学校へ行きます。');

const pronunciationFallback = validatePhrases(
  [
    {
      text: 'あめはふっていません',
      meaning_ko: '비가 내리지 않고 있어요.',
      level: 'N5',
      type: 'sentence_pattern',
      pinyin: '',
      reading: 'あめは降っていません',
      note_ko: '비가 아직 오지 않는 상태를 나타내요. 雨が降らない',
    },
  ],
  { description: 'あめはふっていません。' },
  'ja',
  languageConfig.languages.ja,
  1,
  languageConfig.languages,
);
assert.equal(pronunciationFallback.phrases.length, 1);
assert.equal(pronunciationFallback.phrases[0]?.reading, undefined);
assert.equal(pronunciationFallback.phrases[0]?.note_ko, undefined);

const shortJapaneseVerb = validatePhrases(
  [
    {
      text: '飲みます',
      meaning_ko: '마십니다.',
      level: 'N5',
      type: 'other',
      note_ko: '',
      reading: 'のみます',
    },
  ],
  { description: 'コーヒーを飲みます。' },
  'ja',
  languageConfig.languages.ja,
  1,
  languageConfig.languages,
);
assert.equal(shortJapaneseVerb.phrases.length, 0);

const chineseInlineSpacing = validatePhrases(
  [{ ...phrase('把枪放下', 'zh', ''), level: 'HSK4', type: 'sentence_pattern' }],
  { description: '把 枪 放 下！' },
  'zh',
  languageConfig.languages.zh,
  1,
  languageConfig.languages,
);
assert.equal(chineseInlineSpacing.phrases[0]?.text, '把枪放下');
assert.equal(chineseInlineSpacing.phrases[0]?.level, '4');

const japaneseInlineSpacing = validatePhrases(
  [phrase('しごとのあと', 'ja', '')],
  { description: 'しごとの あと、カフェに来ました。' },
  'ja',
  languageConfig.languages.ja,
  1,
  languageConfig.languages,
);
assert.equal(japaneseInlineSpacing.phrases[0]?.text, 'しごとのあと');
console.log('Chinese/Japanese source filtering and context harness passed.');

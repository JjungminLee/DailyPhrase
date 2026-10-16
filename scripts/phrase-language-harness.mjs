import assert from 'node:assert/strict';
import { validatePhrases } from '../src/postprocess/validate.mjs';
import {
  buildExtractionInstructions,
  buildExtractionMessages,
  exactJapaneseCandidates,
} from '../src/extract/model.mjs';
import { translateArticleTitle } from '../src/extract/article-title.mjs';
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

const invalidReading = validatePhrases(
  [{ text: '\u4e88\u7b97\u3092\u5897\u3084\u3059', meaning_ko: '??? ???', level: 'N3', type: 'collocation', reading: '\u4e88\u7b97' }],
  { description: '\u4e88\u7b97\u3092\u5897\u3084\u3059' },
  'ja',
  languageConfig.languages.ja,
  1,
  languageConfig.languages,
);
assert.equal(invalidReading.phrases.length, 0);

const romanizedReading = validatePhrases(
  [{ text: '\u4e88\u7b97\u3092\u5897\u3084\u3059', meaning_ko: '??? ???', level: 'N3', type: 'collocation', reading: 'yosan o fuyasu' }],
  { description: '\u4e88\u7b97\u3092\u5897\u3084\u3059' },
  'ja',
  languageConfig.languages.ja,
  1,
  languageConfig.languages,
);
assert.equal(romanizedReading.phrases[0]?.reading, '\u3088\u3055\u3093\u3092\u3075\u3084\u3059');

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

const pastedJapaneseNews = [
  'フランスの政府は予算を増やすと言いました。しかし、高校生たちは「まだ足りない」と言って、今月13日にも大きいデモをしました。16万人ぐらいが行ったようです。',
  '高校生だけでなく、先生たちなど大人もデモをしました。パリでは、一部の人たちが、商店の窓を割ったり、車を燃やしたりしたそうです。',
  'デモは、ベルギーやギリシャ、アルバニアなどヨーロッパのほかの国にも広がっています。',
].join('\n');
const japaneseRecoveryPrompt = buildExtractionInstructions({
  language: 'ja',
  limits: languageConfig.languages.ja,
  maxPhrases: 3,
  sourceType: 'article',
  forceExamples: true,
});
assert.match(japaneseRecoveryPrompt, /recovery attempt/i);
assert.match(japaneseRecoveryPrompt, /Never return an empty list/);
assert.match(japaneseRecoveryPrompt, /never output 〜, ～, ~, ellipses/i);
const exactJapaneseRecoveryCandidates = exactJapaneseCandidates(pastedJapaneseNews, 12);
assert.ok(exactJapaneseRecoveryCandidates.includes('高校生だけでなく'));
assert.ok(exactJapaneseRecoveryCandidates.some((candidate) => candidate.endsWith('行ったようです')));
const pastedSourceMessages = buildExtractionMessages({
  title: 'フランス 高校生たちがデモ「学校をよくしてほしい」',
  description: pastedJapaneseNews,
}, { language: 'ja', forceExamples: true, maxPhraseChars: 12 });
assert.equal(pastedSourceMessages.length, 1);
assert.match(pastedSourceMessages[0].content, /高校生たちは「まだ足りない」/);
assert.doesNotMatch(pastedSourceMessages[0].content, /Article title|学校をよくしてほしい/);
assert.match(pastedSourceMessages[0].content, /Exact source candidates/);
const pastedJapaneseCandidates = [
  { ...phrase('まだ足りない', 'ja', ''), meaning_ko: '아직 부족하다', level: 'N4', reading: 'まだたりない', type: 'sentence_pattern' },
  { ...phrase('高校生だけでなく', 'ja', ''), meaning_ko: '고등학생뿐만 아니라', level: 'N4', reading: 'こうこうせいだけでなく', type: 'sentence_pattern' },
  { ...phrase('広がっています', 'ja', ''), meaning_ko: '퍼지고 있습니다', level: 'N4', reading: 'ひろがっています', type: 'sentence_pattern' },
];
const pastedJapaneseResult = validatePhrases(
  pastedJapaneseCandidates,
  { description: pastedJapaneseNews },
  'ja',
  languageConfig.languages.ja,
  3,
  languageConfig.languages,
);
assert.deepEqual(
  pastedJapaneseResult.phrases.map(({ text }) => text),
  ['まだ足りない', '高校生だけでなく', '広がっています'],
  'Pasted Japanese news text should yield valid reusable expressions.',
);
assert.ok(pastedJapaneseResult.phrases.every(({ reading }) => reading));
console.log('Pasted Japanese news extraction harness passed.');

const originalFetch = globalThis.fetch;
globalThis.fetch = async (_url, options) => {
  const request = JSON.parse(options.body);
  assert.deepEqual(request.format.required, ['title_translation_ko', 'title_reading']);
  assert.equal(request.options.temperature, 0.1);
  return new Response(
    JSON.stringify({
      message: {
        content: JSON.stringify({
          title_translation_ko: '프랑스 고등학생들의 시위',
          title_reading: 'ふらんすこうこうせいたちがでも',
        }),
      },
      total_duration: 1_000_000,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
};
try {
  const title = await translateArticleTitle({
    title: 'フランス 高校生たちがデモ',
    language: 'ja',
  });
  assert.equal(title.title_translation_ko, '프랑스 고등학생들의 시위');
  assert.equal(title.title_reading, 'ふらんすこうこうせいたちがでも');
} finally {
  globalThis.fetch = originalFetch;
}
console.log('Japanese title schema and sampling harness passed.');

const kanaTitle = '\u30c1\u30e7\u30b3\u30ec\u30fc\u30c8\u306e \u30ab\u30ab\u30aa\u304c \u3059\u304f\u306a\u3044 \u3067\u3059\u3002 \u3069\u3046\u3057\u3066 \u3067\u3057\u3087\u3046\u304b\u3002';
globalThis.fetch = async (_url, options) => {
  const request = JSON.parse(options.body);
  assert.deepEqual(request.format.required, ['title_translation_ko']);
  return new Response(
    JSON.stringify({
      message: {
        content: JSON.stringify({
          title_translation_ko: '\ucd08\ucf5c\ub9bf\uc758 \uce74\uce74\uc624\uac00 \uc801\uc5b4\uc694. \uc65c\uc77c\uae4c\uc694?',
          title_reading: '\u304d\u3087\u3046\u3057\u3087\u304f\u3044\u305f\u306e\u304b\u304c\u3053\u3046\u304c',
        }),
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
};
try {
  const title = await translateArticleTitle({ title: kanaTitle, language: 'ja' });
  assert.equal(title.title_translation_ko, '\ucd08\ucf5c\ub9bf\uc758 \uce74\uce74\uc624\uac00 \uc801\uc5b4\uc694. \uc65c\uc77c\uae4c\uc694?');
  assert.equal(
    title.title_reading,
    '\u3061\u3087\u3053\u308c\u30fc\u3068\u306e \u304b\u304b\u304a\u304c \u3059\u304f\u306a\u3044 \u3067\u3059\u3002 \u3069\u3046\u3057\u3066 \u3067\u3057\u3087\u3046\u304b\u3002',
  );
} finally {
  globalThis.fetch = originalFetch;
}
console.log('Kana-only Japanese title reading harness passed.');

globalThis.fetch = async () =>
  new Response(
    JSON.stringify({
      message: {
        content: JSON.stringify({
          title_translation_ko: '\u5de7\ucf5c\ucf54\uac00 \ubd80\uc871\ud569\ub2c8\ub2e4. \uc65c\uc77c\uae4c\uc694?',
        }),
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
try {
  await assert.rejects(
    translateArticleTitle({ title: kanaTitle, language: 'ja' }),
    /unexpected language/,
    'Mixed Japanese/Hanja output must not be shown as a Korean translation.',
  );
} finally {
  globalThis.fetch = originalFetch;
}
console.log('Invalid Japanese-to-Korean title rejection harness passed.');

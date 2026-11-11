const chinese = /\p{Script=Han}/u;
const japanese = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
const kanaOnly = /^[\p{Script=Hiragana}\p{Script=Katakana}ー・\s。、！？「」『』（）ー]+$/u;
const latin = /\p{Script=Latin}/u;
const hangul = /\p{Script=Hangul}/u;
const toneMark = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜêếềểễệ]/u;

const allowedTypes = {
  en: new Set(['collocation', 'idiom', 'phrasal_verb', 'sentence_pattern', 'other']),
  fr: new Set(['collocation', 'idiom', 'phrasal_verb', 'sentence_pattern', 'other']),
  zh: new Set(['collocation', 'idiom', 'sentence_pattern', 'other']),
  ja: new Set(['collocation', 'idiom', 'sentence_pattern', 'other']),
};

const allowedLevels = {
  en: new Set(['A2', 'B1', 'B2', 'C1']),
  fr: new Set(['A2', 'B1', 'B2', 'C1']),
  zh: new Set(['1', '2', '3', '4', '5', '6']),
  ja: new Set(['N1', 'N2', 'N3', 'N4', 'N5']),
};

const normalize = (value, language) => {
  let normalized = String(value ?? '')
    .normalize('NFKC')
    .replace(/[’‘ʼ]/gu, "'")
    .replace(/[“”]/gu, '"')
    .toLocaleLowerCase()
    .replace(/\s+/gu, ' ')
    .trim();
  if (language === 'zh' || language === 'ja') normalized = normalized.replace(/\s/gu, '');
  return normalized;
};

function schemaValid(phrase, language) {
  if (!phrase || typeof phrase !== 'object' || Array.isArray(phrase)) return false;
  const pronunciationKey = language === 'zh' ? 'pinyin' : language === 'ja' ? 'reading' : null;
  const requiredKeys = ['text', 'meaning_ko', 'note_ko', 'level', 'type'];
  if (pronunciationKey) requiredKeys.push(pronunciationKey);
  if (requiredKeys.some((key) => !(key in phrase))) return false;
  if (Object.keys(phrase).some((key) => ![...requiredKeys, 'pinyin', 'reading'].includes(key))) return false;
  if (requiredKeys.some((key) => typeof phrase[key] !== 'string' || !phrase[key].trim())) return false;
  return allowedTypes[language]?.has(phrase.type) && allowedLevels[language]?.has(phrase.level);
}

function scriptCompatible(text, language) {
  if (!text) return false;
  if (language === 'zh') return chinese.test(text) && !/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
  if (language === 'ja') return japanese.test(text);
  return latin.test(text);
}

function phraseLengthValid(text, language, limits) {
  if (!text || !limits) return false;
  const length = ['zh', 'ja'].includes(language)
    ? [...text].length
    : [...new Intl.Segmenter(language, { granularity: 'word' }).segment(text)]
        .filter((part) => part.isWordLike).length;
  return length >= limits.min && length <= limits.max;
}

function pronunciationFormatValid(phrase, language) {
  if (language === 'zh') return typeof phrase?.pinyin === 'string' && latin.test(phrase.pinyin) && !chinese.test(phrase.pinyin);
  if (language === 'ja') return typeof phrase?.reading === 'string' && kanaOnly.test(phrase.reading) && /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(phrase.reading);
  return true;
}

export function evaluateReward({ sourceText, language, limits, phrase }) {
  const checks = {
    schema_valid: schemaValid(phrase, language),
    source_grounded: Boolean(
      phrase?.text && normalize(sourceText, language).includes(normalize(phrase.text, language)),
    ),
    phrase_length_valid: phraseLengthValid(phrase?.text, language, limits),
    target_script_compatible: scriptCompatible(phrase?.text, language),
    pronunciation_format_valid: pronunciationFormatValid(phrase, language),
    korean_fields_present: Boolean(
      phrase?.meaning_ko && hangul.test(phrase.meaning_ko) && phrase?.note_ko && hangul.test(phrase.note_ko),
    ),
  };
  const eligible = Object.values(checks).every(Boolean);
  return {
    checks,
    reward: eligible ? 1 : 0,
    eligible,
    language_identity_scope: ['en', 'fr'].includes(language)
      ? 'Latin script compatibility only; English/French identity is not verified.'
      : 'Script compatibility only; semantic language identity is not verified.',
    pronunciation_scope: language === 'zh'
      ? `Non-empty Latin pinyin format; tone marks observed: ${toneMark.test(phrase?.pinyin || '')}. Tone accuracy is not verified.`
      : language === 'ja'
        ? 'Kana-only reading format is checked; reading accuracy is not verified.'
        : 'Not applicable.',
  };
}

export function makeInjectedErrors({ sourceText, language, limits, phrase }) {
  const phraseCopy = phrase && typeof phrase === 'object' ? structuredClone(phrase) : {};
  const unsupportedText = { en: 'xyz phrase', fr: 'xyz phrase', zh: '学学学', ja: 'あああ' }[language];
  const wrongScriptText = ['en', 'fr'].includes(language) ? '学习中文' : 'bonjour';
  const tooShortText = [...String(sourceText || '')].find((character) => /\p{L}/u.test(character)) || '';
  const malformed = structuredClone(phraseCopy);
  delete malformed.meaning_ko;
  return [
    {
      injection: 'unsupported_source_phrase',
      sourceText,
      language,
      phrase: { ...phraseCopy, text: unsupportedText },
      expected_failed_check: 'source_grounded',
    },
    {
      injection: 'wrong_script',
      sourceText,
      language,
      phrase: { ...phraseCopy, text: wrongScriptText },
      expected_failed_check: 'target_script_compatible',
    },
    {
      injection: 'too_short_phrase',
      sourceText,
      language,
      limits,
      phrase: { ...phraseCopy, text: tooShortText },
      expected_failed_check: 'phrase_length_valid',
    },
    {
      injection: 'malformed_schema',
      sourceText,
      language,
      phrase: malformed,
      expected_failed_check: 'schema_valid',
    },
  ];
}

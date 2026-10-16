import { AppError } from '../errors.mjs';

const clean = (s) =>
  String(s ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
const count = (text, unit) =>
  unit === 'words'
    ? (text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).length
    : (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{L}\p{N}]/gu) || [])
        .length;
const normalize = (s) => clean(s).toLocaleLowerCase();
const normalizeSourceMatch = (s, language) => {
  const normalized = normalize(s);
  return language === 'zh' || language === 'ja' ? normalized.replace(/\s+/g, '') : normalized;
};

// Extend language detection by adding script_signatures and language_markers to
// each language in config/languages.json.
function scriptCount(text, script) {
  try {
    return (text.match(new RegExp(`\\p{Script=${script}}`, 'gu')) || []).length;
  } catch {
    return 0;
  }
}

function isWrongLanguage(text, targetLanguage, languageConfig) {
  const languages = Object.entries(languageConfig || {});
  if (!languages.length) return false;
  const words = text
    .normalize('NFKC')
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || [];
  const scores = new Map();
  for (const [code, language] of languages) {
    let score = 0;
    for (const script of language.script_signatures || []) {
      if (scriptCount(text, script) > 0) score += 10;
    }
    const normalizedText = text.normalize('NFKC').toLocaleLowerCase();
    for (const marker of language.text_markers || []) {
      if (normalizedText.includes(marker.toLocaleLowerCase())) score += 1;
    }
    const markers = new Set(language.language_markers || []);
    for (const word of words) {
      if (markers.has(word)) score += 1;
    }
    scores.set(code, score);
  }
  const targetScore = scores.get(targetLanguage) || 0;
  const strongestOtherScore = Math.max(
    0,
    ...[...scores.entries()]
      .filter(([code]) => code !== targetLanguage)
      .map(([, score]) => score),
  );
  return strongestOtherScore >= targetScore + 3;
}

function sourceSentence(sourceText, phrase, language) {
  const sentences = sourceText
    .split(/\r?\n+/)
    .flatMap((line) => line.match(/[^.!?。！？]+[.!?。！？]?(?:["'”’)]*)/gu) || [line]);
  return (
    sentences.find((sentence) => normalizeSourceMatch(sentence, language).includes(normalizeSourceMatch(phrase, language))) || sourceText
  ).trim();
}

export function validatePhrases(
  raw,
  article,
  language,
  limits,
  requestedMax = 10,
  languageConfig,
) {
  if (!Array.isArray(raw))
    throw new AppError('extract_failed', 'Model output must contain a phrases array');
  const sourceText = String(article.description || '').normalize('NFKC').trim();
  const source = normalizeSourceMatch(sourceText, language);
  const seen = new Set();
  const phrases = [];
  let droppedNotInSource = 0;
  let droppedWrongLanguage = 0;
  for (const item of raw) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.text !== 'string' ||
      typeof item.meaning_ko !== 'string'
    )
      throw new AppError('extract_failed', 'Model returned a phrase with invalid fields');
    const text = clean(item.text);
    const context = typeof item.context_sentence === 'string' ? clean(item.context_sentence) : '';
    const key = normalizeSourceMatch(text, language);
    if (item.language !== undefined && item.language !== language) continue;
    if (!key || !source.includes(key)) {
      droppedNotInSource += 1;
      continue;
    }
    const originalSentence = sourceSentence(sourceText, text, language);
    if (isWrongLanguage(originalSentence, language, languageConfig)) {
      droppedWrongLanguage += 1;
      continue;
    }
    if (
      count(text, limits.phrase_unit) < limits.min ||
      count(text, limits.phrase_unit) > limits.max ||
      seen.has(key)
    )
      continue;
    const allowedTypes =
      language === 'zh' || language === 'ja'
        ? ['collocation', 'idiom', 'sentence_pattern', 'other']
        : ['collocation', 'idiom', 'phrasal_verb', 'sentence_pattern', 'other'];
    if (!allowedTypes.includes(item.type))
      continue;
    if (
      language === 'ja' &&
      count(text, 'chars') < 6 &&
      !/(?:は|が|を|に|へ|と|で|から|まで|より|の|も)/u.test(text)
    )
      continue;
    const rawLevel = clean(item.level);
    const hskLevel = rawLevel.match(/^(?:HSK\s*)?([1-6])$/i)?.[1];
    const level = limits.level_scale === 'HSK' ? hskLevel || rawLevel : rawLevel;
    const validLevel =
      limits.level_scale === 'CEFR'
        ? /^(A2|B1|B2|C1)$/.test(level)
        : limits.level_scale === 'HSK'
          ? /^[1-6]$/.test(level)
          : /^N[1-5]$/.test(level);
    if (!validLevel || !clean(item.meaning_ko)) continue;
    const pinyin = language === 'zh' ? clean(item.pinyin) : '';
    const validPinyin =
      language === 'zh' && /\p{Script=Latin}/u.test(pinyin) && !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(pinyin);
    const reading = language === 'ja' ? clean(item.reading) : '';
    const kanaOnlyReading = /^[\p{Script=Hiragana}\p{Script=Katakana}ー\s・。、！？「」]+$/u.test(reading);
    const validReading =
      language === 'ja' &&
      kanaOnlyReading &&
      /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(reading);
    if (language === 'zh' && !validPinyin)
      throw new AppError('extract_failed', `Model omitted valid pinyin for Chinese expression: ${text}`);
    if (language === 'ja' && !validReading)
      throw new AppError('extract_failed', `Model omitted the kana reading for Japanese expression: ${text}`);
    const safeNote = clean(item.note_ko);
    const sourceContext =
      normalizeSourceMatch(context, language).includes(key) &&
      source.includes(normalizeSourceMatch(context, language))
        ? context
        : originalSentence;
    seen.add(key);
    phrases.push({
      text,
      language,
      meaning_ko: clean(item.meaning_ko),
      context_sentence: sourceContext.slice(0, 200),
      level,
      type: item.type,
      ...(validPinyin ? { pinyin } : {}),
      ...(validReading ? { reading } : {}),
      ...(safeNote && !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(safeNote)
        ? { note_ko: safeNote.slice(0, 200) }
        : {}),
    });
    if (phrases.length >= requestedMax) break;
  }
  return { phrases, droppedNotInSource, droppedWrongLanguage };
}

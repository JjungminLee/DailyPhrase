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

function sourceSentence(sourceText, phrase) {
  const sentences = sourceText.match(/[^.!?]+[.!?]?(?:["'”’)]*)/gu) || [sourceText];
  return (
    sentences.find((sentence) => normalize(sentence).includes(normalize(phrase))) || sourceText
  ).trim();
}

export function validatePhrases(raw, article, language, limits, requestedMax = 10) {
  if (!Array.isArray(raw))
    throw new AppError('extract_failed', 'Model output must contain a phrases array');
  const sourceText = clean(article.description || '');
  const source = normalize(sourceText);
  const seen = new Set();
  const phrases = [];
  let droppedNotInSource = 0;
  for (const item of raw) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.text !== 'string' ||
      typeof item.meaning_ko !== 'string' ||
      typeof item.context_sentence !== 'string'
    )
      throw new AppError('extract_failed', 'Model returned a phrase with invalid fields');
    const text = clean(item.text);
    const context = clean(item.context_sentence);
    const key = normalize(text);
    if (item.language !== undefined && item.language !== language) continue;
    if (!key || !source.includes(key)) {
      droppedNotInSource += 1;
      continue;
    }
    if (
      count(text, limits.phrase_unit) < limits.min ||
      count(text, limits.phrase_unit) > limits.max ||
      seen.has(key)
    )
      continue;
    if (!['collocation', 'idiom', 'phrasal_verb', 'sentence_pattern', 'other'].includes(item.type))
      continue;
    const level = clean(item.level);
    const validLevel =
      limits.level_scale === 'CEFR'
        ? /^(A2|B1|B2|C1)$/.test(level)
        : limits.level_scale === 'HSK'
          ? /^[1-6]$/.test(level)
          : /^N[1-5]$/.test(level);
    if (!validLevel || !clean(item.meaning_ko)) continue;
    const pinyin = language === 'zh' ? clean(item.pinyin) : '';
    if (language === 'zh' && (!/\p{Script=Latin}/u.test(pinyin) || /\p{Script=Han}/u.test(pinyin)))
      continue;
    const reading = language === 'ja' ? clean(item.reading) : '';
    if (language === 'ja' && !/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(reading)) continue;
    const sourceContext =
      normalize(context).includes(key) && source.includes(normalize(context))
        ? context
        : sourceSentence(sourceText, text);
    seen.add(key);
    phrases.push({
      text,
      language,
      meaning_ko: clean(item.meaning_ko),
      context_sentence: sourceContext.slice(0, 200),
      level,
      type: item.type,
      ...(language === 'zh' ? { pinyin } : {}),
      ...(language === 'ja' ? { reading } : {}),
      ...(item.note_ko ? { note_ko: clean(item.note_ko).slice(0, 200) } : {}),
    });
    if (phrases.length >= requestedMax) break;
  }
  return { phrases, droppedNotInSource };
}

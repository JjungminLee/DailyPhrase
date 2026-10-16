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

function romanizedJapaneseToKana(value) {
  if (!/^[a-zāīūēō\s'-]+$/i.test(value)) return '';
  const normalized = value
    .toLocaleLowerCase()
    .replaceAll('ā', 'aa')
    .replaceAll('ī', 'ii')
    .replaceAll('ū', 'uu')
    .replaceAll('ē', 'ei')
    .replaceAll('ō', 'ou')
    .replace(/[’']/g, '');
  const tokens = normalized.trim().split(/\s+/).filter(Boolean);
  const particles = new Map([
    ['o', 'を'],
    ['wo', 'を'],
    ['wa', 'は'],
    ['e', 'へ'],
  ]);
  const syllables = {
    kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ', gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
    sha: 'しゃ', shu: 'しゅ', sho: 'しょ', ja: 'じゃ', ju: 'じゅ', jo: 'じょ',
    cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ', nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ',
    hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ', bya: 'びゃ', byu: 'びゅ', byo: 'びょ',
    pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ', mya: 'みゃ', myu: 'みゅ', myo: 'みょ',
    rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ', shi: 'し', chi: 'ち', tsu: 'つ',
    ji: 'じ', fu: 'ふ', shi: 'し', wi: 'うぃ', we: 'うぇ', wo: 'を',
    ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ', ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
    sa: 'さ', si: 'し', su: 'す', se: 'せ', so: 'そ', za: 'ざ', zi: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
    ta: 'た', ti: 'ち', tu: 'つ', te: 'て', to: 'と', da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
    na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の', ha: 'は', hi: 'ひ', hu: 'ふ', he: 'へ', ho: 'ほ',
    ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ', pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
    ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も', ya: 'や', yu: 'ゆ', yo: 'よ',
    ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ', wa: 'わ', n: 'ん',
    a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お', vu: 'ゔ',
  };
  const keys = Object.keys(syllables).sort((left, right) => right.length - left.length);
  const converted = tokens
    .map((token) => {
      if (particles.has(token)) return particles.get(token);
      let result = '';
      for (let index = 0; index < token.length;) {
        if (
          index + 1 < token.length &&
          token[index] === token[index + 1] &&
          !'aeioun'.includes(token[index])
        ) {
          result += 'っ';
          index += 1;
          continue;
        }
        if (
          token[index] === 'n' &&
          token[index + 1] &&
          !'aeiouy'.includes(token[index + 1])
        ) {
          result += 'ん';
          index += 1;
          continue;
        }
        const match = keys.find((key) => token.startsWith(key, index));
        if (!match) return '';
        result += syllables[match];
        index += match.length;
      }
      return result;
    })
    .join('');
  return converted && !/[a-z]/i.test(converted) ? converted : '';
}

function japaneseReading(value) {
  const reading = clean(value);
  if (/^[\p{Script=Hiragana}\p{Script=Katakana}\sー]+$/u.test(reading)) return reading;
  return romanizedJapaneseToKana(reading);
}

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
  let droppedInvalid = 0;
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
    ) {
      droppedInvalid += 1;
      continue;
    }
    const allowedTypes =
      language === 'zh' || language === 'ja'
        ? ['collocation', 'idiom', 'sentence_pattern', 'other']
        : ['collocation', 'idiom', 'phrasal_verb', 'sentence_pattern', 'other'];
    if (!allowedTypes.includes(item.type)) {
      droppedInvalid += 1;
      continue;
    }
    if (
      language === 'ja' &&
      count(text, 'chars') < 6 &&
      !/(?:は|が|を|に|へ|と|で|から|まで|より|の|も)/u.test(text)
    ) {
      droppedInvalid += 1;
      continue;
    }
    const rawLevel = clean(item.level);
    const hskLevel = rawLevel.match(/^(?:HSK\s*)?([1-6])$/i)?.[1];
    const level = limits.level_scale === 'HSK' ? hskLevel || rawLevel : rawLevel;
    const validLevel =
      limits.level_scale === 'CEFR'
        ? /^(A2|B1|B2|C1)$/.test(level)
        : limits.level_scale === 'HSK'
          ? /^[1-6]$/.test(level)
          : /^N[1-5]$/.test(level);
    if (!validLevel || !clean(item.meaning_ko)) {
      droppedInvalid += 1;
      continue;
    }
    const pinyin = language === 'zh' ? clean(item.pinyin) : '';
    const validPinyin =
      language === 'zh' && /\p{Script=Latin}/u.test(pinyin) && !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(pinyin);
    const reading = language === 'ja' ? japaneseReading(item.reading) : '';
    const kanaOnlyReading = /^[\p{Script=Hiragana}\p{Script=Katakana}ー\s・。、！？「」]+$/u.test(reading);
    const validReading =
      language === 'ja' &&
      kanaOnlyReading &&
      /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(reading);
    if (language === 'zh' && !validPinyin)
      throw new AppError('extract_failed', `Model omitted valid pinyin for Chinese expression: ${text}`);
    if (language === 'ja' && !validReading) {
      droppedInvalid += 1;
      continue;
    }
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
  return { phrases, droppedNotInSource, droppedWrongLanguage, droppedInvalid };
}

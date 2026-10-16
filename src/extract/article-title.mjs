import { AppError } from '../errors.mjs';

function titleSchema(requireJapaneseReading = false) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['title_translation_ko', ...(requireJapaneseReading ? ['title_reading'] : [])],
    properties: {
      title_translation_ko: { type: 'string', minLength: 1 },
      title_pinyin: { type: 'string' },
      title_reading: { type: 'string' },
    },
  };
}

function readingFromKanaTitle(title) {
  if (!/^[\p{Script=Hiragana}\p{Script=Katakana}\p{M}\p{Zs}\p{P}\p{S}ー]+$/u.test(title))
    return '';
  return [...title]
    .map((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint >= 0x30a1 && codePoint <= 0x30f6
        ? String.fromCodePoint(codePoint - 0x60)
        : character;
    })
    .join('');
}

export async function translateArticleTitle({ title, language }) {
  const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const model =
    process.env.OLLAMA_TITLE_MODEL ||
    process.env.OLLAMA_ARTICLE_MODEL ||
    process.env.OLLAMA_MODEL ||
    'qwen3.5:9b';
  const timeoutMs = Number(process.env.TITLE_MODEL_TIMEOUT_MS || 60000);
  const hasJapaneseSource = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(title);
  const kanaSourceReading = language === 'ja' ? readingFromKanaTitle(title) : '';
  let response;
  try {
    response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        keep_alive: process.env.OLLAMA_KEEP_ALIVE || '10m',
        format: titleSchema(language === 'ja' && hasJapaneseSource && !kanaSourceReading),
        messages: [
          {
            role: 'system',
            content: [
              `The source title is written in ${language}. Translate only the supplied title into concise, idiomatic Korean. Preserve its exact subject and meaning; do not replace it with a different headline or add any facts.`,
              'Translate every clause and preserve whether it is a question or statement. Keep proper names and numbers accurate. Before returning, check that each Korean phrase is supported by the source title.',
              'Prefer a clear, natural Korean headline over source-language word order. Keep the translation concise without dropping meaningful details.',
              language === 'ja' && hasJapaneseSource
                ? kanaSourceReading
                  ? 'The Japanese title uses only kana, so its exact hiragana reading is the source title with katakana converted to hiragana. Put that exact reading in title_reading.'
                  : 'The source title contains Japanese. Also provide its complete reading in hiragana in title_reading, including kanji readings. Keep title_translation_ko present even if a reading is uncertain.'
                : 'Return an empty title_reading unless the source title contains Japanese text that needs a Japanese reading.',
              language === 'zh'
                ? 'Also provide the complete title pronunciation in standard Hanyu Pinyin with tone marks in title_pinyin, with syllables separated by spaces. Keep title_translation_ko present even if pinyin is uncertain.'
                : 'Return an empty title_pinyin.',
              'For languages without a requested pronunciation, return an empty string for that field.',
              'Return only the requested JSON fields.',
            ].join(' '),
          },
          { role: 'user', content: title },
        ],
        options: {
          num_predict: Math.max(64, Number(process.env.TITLE_MAX_OUTPUT_TOKENS) || 160),
          temperature: 0.1,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const reason = error.cause?.code || error.name || 'network error';
    const message = error.name === 'TimeoutError'
      ? `Article title translation timed out after ${timeoutMs}ms.`
      : reason === 'ECONNREFUSED'
        ? `Could not connect to Ollama at ${baseUrl}. Start Ollama and verify OLLAMA_BASE_URL.`
        : `Article title translation failed (${reason}).`;
    throw new AppError('model_error', message, error.name === 'TimeoutError' ? 504 : 502);
  }

  if (!response.ok)
    throw new AppError('model_error', `Ollama returned HTTP ${response.status} for title translation`, 502);

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new AppError('extract_failed', 'Ollama returned an invalid title response', 502);
  }
  let result;
  try {
    result = JSON.parse(payload.message?.content || '');
  } catch {
    throw new AppError('extract_failed', 'Ollama returned invalid title data', 502);
  }

  const pinyin = String(result.title_pinyin || '').trim();
  const reading = String(result.title_reading || '').trim();
  if (
    typeof result.title_translation_ko !== 'string' ||
    !result.title_translation_ko.trim()
  )
    throw new AppError('extract_failed', 'Ollama omitted the title translation', 502);
  const translation = result.title_translation_ko.trim();
  if (
    language === 'ja' &&
    hasJapaneseSource &&
    (!/\p{Script=Hangul}/u.test(translation) ||
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(translation))
  )
    throw new AppError('extract_failed', 'Ollama returned a title translation in an unexpected language', 502);

  const validPinyin = language === 'zh' && /\p{Script=Latin}/u.test(pinyin) && !/\p{Script=Han}/u.test(pinyin);
  const validReading =
    language === 'ja' &&
    hasJapaneseSource &&
    /\p{Script=Hiragana}/u.test(reading) &&
    !/\p{Script=Han}/u.test(reading);

  return {
    title_translation_ko: translation,
    ...(validPinyin ? { title_pinyin: pinyin } : {}),
    ...(kanaSourceReading
      ? { title_reading: kanaSourceReading }
      : validReading
        ? { title_reading: reading }
        : {}),
    model_stats: {
      duration_ms: Number.isFinite(payload.total_duration)
        ? Math.round(payload.total_duration / 1_000_000)
        : null,
      prompt_tokens: Number.isInteger(payload.prompt_eval_count) ? payload.prompt_eval_count : null,
      generated_tokens: Number.isInteger(payload.eval_count) ? payload.eval_count : null,
    },
  };
}

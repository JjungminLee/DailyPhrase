import { AppError } from '../errors.mjs';

function titleSchema(language) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['title_translation_ko', 'title_pinyin', 'title_reading'],
    properties: {
      title_translation_ko: { type: 'string', minLength: 1 },
      title_pinyin: language === 'zh' ? { type: 'string', minLength: 1 } : { type: 'string' },
      title_reading: language === 'ja' ? { type: 'string', minLength: 1 } : { type: 'string' },
    },
  };
}

export async function translateArticleTitle({ title, language }) {
  const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const model = process.env.OLLAMA_ARTICLE_MODEL || process.env.OLLAMA_MODEL || 'qwen3.5:9b';
  const timeoutMs = Number(process.env.TITLE_MODEL_TIMEOUT_MS || 60000);
  let response;
  try {
    response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        format: titleSchema(language),
        messages: [
          {
            role: 'system',
            content: [
              `The title language is ${language}. Translate the entire title into concise, natural Korean, preserving its meaning and proper names.`,
              'For Japanese (ja), provide the complete title reading in hiragana in title_reading. Do not leave kanji unread.',
              'For Chinese (zh), provide the complete title pronunciation in standard tone-marked pinyin in title_pinyin.',
              'For languages without a requested pronunciation, return an empty string for that field.',
              'Return only the requested JSON fields.',
            ].join(' '),
          },
          { role: 'user', content: title },
        ],
        options: { num_predict: 160 },
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
    !result.title_translation_ko.trim() ||
    (language === 'zh' && (!/\p{Script=Latin}/u.test(pinyin) || /\p{Script=Han}/u.test(pinyin))) ||
    (language === 'ja' && (!/\p{Script=Hiragana}/u.test(reading) || /\p{Script=Han}/u.test(reading)))
  )
    throw new AppError('extract_failed', 'Ollama omitted the title translation or pronunciation', 502);

  return {
    title_translation_ko: result.title_translation_ko.trim(),
    ...(language === 'zh' ? { title_pinyin: pinyin } : {}),
    ...(language === 'ja' ? { title_reading: reading } : {}),
  };
}

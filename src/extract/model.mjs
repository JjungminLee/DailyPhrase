import { AppError } from '../errors.mjs';

function phraseSchema(language) {
  const pinyin = language === 'zh' ? { type: 'string', minLength: 1 } : { type: 'string' };
  const reading = language === 'ja' ? { type: 'string', minLength: 1 } : { type: 'string' };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['phrases'],
    properties: {
      phrases: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'text',
            'meaning_ko',
            'context_sentence',
            'level',
            'type',
            'note_ko',
            'pinyin',
            'reading',
          ],
          properties: {
            text: { type: 'string' },
            meaning_ko: { type: 'string' },
            context_sentence: { type: 'string' },
            level: { type: 'string' },
            type: {
              type: 'string',
              enum: ['collocation', 'idiom', 'phrasal_verb', 'sentence_pattern', 'other'],
            },
            note_ko: { type: 'string' },
            pinyin,
            reading,
          },
        },
      },
    },
  };
}

function instructions({ language, limits }) {
  return [
    'Read the supplied article and select expressions that fluent native speakers naturally use in real conversations and writing.',
    'Rank the results from most broadly useful and commonly used to less common. Prefer expressions that learners can reuse in many everyday or general situations, not merely expressions that are interesting in this one article.',
    'Favor natural collocations, idioms, phrasal verbs, and sentence patterns. Avoid isolated basic words, proper nouns, headline fragments, stiff bureaucratic wording, and specialist or one-off jargon unless the expression itself is widely useful.',
    'Return only expressions that appear verbatim in the article and an exact sentence from the article containing each expression.',
    'Do not reproduce the article or provide long quotations. Each context_sentence must be one short sentence (maximum 200 characters).',
    'Write meaning_ko as a concise, natural Korean paraphrase of what the expression means in this exact context. Translate the intent and pragmatic meaning, not each word literally; use the Korean expression a learner would actually say. For example, explain “break the ice” as “어색한 분위기를 풀다,” not “얼음을 깨다.”',
    'Write note_ko in Korean as a short learning tip about nuance, register, or a common situation where the expression is used. Do not simply repeat meaning_ko. Use an empty string only when no additional useful tip applies. Never invent source context or claim unsupported frequency statistics.',
    'Return the strongest, most reusable expressions first. Do not claim an expression is common unless it is broadly established in natural native usage.',
    'For Chinese (zh), pinyin is required for every expression: write the full pronunciation in standard pinyin, using tone marks on the syllable vowels and no tone numbers. Never leave it empty, and set reading to an empty string. For Japanese (ja), reading is required: write the complete pronunciation of every expression in hiragana (use katakana only where standard), never leave it empty, and set pinyin to an empty string. For other languages, set both pinyin and reading to empty strings.',
    `The article language is ${language}. Choose expressions containing ${limits.min} to ${limits.max} ${limits.phrase_unit}.`,
    `Use levels from ${limits.level_scale}: ${limits.level_scale === 'CEFR' ? 'A2, B1, B2, or C1' : limits.level_scale === 'HSK' ? '1 to 6' : 'N1 to N5'}.`,
  ].join(' ');
}

export async function extractPhrases({
  article,
  language,
  limits,
  maxPhrases,
  timeoutMs,
  maxTokens,
  model: requestedModel,
}) {
  const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const model = requestedModel || process.env.OLLAMA_MODEL || 'qwen3.5:9b';
  const requestTimeoutMs = timeoutMs ?? Number(process.env.MODEL_TIMEOUT_MS || 120000);
  let result;
  try {
    result = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        format: phraseSchema(language),
        messages: [
          { role: 'system', content: instructions({ language, limits }) },
          {
            role: 'user',
            content: `Article title: ${article.title}\nArticle text:\n${article.description}`,
          },
        ],
        options: { num_predict: maxTokens ?? Math.min(6000, 500 + maxPhrases * 180) },
      }),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch (error) {
    const reason = error.cause?.code || error.name || 'network error';
    const message =
      error.name === 'TimeoutError'
        ? `Ollama request timed out after ${requestTimeoutMs}ms. Increase MODEL_TIMEOUT_MS or use a smaller model.`
        : reason === 'ECONNREFUSED'
          ? `Could not connect to Ollama at ${baseUrl}. Start Ollama and verify OLLAMA_BASE_URL.`
          : `Ollama request failed (${reason})`;
    throw new AppError('model_error', message, error.name === 'TimeoutError' ? 504 : 502);
  }

  if (!result.ok) {
    const status = result.status;
    const message =
      status === 404
        ? `Ollama model "${model}" was not found. Pull it with "ollama pull ${model}".`
        : `Ollama returned HTTP ${status}`;
    throw new AppError('model_error', message, status >= 500 ? 503 : 502);
  }

  let payload;
  try {
    payload = await result.json();
  } catch {
    throw new AppError('extract_failed', 'Ollama returned an invalid response', 502);
  }
  const output = payload.message?.content;
  if (typeof output !== 'string' || !output.trim())
    throw new AppError('extract_failed', 'Ollama returned no phrase output', 502);
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new AppError('extract_failed', 'Ollama returned invalid structured phrase data', 502);
  }
  if (!Array.isArray(parsed.phrases))
    throw new AppError('extract_failed', 'Ollama returned invalid structured phrase data', 502);
  return parsed.phrases.slice(0, maxPhrases);
}

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

function instructions({ language, limits, maxPhrases }) {
  return [
    `Select at most ${maxPhrases} expressions fluent native speakers commonly use in conversation or general writing. Rank by everyday reuse value; favor natural collocations, idioms, phrasal verbs, and sentence patterns. Avoid basic isolated words, names, headline fragments, bureaucratic language, and one-off jargon.`,
    'Copy each expression exactly as written, including tense and inflection; never substitute a dictionary form. Every expression must appear verbatim in the article, with one exact source sentence of at most 200 characters as context. Do not reproduce more article text than needed.',
    'Write meaning_ko as a concise, natural Korean paraphrase of the expression in context, preserving intent rather than translating word for word. Write note_ko as a short Korean tip on nuance or register, without repeating the meaning. Do not invent context or unsupported frequency claims.',
    'For Chinese, provide full tone-marked pinyin and an empty reading. For Japanese, provide the full reading in hiragana (standard katakana where needed) and empty pinyin. For other languages, leave both pronunciation fields empty.',
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
          { role: 'system', content: instructions({ language, limits, maxPhrases }) },
          {
            role: 'user',
            content: `Article title: ${article.title}\nArticle text:\n${article.description}`,
          },
        ],
        options: {
          num_predict: maxTokens ?? Math.min(6000, 500 + maxPhrases * 180),
        },
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
  return {
    phrases: parsed.phrases.slice(0, maxPhrases),
    model_stats: {
      duration_ms: Number.isFinite(payload.total_duration)
        ? Math.round(payload.total_duration / 1_000_000)
        : null,
      prompt_tokens: Number.isInteger(payload.prompt_eval_count) ? payload.prompt_eval_count : null,
      generated_tokens: Number.isInteger(payload.eval_count) ? payload.eval_count : null,
    },
  };
}

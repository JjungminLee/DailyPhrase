import { AppError } from '../errors.mjs';

const phraseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['phrases'],
  properties: {
    phrases: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'meaning_ko', 'context_sentence', 'level', 'type', 'note_ko'],
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
        },
      },
    },
  },
};

function instructions({ language, limits }) {
  return [
    'Read the supplied article text and select useful, natural expressions a fluent native speaker would actually use.',
    'Prioritize expressions native speakers use frequently in everyday or general contexts; prefer reusable, high-frequency phrasing over rare or article-specific jargon.',
    'Return only expressions that appear verbatim in the article and an exact sentence from the article containing each expression.',
    'Prefer reusable collocations, idioms, phrasal verbs, and sentence patterns over isolated basic vocabulary.',
    'Do not reproduce the article or provide long quotations. Each context_sentence must be one short sentence (maximum 200 characters).',
    'Write meaning_ko and note_ko in Korean. Do not invent examples or translations as if they were in the source.',
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
        format: phraseSchema,
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
  try {
    const parsed = JSON.parse(output);
    return Array.isArray(parsed.phrases) ? parsed.phrases.slice(0, maxPhrases) : parsed;
  } catch {
    throw new AppError('extract_failed', 'Ollama returned invalid structured phrase data', 502);
  }
}

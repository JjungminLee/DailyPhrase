import { AppError } from '../errors.mjs';

const endpoint = 'https://api.openai.com/v1/responses';

function responseText(payload) {
  if (typeof payload.output_text === 'string') return payload.output_text;
  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === 'output_text')
    .map((item) => item.text)
    .join('');
}

export async function extractPhrases({ article, language, limits, maxPhrases }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey)
    throw new AppError(
      'model_error',
      'OPENAI_API_KEY is not configured. Set it in the local environment and restart the API.',
      503,
    );

  const model = process.env.OPENAI_MODEL || 'gpt-6-astra';
  let result;
  try {
    result = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        store: false,
        instructions: [
          'Read the supplied article text and select useful, natural expressions a fluent native speaker would actually use.',
          'Return only expressions that appear verbatim in the article and an exact sentence from the article containing each expression.',
          'Prefer reusable collocations, idioms, phrasal verbs, and sentence patterns over isolated basic vocabulary.',
          'Do not reproduce the article or provide long quotations. Each context_sentence must be one short sentence (maximum 200 characters).',
          'Write meaning_ko and note_ko in Korean. Do not invent examples or translations as if they were in the source.',
          `The article language is ${language}. Choose expressions containing ${limits.min} to ${limits.max} ${limits.phrase_unit}.`,
          `Use levels from ${limits.level_scale}: ${limits.level_scale === 'CEFR' ? 'A2, B1, B2, or C1' : limits.level_scale === 'HSK' ? '1 to 6' : 'N1 to N5'}.`,
        ].join(' '),
        input: `Article title: ${article.title}\nArticle text:\n${article.description}`,
        max_output_tokens: Math.min(6000, 500 + maxPhrases * 180),
        text: {
          format: {
            type: 'json_schema',
            name: 'daily_phrases',
            strict: true,
            schema: {
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
                    },
                  },
                },
              },
            },
          },
        },
      }),
      signal: AbortSignal.timeout(Number(process.env.OPENAI_TIMEOUT_MS || 30000)),
    });
  } catch (error) {
    const reason = error.cause?.code || error.name || 'network error';
    const message =
      reason === 'EACCES' || reason === 'EPERM'
        ? 'OpenAI API network access was denied; allow the local Node.js process to connect to api.openai.com over HTTPS.'
        : `OpenAI API request failed (${reason})`;
    throw new AppError('model_error', message, error.name === 'TimeoutError' ? 504 : 502);
  }

  if (!result.ok) {
    const status = result.status;
    const message =
      status === 401
        ? 'OpenAI rejected OPENAI_API_KEY. Check the key configured for the API process.'
        : status === 429
          ? 'OpenAI rate limit or quota reached. Check the project quota and try again.'
          : `OpenAI API returned HTTP ${status}`;
    throw new AppError('model_error', message, status === 429 ? 429 : status >= 500 ? 503 : 502);
  }

  const payload = await result.json();
  const output = responseText(payload);
  if (!output) throw new AppError('extract_failed', 'OpenAI returned no phrase output', 502);
  try {
    const parsed = JSON.parse(output);
    return Array.isArray(parsed.phrases) ? parsed.phrases.slice(0, maxPhrases) : parsed;
  } catch {
    throw new AppError('extract_failed', 'OpenAI returned invalid structured phrase data', 502);
  }
}

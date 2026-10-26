import { AppError } from '../errors.mjs';

function phraseSchema(language) {
  const pronunciationField = language === 'zh' ? 'pinyin' : language === 'ja' ? 'reading' : null;
  const types =
    language === 'zh' || language === 'ja'
      ? ['collocation', 'idiom', 'sentence_pattern', 'other']
      : ['collocation', 'idiom', 'phrasal_verb', 'sentence_pattern', 'other'];
  const levels =
    language === 'zh'
      ? ['1', '2', '3', '4', '5', '6']
      : language === 'ja'
        ? ['N1', 'N2', 'N3', 'N4', 'N5']
        : ['A2', 'B1', 'B2', 'C1'];
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
            'level',
            'type',
            'note_ko',
            ...(pronunciationField ? [pronunciationField] : []),
          ],
          properties: {
            text: { type: 'string' },
            meaning_ko: { type: 'string' },
            level: { type: 'string', enum: levels },
            type: {
              type: 'string',
              enum: types,
            },
            note_ko: { type: 'string' },
            pinyin: { type: 'string', ...(language === 'zh' ? { minLength: 1 } : {}) },
            reading: { type: 'string', ...(language === 'ja' ? { minLength: 1 } : {}) },
          },
        },
      },
    },
  };
}

export function buildExtractionInstructions({ language, limits, maxPhrases, sourceType, forceExamples = false }) {
  const sourceInstructions =
    sourceType === 'transcript'
      ? 'The supplied source text is a transcript. Extract expressions only from words spoken in it; never use the title, promotional description, summary, metadata, outside knowledge, or inferred wording. If it contains no transcript text, return an empty phrases array.'
      : 'The supplied source text is article text. Extract expressions only from wording present in it; never use the title, metadata, outside knowledge, or inferred wording. When the article includes a parallel translation, select only from the section written in the requested language.';
  return [
    `Select up to ${maxPhrases} natural expressions that fluent native speakers commonly use. Everyday chunks and sentence patterns count even when simple; they do not need to be idioms. Avoid isolated vocabulary, names, headlines, and one-off jargon.`,
    'For beginner stories, prioritize reusable everyday patterns that are explicitly present in the source. Do not return an empty list when a complete, natural example of a common pattern appears. Return empty only when the source has no suitable multi-character expression.',
    sourceInstructions,
    'Copy each expression exactly as written, including spelling, script, spaces, tense, and inflection; never translate it, convert kana to kanji, or substitute a dictionary form. Every expression must appear verbatim in the supplied source text. Do not output a context sentence; the application will quote it directly from the source.',
    'Write meaning_ko as a concise, natural Korean paraphrase of the expression in context, preserving intent rather than translating word for word. Write note_ko as a short Korean tip on nuance or register, without repeating the meaning. Do not invent context or unsupported frequency claims.',
    'Write meaning_ko and note_ko in Korean only. Every Chinese expression MUST include its complete standard Hanyu Pinyin with tone marks in pinyin, syllables separated by spaces. Every Japanese expression MUST include its complete pronunciation in kana only in reading, converting all kanji to their reading. Never omit these fields or return them empty. For other languages, leave both pronunciation fields empty.',
    language === 'ja'
      ? 'Japanese source may be a news article or pasted lesson text, not only a story. Select useful everyday chunks and complete grammar patterns even when the text is news. Choose a literal contiguous substring from the article text, preserving every character. Do not create a grammar template: never output 〜, ～, ~, ellipses, or placeholder marks in a phrase. If a phrase cannot be copied as an exact substring, do not return it. Prefer useful patterns with particles and predicates over isolated conjugated verbs. Never return an empty list when a usable exact phrase is present. Use sentence_pattern for grammar and collocation for natural word combinations; do not label Japanese phrases as idioms or phrasal verbs.'
      : language === 'zh'
        ? 'For Chinese beginner stories, prefer reusable everyday sentence patterns or natural chunks over isolated vocabulary items. Do not label Chinese expressions as phrasal verbs.'
        : '',
    forceExamples
      ? `This is a recovery attempt because the previous extraction found no usable expressions. Re-read the supplied ${language} text and return up to ${maxPhrases} short, reusable phrases copied exactly from it. Prefer complete examples that meet the requested length and level. Do not return an empty list if any suitable phrase is present. For Japanese, choose expressions only from the exact source candidates appended to the article text, copy them character-for-character, never use placeholders, and include a kana-only reading for every candidate.`
      : '',
    `The article language is ${language}. Choose expressions containing ${limits.min} to ${limits.max} ${limits.phrase_unit}.`,
    'Use expressions written in the requested article language only. When an article includes a parallel translation, ignore the translated section and select only from the original-language section.',
    `Use levels from ${limits.level_scale}: ${limits.level_scale === 'CEFR' ? 'A2, B1, B2, or C1' : limits.level_scale === 'HSK' ? 'the digits 1 to 6 only, without the HSK prefix' : 'N1 to N5'}.`,
  ].join(' ');
}

export function exactJapaneseCandidates(text, maxChars = 12) {
  const endings = /だけでなく|と言いました|と言って|ようです|ています|ていました|そうです|になります|たり/g;
  const candidates = new Set();
  for (const match of String(text).matchAll(endings)) {
    const end = match.index + match[0].length;
    const boundary = Math.max(
      String(text).lastIndexOf('。', match.index),
      String(text).lastIndexOf('！', match.index),
      String(text).lastIndexOf('？', match.index),
      String(text).lastIndexOf('\n', match.index),
    ) + 1;
    const chars = [...String(text).slice(boundary, end)];
    const candidate = chars
      .slice(-maxChars)
      .join('')
      .replace(/^[、。！？「『\s]+/u, '');
    if (candidate && [...candidate].length <= maxChars) candidates.add(candidate);
  }
  return [...candidates];
}

export function buildExtractionMessages(article, { language, forceExamples = false, maxPhraseChars = 12 } = {}) {
  const candidates = language === 'ja' && forceExamples
    ? exactJapaneseCandidates(article.description, maxPhraseChars)
    : [];
  const candidateList = candidates.length
    ? `\n\nExact source candidates (choose expressions only from these; copy them character-for-character):\n${candidates.map((candidate) => `- ${candidate}`).join('\n')}`
    : '';
  return [
    {
      role: 'user',
      // The title is metadata, not part of the source passage. Keeping it out
      // prevents the model from selecting or blending wording from the headline.
      content: `Article text:\n${article.description}${candidateList}`,
    },
  ];
}

export async function extractPhrases({
  article,
  language,
  limits,
  maxPhrases,
  timeoutMs,
  maxTokens,
  seed,
  model: requestedModel,
  sourceType = article.source_type || 'article',
  forceExamples = false,
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
        keep_alive: process.env.OLLAMA_KEEP_ALIVE || '10m',
        format: phraseSchema(language),
        messages: [
          {
            role: 'system',
            content: buildExtractionInstructions({
              language,
              limits,
              maxPhrases,
              sourceType,
              forceExamples,
            }),
          },
          ...buildExtractionMessages(article, {
            language,
            forceExamples,
            maxPhraseChars: limits.max,
          }),
        ],
        options: {
          num_predict: maxTokens ?? Math.min(6000, 300 + maxPhrases * 140),
          temperature: 0.1,
          ...(Number.isInteger(seed) ? { seed } : {}),
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
  const durationMs = (value) =>
    Number.isFinite(value) ? Math.round(value / 1_000_000) : null;
  const tokensPerSecond = (count, duration) =>
    Number.isInteger(count) && Number.isFinite(duration) && duration > 0
      ? Math.round(((count * 1_000_000_000) / duration) * 100) / 100
      : null;
  return {
    phrases: parsed.phrases.slice(0, maxPhrases),
    model_stats: {
      duration_ms: durationMs(payload.total_duration),
      model_load_ms: durationMs(payload.load_duration),
      prompt_eval_ms: durationMs(payload.prompt_eval_duration),
      generation_ms: durationMs(payload.eval_duration),
      prompt_tokens: Number.isInteger(payload.prompt_eval_count) ? payload.prompt_eval_count : null,
      cached_prompt_tokens: Number.isInteger(payload.prompt_eval_cached_count)
        ? payload.prompt_eval_cached_count
        : null,
      generated_tokens: Number.isInteger(payload.eval_count) ? payload.eval_count : null,
      prompt_tokens_per_second: tokensPerSecond(
        payload.prompt_eval_count,
        payload.prompt_eval_duration,
      ),
      generation_tokens_per_second: tokensPerSecond(payload.eval_count, payload.eval_duration),
    },
  };
}

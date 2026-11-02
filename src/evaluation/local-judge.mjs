import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { rootDir } from '../config.mjs';
import { AppError } from '../errors.mjs';

const outputPaths = {
  full: path.join(rootDir, 'results/local-judge-evaluation-latest.json'),
  quick: path.join(rootDir, 'results/local-judge-evaluation-quick-latest.json'),
};
const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
const criteria = {
  naturalness: ['1: unnatural or clearly non-native', '2: understandable but awkward or uncommon', '3: natural and commonly usable'],
  context_fit: ['1: does not fit or is unsupported by the source context', '2: partly fits but misses nuance', '3: fits the source context and meaning'],
  beginner_usefulness: ['1: not useful for a beginner', '2: somewhat reusable or level is uncertain', '3: useful, reusable, and beginner-appropriate'],
  language_quality: ['1: wrong language or serious grammatical/orthographic problem', '2: mostly correct with a noticeable issue', '3: correct and appropriate in the target language'],
  field_quality: ['1: meaning, Korean note, or pronunciation field is materially wrong', '2: partly accurate but needs correction', '3: fields are accurate and helpful'],
};
const prompt = `You are a cautious multilingual language-learning quality evaluator. Evaluate each model output against only its source text and the rubric. Do not assume the output is correct because it was produced by a strong model. Do not invent corpus-frequency evidence. A score of 3 means the output appears natural and useful; it does not prove native-speaker acceptance. For field_quality, judge Korean meaning/note and, for Chinese/Japanese, the supplied pronunciation field. Use score 1-3 for each criterion and confidence 1-3 for your overall confidence. Give short, concrete reasons. Return only the required JSON.`;
const quickPrompt = `${prompt} Return exactly one result for every supplied case_id; do not omit cases. Keep each rationale to one brief sentence of at most 12 words.`;
const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['cases'],
  properties: {
    cases: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['case_id', 'naturalness', 'context_fit', 'beginner_usefulness', 'language_quality', 'field_quality', 'confidence', 'rationale'],
        properties: {
          case_id: { type: 'string' },
          naturalness: { type: 'integer', minimum: 1, maximum: 3 },
          context_fit: { type: 'integer', minimum: 1, maximum: 3 },
          beginner_usefulness: { type: 'integer', minimum: 1, maximum: 3 },
          language_quality: { type: 'integer', minimum: 1, maximum: 3 },
          field_quality: { type: 'integer', minimum: 1, maximum: 3 },
          confidence: { type: 'integer', minimum: 1, maximum: 3 },
          rationale: { type: 'string' },
        },
      },
    },
  },
};
const quickSchema = structuredClone(schema);
quickSchema.properties.cases.items.properties.rationale.maxLength = 100;
const rubricRevision = createHash('sha256').update(`${prompt}\n${JSON.stringify(criteria)}`).digest('hex');
const quickRubricRevision = createHash('sha256')
  .update(`${quickPrompt}\n${JSON.stringify(criteria)}\n${JSON.stringify(quickSchema)}`)
  .digest('hex');

async function latestBaseline() {
  const files = (await readdir(path.join(rootDir, 'results')))
    .filter((file) => /^model-evaluation-.*\.json$/.test(file))
    .sort();
  if (!files.length) throw new AppError('evaluation_unavailable', '모델 기준선 결과 파일이 없습니다.', 404);
  const file = files.at(-1);
  return { file, report: JSON.parse(await readFile(path.join(rootDir, 'results', file), 'utf8')) };
}

export async function getLocalJudgeEvaluation(mode = 'full') {
  const outputPath = outputPaths[mode];
  if (!outputPath) return null;
  try {
    return JSON.parse(await readFile(outputPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function runLocalJudgeEvaluation({ mode = 'full' } = {}) {
  if (!outputPaths[mode])
    throw new AppError('invalid_request', 'mode must be quick or full', 400);
  const { file, report: baseline } = await latestBaseline();
  const availableCases = baseline.results.filter((item) => item.status === 'success' && item.output);
  const cases = mode === 'quick'
    ? [...new Set(availableCases.map((item) => item.language))].map((language) =>
        availableCases.find((item) => item.language === language),
      )
    : availableCases;
  if (!cases.length || cases.some((item) => !item))
    throw new AppError('evaluation_unavailable', '평가할 모델 출력이 없습니다.', 404);

  const evaluatorModel = process.env.EVALUATOR_MODEL || baseline.model.requested || 'qwen3.5:9b';
  const evaluatorPrompt = mode === 'quick' ? quickPrompt : prompt;
  const evaluationRubricRevision = mode === 'quick' ? quickRubricRevision : rubricRevision;
  const maxTokens = mode === 'quick' ? 900 : 1800;
  const cached = await getLocalJudgeEvaluation(mode);
  const cachedTokenLimit = cached?.generation?.max_tokens;
  if (
    cached?.baseline_file === file &&
    cached?.evaluator_model === evaluatorModel &&
    cached?.evaluator_rubric_revision === evaluationRubricRevision &&
    cached?.cases.length === cases.length &&
    (cachedTokenLimit === maxTokens || (mode === 'full' && cachedTokenLimit === undefined)) &&
    (!cached.evaluation_mode || cached.evaluation_mode === mode)
  ) {
    return { ...cached, cached: true };
  }

  const tagsResponse = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
  if (!tagsResponse.ok)
    throw new AppError('model_error', `Ollama 모델 목록 조회 실패 (HTTP ${tagsResponse.status})`, 502);
  const tags = (await tagsResponse.json()).models || [];
  if (!tags.some((item) => item.name === evaluatorModel || item.model === evaluatorModel))
    throw new AppError('model_not_found', `평가 모델 "${evaluatorModel}"이 Ollama에 없습니다.`, 404);

  const judged = [];
  for (let offset = 0; offset < cases.length; offset += 5) {
    const batch = cases.slice(offset, offset + 5);
    const started = Date.now();
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: evaluatorModel,
        stream: false,
        think: false,
        format: mode === 'quick' ? quickSchema : schema,
        messages: [
          { role: 'system', content: `${evaluatorPrompt}\nRubric: ${JSON.stringify(criteria)}` },
          {
            role: 'user',
            content: JSON.stringify(batch.map((item) => ({
              case_id: item.id,
              language: item.language,
              source_text: item.source_text,
              output: item.output,
            }))),
          },
        ],
        options: { temperature: 0, seed: 42, num_predict: maxTokens },
      }),
      signal: AbortSignal.timeout(Number(process.env.EVALUATOR_TIMEOUT_MS || 300000)),
    });
    if (!response.ok)
      throw new AppError('model_error', `Ollama 평가 요청 실패 (HTTP ${response.status})`, 502);
    const payload = await response.json();
    let parsed;
    try {
      parsed = JSON.parse(payload.message?.content || '');
    } catch {
      throw new AppError('evaluation_parse_error', `평가 결과 JSON 해석 실패 (사례 ${offset + 1}부터)`, 502);
    }
    const byId = new Map((parsed.cases || []).map((item) => [item.case_id, item]));
    const elapsedMs = Math.round((Date.now() - started) / batch.length);
    for (const item of batch) {
      const answer = byId.get(item.id);
      if (!answer) throw new AppError('evaluation_parse_error', `평가 결과에서 ${item.id}를 찾지 못했습니다.`, 502);
      judged.push({
        case_id: item.id,
        language: item.language,
        phrase: item.output.text,
        code_checks: item.checks,
        judgment: answer,
        average_case_ms: elapsedMs,
      });
    }
  }

  const summary = Object.fromEntries([...new Set(cases.map((item) => item.language))].map((language) => {
    const rows = judged.filter((item) => item.language === language);
    const averages = Object.fromEntries(Object.keys(criteria).map((key) => [
      key,
      Math.round((rows.reduce((sum, row) => sum + row.judgment[key], 0) / rows.length) * 100) / 100,
    ]));
    return [language, { cases: rows.length, averages }];
  }));
  const result = {
    kind: 'local-llm-judge-evaluation',
    evaluation_mode: mode,
    timestamp: new Date().toISOString(),
    baseline_file: file,
    dataset: baseline.dataset,
    generator_model: baseline.model.requested,
    evaluator_model: evaluatorModel,
    generation: { temperature: 0, seed: 42, max_tokens: maxTokens },
    evaluator_rubric_revision: evaluationRubricRevision,
    evaluator_prompt: evaluatorPrompt,
    metrics: criteria,
    summary,
    cases: judged,
    interpretation: 'Local LLM judgments are proxy scores, not native-speaker validation or evidence of actual usage frequency. Same-family generator/evaluator bias may apply.',
  };
  const outputPath = outputPaths[mode];
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return result;
}

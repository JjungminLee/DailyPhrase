import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { rootDir, readJson } from '../src/config.mjs';

const cases = await readJson('data/inputs.json');
if (!Array.isArray(cases) || cases.length === 0)
  throw new Error('Add reviewed cases to data/inputs.json before running the phrase harness.');

const endpoints = [
  ['local', process.env.LOCAL_PHRASE_API_URL || process.env.PHRASE_API_URL || 'http://127.0.0.1:3000/api'],
  ...(process.env.DEPLOYED_PHRASE_API_URL ? [['deployed', process.env.DEPLOYED_PHRASE_API_URL]] : []),
].map(([name, configured]) => {
  const base = new URL(configured);
  base.search = '';
  base.hash = '';
  return { name, base, url: new URL('phrases', base.href.endsWith('/') ? base : `${base.href}/`) };
});
const timeoutMs = Number(process.env.PHRASE_HARNESS_TIMEOUT_MS || 300000);
const timestamp = new Date().toISOString();
const results = [];

for (const endpoint of endpoints) {
  for (const testCase of cases) {
    const started = Date.now();
    let httpStatus = null;
    let payload = null;
    let failure = null;
    try {
      const body = {
        feed_id: testCase.feed_id,
        article_url: testCase.article_url,
        article_title: testCase.article_title,
        purpose: 'article_detail',
        max_phrases: 4,
      };
      if (testCase.article_text) body.article_text = testCase.article_text;
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      httpStatus = response.status;
      payload = await response.json();
      const phrases = Array.isArray(payload.phrases) ? payload.phrases : [];
      if (!response.ok || payload.error) {
        if (
          testCase.expected === 'blocked' &&
          testCase.expected_error_type &&
          payload.error?.type === testCase.expected_error_type
        ) {
          failure = null;
        } else {
          failure = payload.error?.message || `API returned HTTP ${response.status}`;
        }
      } else if (testCase.expected === 'success') {
        if (phrases.length === 0) {
          failure = 'Expected useful phrases, but the API returned an empty list.';
        } else {
          const normalize = (value) => String(value || '').normalize('NFKC').trim().toLocaleLowerCase();
          const actual = new Set(phrases.map(({ text }) => normalize(text)));
          const matches = testCase.expected_phrases.filter((phrase) => actual.has(normalize(phrase)));
          const minimum = testCase.minimum_expected_matches || 1;
          if (matches.length < minimum)
            failure = `Expected at least ${minimum} reviewed phrase(s); matched ${matches.length}.`;
        }
      } else if (testCase.expected === 'blocked') {
        if (phrases.length) failure = 'Expected a blocked/empty result, but the API returned phrases.';
      } else {
        failure = `Unsupported expected outcome: ${testCase.expected}`;
      }
    } catch (error) {
      failure = `${error.name}: ${error.message}`;
    }

    results.push({
      endpoint: endpoint.name,
      api_url: `${endpoint.base.origin}${endpoint.base.pathname}`,
      case_id: testCase.id,
      language: testCase.language,
      expected: testCase.expected,
      http_status: httpStatus,
      request_id: payload?.request_id || null,
      duration_ms: Date.now() - started,
      passed: !failure,
      failure,
      phrases: payload?.phrases || [],
      stats: payload?.stats || null,
      error: payload?.error || null,
      review: { status: 'pending', decisions: [] },
    });
  }
}

const record = {
  kind: 'phrase-quality-comparison',
  timestamp,
  model_provider: process.env.MODEL_PROVIDER || 'record manually',
  model_version: process.env.MODEL_VERSION || 'record manually',
  prompt_revision: process.env.PROMPT_REVISION || 'record manually',
  cases: cases.map(({ id }) => id),
  endpoints: endpoints.map(({ name, base }) => ({ name, url: `${base.origin}${base.pathname}` })),
  results,
  passed: results.every(({ passed }) => passed),
};
const resultsDir = path.join(rootDir, 'results');
await mkdir(resultsDir, { recursive: true });
const filename = `phrase-quality-${timestamp.replaceAll(':', '-').replaceAll('.', '-')}.json`;
const recordPath = path.join(resultsDir, filename);
await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  passed: record.passed,
  cases: cases.length,
  endpoints: endpoints.map(({ name }) => name),
  failures: results.filter(({ passed }) => !passed).map(({ endpoint, case_id, failure, request_id }) => ({ endpoint, case_id, failure, request_id })),
  record: path.relative(rootDir, recordPath),
}, null, 2));

if (!record.passed) process.exitCode = 1;

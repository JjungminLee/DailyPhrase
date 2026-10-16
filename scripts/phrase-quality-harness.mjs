import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readJson, rootDir } from '../src/config.mjs';

const cases = await readJson('data/phrase-quality-cases.json');
if (!Array.isArray(cases) || cases.length === 0) {
  throw new Error('Phrase quality cases must be a non-empty array.');
}

const configuredBase = process.env.PHRASE_API_URL || 'http://127.0.0.1:3000/api';
const apiBase = new URL(configuredBase);
apiBase.search = '';
apiBase.hash = '';
const endpoint = new URL('phrases', apiBase.href.endsWith('/') ? apiBase : `${apiBase.href}/`);
const timeoutMs = Number(process.env.PHRASE_HARNESS_TIMEOUT_MS || 300000);
const timestamp = new Date().toISOString();
const results = [];

for (const testCase of cases) {
  const started = Date.now();
  let httpStatus = null;
  let payload = null;
  let failure = null;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        feed_id: testCase.feed_id,
        article_url: testCase.article_url,
        article_title: testCase.article_title,
        purpose: 'article_detail',
        max_phrases: 10,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    httpStatus = response.status;
    payload = await response.json();
    if (!response.ok || payload.error) {
      failure = payload.error?.message || `API returned HTTP ${response.status}`;
    } else if (testCase.expected === 'success') {
      const phrases = Array.isArray(payload.phrases) ? payload.phrases : [];
      if (phrases.length === 0) {
        failure = 'Expected useful phrases, but the API returned an empty list.';
      } else {
        const actual = new Set(phrases.map(({ text }) => String(text || '').normalize('NFKC').trim().toLocaleLowerCase()));
        const expected = testCase.expected_phrases.map((phrase) => phrase.normalize('NFKC').trim().toLocaleLowerCase());
        const matches = expected.filter((phrase) => actual.has(phrase));
        const minimumMatches = testCase.minimum_expected_matches || 1;
        if (matches.length < minimumMatches) {
          failure = `Expected at least ${minimumMatches} known useful phrase(s); matched ${matches.length}.`;
        }
      }
    } else if (testCase.expected === 'blocked' && payload.phrases?.length) {
      failure = 'Expected a blocked/empty result, but the API returned phrases.';
    }
  } catch (error) {
    failure = `${error.name}: ${error.message}`;
  }

  results.push({
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
  });
}

const record = {
  kind: 'phrase-quality-harness',
  timestamp,
  api_url: `${apiBase.origin}${apiBase.pathname}`,
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
  cases: results.length,
  failed_cases: results.filter(({ passed }) => !passed).map(({ case_id, failure, request_id }) => ({ case_id, failure, request_id })),
  record: path.relative(rootDir, recordPath),
}, null, 2));

if (!record.passed) process.exitCode = 1;

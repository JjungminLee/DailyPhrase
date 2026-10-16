import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readJson, rootDir } from '../src/config.mjs';
import { translateArticleTitle } from '../src/extract/article-title.mjs';

const cases = await readJson('data/article-title-quality-cases.json');
if (!Array.isArray(cases) || cases.length === 0)
  throw new Error('Article title quality cases must be a non-empty array.');

const originalFetch = globalThis.fetch;
const results = [];

for (const testCase of cases) {
  for (const expected of ['rejected', 'corrected']) {
    let reviewRequestSeen = false;
    globalThis.fetch = async (_url, options) => {
      const request = JSON.parse(options.body);
      if (request.format.required[0] === 'faithful') {
        reviewRequestSeen = true;
        const reviewInput = JSON.parse(request.messages.at(-1).content);
        assert.equal(reviewInput.source_title, testCase.source_title);
        assert.equal(reviewInput.proposed_translation_ko, testCase.unfaithful_translation_ko);
        const result =
          expected === 'rejected'
            ? { faithful: false, verified_translation_ko: '' }
            : { faithful: true, verified_translation_ko: testCase.corrected_translation_ko };
        return new Response(JSON.stringify({ message: { content: JSON.stringify(result) } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      assert.equal(request.messages.at(-1).content, testCase.source_title);
      return new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({ title_translation_ko: testCase.unfaithful_translation_ko }),
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const startedAt = Date.now();
    let passed = false;
    let actualTranslation = '';
    let failure = null;
    try {
      const translated = await translateArticleTitle({
        title: testCase.source_title,
        language: testCase.language,
      });
      actualTranslation = translated.title_translation_ko;
      assert.equal(expected, 'corrected', 'An unfaithful candidate should be blocked.');
      assert.equal(actualTranslation, testCase.corrected_translation_ko);
      passed = true;
    } catch (error) {
      if (expected === 'rejected' && /Could not verify/.test(error.message)) passed = true;
      else failure = `${error.name}: ${error.message}`;
    } finally {
      globalThis.fetch = originalFetch;
    }
    assert.equal(reviewRequestSeen, true, 'The fidelity review request must run.');

    results.push({
      case_id: testCase.id,
      language: testCase.language,
      expected,
      passed,
      duration_ms: Date.now() - startedAt,
      translation: actualTranslation || null,
      failure,
    });
  }
}

const record = {
  kind: 'article-title-quality-harness',
  timestamp: new Date().toISOString(),
  mode: 'deterministic mocked model responses',
  languages: [...new Set(cases.map(({ language }) => language))],
  results,
  passed: results.every(({ passed }) => passed),
};
const resultsDir = path.join(rootDir, 'results');
await mkdir(resultsDir, { recursive: true });
const filename = `article-title-quality-${record.timestamp.replaceAll(':', '-').replaceAll('.', '-')}.json`;
const recordPath = path.join(resultsDir, filename);
await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');

console.log(
  JSON.stringify(
    {
      passed: record.passed,
      cases: results.length,
      languages: record.languages,
      failed_cases: results
        .filter(({ passed }) => !passed)
        .map(({ case_id, expected, failure }) => ({ case_id, expected, failure })),
      record: path.relative(rootDir, recordPath),
    },
    null,
    2,
  ),
);

if (!record.passed) process.exitCode = 1;

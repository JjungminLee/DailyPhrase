import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { rootDir } from '../src/config.mjs';
import { evaluateReward } from '../src/evaluation/reward.mjs';

const config = JSON.parse(await readFile(path.join(rootDir, 'config/languages.json'), 'utf8'));
const rows = JSON.parse(await readStdin());
const scored = rows.map(({ source_text, language, raw_output }) => {
  let phrase = null;
  try {
    const start = raw_output.indexOf('{');
    const end = raw_output.lastIndexOf('}');
    if (start >= 0 && end > start) phrase = JSON.parse(raw_output.slice(start, end + 1)).phrases?.[0] || null;
  } catch {}
  const result = evaluateReward({ sourceText: source_text, language, limits: config.languages[language], phrase });
  const failedChecks = Object.values(result.checks).filter((passed) => !passed).length;
  return {
    reward: result.eligible ? 1 : -(failedChecks / Object.keys(result.checks).length),
    eligible: result.eligible,
    failed_checks: failedChecks,
  };
});
process.stdout.write(JSON.stringify(scored));

async function readStdin() {
  let value = '';
  for await (const chunk of process.stdin) value += chunk;
  return value;
}

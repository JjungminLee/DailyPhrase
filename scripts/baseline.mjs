import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { handler } from '../src/handler.mjs';
import { rootDir } from '../src/config.mjs';
import { summary } from '../src/harness/metrics.mjs';

const values = [];
const started = Date.now();
for (let i = 0; i < 5; i++) {
  const t = Date.now();
  await handler({
    httpMethod: 'GET',
    path: '/health',
    requestContext: { requestId: randomUUID() },
  });
  values.push(Date.now() - t);
}
const out = {
  kind: 'baseline',
  timestamp: new Date().toISOString(),
  git_sha: process.env.GIT_SHA || 'local-uncommitted',
  config: 'baseline',
  requests: summary(values),
  total_ms: Date.now() - started,
};
const dir = path.join(rootDir, 'results');
await mkdir(dir, { recursive: true });
const name = `${new Date().toISOString().slice(0, 10)}-baseline.json`;
await writeFile(path.join(dir, name), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

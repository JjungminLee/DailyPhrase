import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { handler } from '../src/handler.mjs';
import { rootDir } from '../src/config.mjs';
import { summary } from '../src/harness/metrics.mjs';

const levels = (process.env.CONCURRENCY || '1,5,10,20').split(',').map(Number);
const runs = [];
for (const concurrency of levels) {
  const attempts = 20;
  let next = 0;
  const times = [];
  const failures = [];
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < attempts) {
        const n = next++;
        const t = Date.now();
        const result = await handler({
          httpMethod: 'GET',
          path: '/health',
          requestContext: { requestId: randomUUID() },
        });
        times[n] = Date.now() - t;
        if (result.statusCode >= 400) failures.push({ status: result.statusCode });
      }
    }),
  );
  runs.push({
    concurrency,
    success: attempts - failures.length,
    failure: failures.length,
    failure_reasons: failures,
    ...summary(times),
  });
}
const out = {
  kind: 'load',
  timestamp: new Date().toISOString(),
  git_sha: process.env.GIT_SHA || 'local-uncommitted',
  total_requests: runs.reduce((n, r) => n + r.count, 0),
  runs,
};
const dir = path.join(rootDir, 'results');
await mkdir(dir, { recursive: true });
const name = `${new Date().toISOString().slice(0, 10)}-load.json`;
await writeFile(path.join(dir, name), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

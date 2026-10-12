import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { rootDir } from '../src/config.mjs';
import { studyPolling } from '../src/feeds/crawler.mjs';

const concurrencyLevels = (process.env.STUDY_CONCURRENCY || '1,2,4').split(',').map(Number);
const repeats = Number(process.env.STUDY_REPEATS || 2);
const report = await studyPolling({ concurrencyLevels, repeats });
report.notes = [
  'Use the same feed set and repeat count for each concurrency setting.',
  'Compare duration, throughput, and failures; remote feed latency and rate limits affect results.',
  'This measures feed polling only, not phrase extraction or cloud batch infrastructure.',
];
const outputDir = path.join(rootDir, 'results');
await mkdir(outputDir, { recursive: true });
const filename = `batch-poll-study-${new Date().toISOString().replaceAll(':', '-')}.json`;
await writeFile(path.join(outputDir, filename), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

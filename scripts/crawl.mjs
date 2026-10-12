import { setTimeout as delay } from 'node:timers/promises';
import { pollFeeds } from '../src/feeds/crawler.mjs';

const intervalSeconds = Number(process.env.CRAWL_INTERVAL_SECONDS || 900);
const concurrency = Number(process.env.POLL_CONCURRENCY || 2);
if (!Number.isFinite(intervalSeconds) || intervalSeconds < 60)
  throw new Error('CRAWL_INTERVAL_SECONDS must be at least 60');
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
  throw new Error('POLL_CONCURRENCY must be an integer from 1 to 8');

console.log(
  `Daily Phrase crawler running; polling every ${intervalSeconds}s (concurrency ${concurrency})`,
);
while (true) {
  try {
    console.log(JSON.stringify(await pollFeeds({ concurrency })));
  } catch (error) {
    console.error(JSON.stringify({ type: 'poll_failed', message: error.message }));
  }
  await delay(intervalSeconds * 1000);
}

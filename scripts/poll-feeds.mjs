import { pollFeeds } from '../src/feeds/crawler.mjs';

const concurrency = Number(process.env.POLL_CONCURRENCY || 2);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
  throw new Error('POLL_CONCURRENCY must be an integer from 1 to 8');
}
console.log(JSON.stringify(await pollFeeds({ concurrency }), null, 2));

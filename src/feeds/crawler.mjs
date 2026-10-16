import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../errors.mjs';
import { rootDir } from '../config.mjs';
import { parseFeed } from './rss.mjs';
import { safeFetch } from './safe-fetch.mjs';
import { mutateArticles, mutateFeeds, readArticles, readFeeds } from './store.mjs';

const fingerprint = (url) => createHash('sha256').update(url).digest('hex');
const dailyStatePath = path.join(rootDir, 'data/daily-poll.json');
let dailyPollInFlight;

function decodeHtml(value = '') {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSimpleNihongoListing(html, baseUrl) {
  const entries = [];
  for (const [, heading] of html.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)) {
    const link = heading.match(
      /<a\b([^>]*href=["'][^"']*article\.php\?id=\d+&(?:amp;)?level=entry[^"']*["'][^>]*)>([\s\S]*?)<\/a>/i,
    );
    if (!link) continue;
    const [, attributes, body] = link;
    const href = attributes.match(/href=["']([^"']+)/i)?.[1]?.replace(/&amp;/g, '&');
    const title = decodeHtml(body);
    if (!href || !title) continue;
    entries.push({ title, url: new URL(href, baseUrl).href, published_at: '', description: '' });
  }
  return [...new Map(entries.map((entry) => [entry.url, entry])).values()].slice(0, 100);
}

function seoulDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(date);
}

async function readDailyState() {
  try {
    return JSON.parse(await readFile(dailyStatePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function mapLimit(values, concurrency, task) {
  const output = new Array(values.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(values.length, concurrency) }, async () => {
      while (next < values.length) {
        const index = next++;
        output[index] = await task(values[index]);
      }
    }),
  );
  return output;
}

export async function scanFeed(feed) {
  if (!feed.enabled || !feed.verified) return { feed_id: feed.id, skipped: true, new_count: 0 };
  try {
    const fetched = await safeFetch(feed.rss_url, feed.allowed_domains, {
      allowTruncate: feed.allow_truncated_feed === true,
    });
    const entries = (feed.source_type === 'simple_nihongo_html'
      ? parseSimpleNihongoListing(fetched.text, fetched.url)
      : parseFeed(fetched.text).slice(0, 100));
    return {
      feed_id: feed.id,
      feed_name: feed.name,
      language: feed.language,
      checked_at: new Date().toISOString(),
      entries: entries.map((entry) => ({
        ...entry,
        url: new URL(entry.url, fetched.url).href,
      })),
      new_count: entries.length,
    };
  } catch (error) {
    return {
      feed_id: feed.id,
      feed_name: feed.name,
      checked_at: new Date().toISOString(),
      error: { type: error.type || 'feed_unavailable', message: error.message },
      new_count: 0,
    };
  }
}

export async function pollFeeds(options = {}) {
  if (dailyPollInFlight) return dailyPollInFlight;
  dailyPollInFlight = pollFeedsOnce(options).finally(() => {
    dailyPollInFlight = undefined;
  });
  return dailyPollInFlight;
}

async function pollFeedsOnce({ concurrency = 2, persist = true } = {}) {
  const today = seoulDate();
  const state = await readDailyState();
  if (persist && state.collection_date === today) {
    return {
      checked_at: state.checked_at,
      collection_date: today,
      already_collected_today: true,
      duration_ms: 0,
      concurrency,
      feed_count: 0,
      discovered_count: 0,
      baseline_count: 0,
      feeds: [],
    };
  }

  if (persist) {
    await mutateArticles((items) => {
      items.length = 0;
    });
    const checkedAt = new Date().toISOString();
    await writeFile(
      dailyStatePath,
      `${JSON.stringify({ collection_date: today, checked_at: checkedAt }, null, 2)}\n`,
      'utf8',
    );
  }

  const feeds = await readFeeds();
  const active = feeds.filter((feed) => feed.enabled && feed.verified);
  const startedAt = performance.now();
  const scans = await mapLimit(active, Math.max(1, Math.floor(concurrency)), scanFeed);
  const checkedAt = new Date().toISOString();
  let newlyDiscovered = [];
  const firstScans = new Set(
    active.filter((feed) => !feed.initial_scan_complete).map((feed) => feed.id),
  );
  const baselineCount = scans.reduce(
    (total, scan) => total + (firstScans.has(scan.feed_id) && !scan.error ? scan.new_count : 0),
    0,
  );

  if (persist) {
    const byId = new Map(scans.map((scan) => [scan.feed_id, scan]));
    await mutateFeeds((stored) => {
      for (const feed of stored) {
        const scan = byId.get(feed.id);
        if (!scan) continue;
        feed.last_checked_at = checkedAt;
        feed.last_error = scan.error ?? null;
        if (!scan.error) feed.initial_scan_complete = true;
      }
    });

    await mutateArticles((items) => {
      const known = new Map(items.map((item) => [item.fingerprint, item]));
      for (const scan of scans) {
        if (scan.error) continue;
        for (const entry of scan.entries) {
          const key = fingerprint(entry.url);
          const existing = known.get(key);
          if (existing) {
            delete existing.excerpt;
            continue;
          }
          const article = {
            id: `article_${key.slice(0, 20)}`,
            fingerprint: key,
            feed_id: scan.feed_id,
            feed_name: scan.feed_name,
            language: scan.language,
            title: entry.title,
            url: entry.url,
            published_at: entry.published_at || null,
            discovered_at: checkedAt,
            status: firstScans.has(scan.feed_id) ? 'baseline' : 'new',
          };
          known.set(key, article);
          newlyDiscovered.push(article);
        }
      }
      items.unshift(
        ...scans.flatMap((scan) =>
          scan.error || !firstScans.has(scan.feed_id)
            ? []
            : newlyDiscovered.filter((article) => article.feed_id === scan.feed_id),
        ),
        ...newlyDiscovered.filter((article) => !firstScans.has(article.feed_id)),
      );
      if (items.length > 5000) items.length = 5000;
    });
  }

  return {
    checked_at: checkedAt,
    collection_date: today,
    duration_ms: Math.round(performance.now() - startedAt),
    concurrency,
    feed_count: active.length,
    discovered_count: newlyDiscovered.filter((article) => article.status === 'new').length,
    baseline_count: baselineCount,
    feeds: scans.map(({ entries, ...scan }) => ({ ...scan, entry_count: entries?.length ?? 0 })),
  };
}

export async function studyPolling({ concurrencyLevels = [1, 2, 4], repeats = 1 } = {}) {
  const feeds = (await readFeeds()).filter((feed) => feed.enabled && feed.verified);
  if (!feeds.length)
    throw new AppError(
      'feed_unavailable',
      'Add a verified feed before running the batch study',
      409,
    );
  if (
    !Array.isArray(concurrencyLevels) ||
    concurrencyLevels.some((value) => !Number.isInteger(value) || value < 1 || value > 8) ||
    !Number.isInteger(repeats) ||
    repeats < 1 ||
    repeats > 5
  )
    throw new AppError('invalid_request', 'Invalid batch study settings', 400);

  const runs = [];
  for (const concurrency of concurrencyLevels) {
    const durations = [];
    let successful = 0;
    let failed = 0;
    let entries = 0;
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      const started = performance.now();
      const scans = await mapLimit(feeds, concurrency, scanFeed);
      durations.push(Math.round(performance.now() - started));
      successful += scans.filter((scan) => !scan.error).length;
      failed += scans.filter((scan) => scan.error).length;
      entries += scans.reduce((total, scan) => total + (scan.new_count || 0), 0);
    }
    const totalMs = durations.reduce((sum, value) => sum + value, 0);
    runs.push({
      concurrency,
      repeats,
      total_feeds: feeds.length,
      successful_scans: successful,
      failed_scans: failed,
      mean_duration_ms: Math.round(totalMs / durations.length),
      p50_duration_ms: percentile(durations, 0.5),
      p95_duration_ms: percentile(durations, 0.95),
      articles_seen: entries,
      scans_per_second: Number(((successful + failed) / (totalMs / 1000)).toFixed(2)),
      repeat_durations_ms: durations,
    });
  }
  return {
    kind: 'batch-poll-study',
    created_at: new Date().toISOString(),
    mode: 'read-only feed polling; does not update the article inbox',
    feeds: feeds.map(({ id, name, language }) => ({ id, name, language })),
    runs,
  };
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

export async function nextNewArticle(language) {
  const [feeds, articles] = await Promise.all([readFeeds(), readArticles()]);
  const activeIds = new Set(feeds.filter((feed) => feed.enabled).map((feed) => feed.id));
  return articles.find(
    (article) =>
      article.language === language && article.status === 'new' && activeIds.has(article.feed_id),
  );
}

export async function markArticleProcessed(articleId) {
  return mutateArticles((items) => {
    const article = items.find((item) => item.id === articleId);
    if (!article) throw new AppError('not_found', 'Article was not found', 404);
    article.status = 'processed';
    article.processed_at = new Date().toISOString();
    return article;
  });
}

export async function listArticles({ status, language } = {}) {
  const items = await mutateArticles((stored) => {
    for (const article of stored) {
      delete article.excerpt;
      delete article.description;
      delete article.content;
      delete article.body;
    }
    return stored;
  });
  return items
    .filter(
      (item) => (!status || item.status === status) && (!language || item.language === language),
    )
    .map(({ excerpt, description, content, ...metadata }) => metadata);
}

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { rootDir, readJson, getLanguages } from '../config.mjs';
import { AppError } from '../errors.mjs';
import { parseFeed } from './rss.mjs';
import { safeFetch } from './safe-fetch.mjs';

const feedPath = path.join(rootDir, 'data/subscriptions.json');
const articlePath = path.join(rootDir, 'data/articles.json');
const defaultFeedPath = 'config/default-feeds.json';
let writes = Promise.resolve();

async function atomicWrite(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, filePath);
}

function serializeWrite(operation) {
  const result = writes.then(operation);
  writes = result.catch(() => {});
  return result;
}

export async function readFeeds() {
  const [configured, defaults] = await Promise.all([
    readJson('config/feeds.json'),
    readJson(defaultFeedPath),
  ]);
  if (!Array.isArray(configured.feeds) || !Array.isArray(defaults.feeds))
    throw new AppError('invalid_store', 'Feed store is malformed');
  const subscriptions = await serializeWrite(async () => {
    const data = await readJson('data/subscriptions.json').catch((error) => {
      if (error.code === 'ENOENT') return { feeds: [], dismissed_defaults: [] };
      throw error;
    });
    if (!Array.isArray(data.feeds)) throw new AppError('invalid_store', 'Feed store is malformed');
    data.dismissed_defaults ??= [];
    if (!Array.isArray(data.dismissed_defaults))
      throw new AppError('invalid_store', 'Feed store is malformed');
    const existing = new Set(data.feeds.map((feed) => feed.id));
    const dismissed = new Set(data.dismissed_defaults);
    const seeds = defaults.feeds.filter(
      (feed) => !existing.has(feed.id) && !dismissed.has(feed.id),
    );
    if (seeds.length) {
      data.feeds.push(
        ...seeds.map((feed) => ({
          ...structuredClone(feed),
          added_at: new Date().toISOString(),
          last_checked_at: null,
          last_error: null,
        })),
      );
      await atomicWrite(feedPath, data);
    }
    return data.feeds;
  });
  const configuredIds = new Set(configured.feeds.map((feed) => feed.id));
  return [...configured.feeds, ...subscriptions.filter((feed) => !configuredIds.has(feed.id))];
}

export async function mutateFeeds(mutator) {
  return serializeWrite(async () => {
    const data = await readJson('data/subscriptions.json').catch((error) => {
      if (error.code === 'ENOENT') return { feeds: [], dismissed_defaults: [] };
      throw error;
    });
    const feeds = data.feeds;
    if (!Array.isArray(feeds)) throw new AppError('invalid_store', 'Feed store is malformed');
    const result = await mutator(feeds, data);
    const dismissed_defaults = data.dismissed_defaults ?? [];
    await atomicWrite(feedPath, { feeds, dismissed_defaults });
    return result;
  });
}

export async function readArticles() {
  try {
    const data = JSON.parse(await readFile(articlePath, 'utf8'));
    return Array.isArray(data.items) ? data.items : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export async function mutateArticles(mutator) {
  return serializeWrite(async () => {
    const items = await readArticles();
    const result = await mutator(items);
    await atomicWrite(articlePath, { items });
    return result;
  });
}

function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((match) => [
      match[1].toLowerCase(),
      match[2] ?? match[3] ?? '',
    ]),
  );
}

function discoverUrl(html, baseUrl) {
  const candidates = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map(([element]) => attributes(element))
    .filter(
      (attrs) =>
        /alternate/i.test(attrs.rel || '') &&
        /rss|atom|xml/i.test(`${attrs.type || ''} ${attrs.href || ''}`),
    );
  const href = candidates.find((attrs) => attrs.href)?.href;
  return href ? new URL(href, baseUrl).href : null;
}

export async function inspectFeedUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new AppError('invalid_request', 'Enter a valid http or https URL', 400);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port)
    throw new AppError(
      'invalid_request',
      'Use a public http or https URL without credentials or a custom port',
      400,
    );

  const allowedDomains = [url.hostname];
  const homepage = await safeFetch(url.href, allowedDomains);
  let feedUrl = homepage.url;
  let xml = homepage.text;
  let entries = parseFeed(xml);
  let sourceType = entries.length ? 'rss_or_atom' : 'html';

  if (!entries.length) {
    const discoveredUrl = discoverUrl(xml, homepage.url);
    if (!discoveredUrl)
      throw new AppError('feed_unavailable', 'No RSS or Atom feed was found at this URL', 422);
    const candidate = new URL(discoveredUrl);
    if (!allowedDomains.includes(candidate.hostname)) allowedDomains.push(candidate.hostname);
    const discovered = await safeFetch(discoveredUrl, allowedDomains);
    feedUrl = discovered.url;
    xml = discovered.text;
    entries = parseFeed(xml);
    sourceType = 'html_autodiscovery';
  }

  if (!entries.length)
    throw new AppError(
      'feed_unavailable',
      'The feed was reachable but contained no usable article entries',
      422,
    );

  for (const entry of entries) {
    try {
      const hostname = new URL(entry.url, feedUrl).hostname;
      if (!allowedDomains.includes(hostname)) allowedDomains.push(hostname);
    } catch {
      // Invalid article links are ignored by the feed parser's consumer.
    }
  }

  return {
    url: feedUrl,
    homepage_url: homepage.url,
    source_type: sourceType,
    allowed_domains: allowedDomains,
    entry_count: entries.length,
    sample: entries.slice(0, 3).map(({ title, url: articleUrl, published_at }) => ({
      title,
      url: articleUrl,
      published_at,
    })),
  };
}

export async function addFeed({ name, url, language }) {
  const { config } = await getLanguages([language]);
  const inspected = await inspectFeedUrl(url);
  const feed = {
    id: `feed_${randomUUID()}`,
    name: (name || config.languages[language].name).trim().slice(0, 100),
    language,
    rss_url: inspected.url,
    homepage_url: inspected.homepage_url,
    source_type: inspected.source_type,
    allowed_domains: inspected.allowed_domains,
    enabled: true,
    verified: true,
    added_at: new Date().toISOString(),
    last_checked_at: new Date().toISOString(),
    last_error: null,
    initial_scan_complete: false,
  };
  if (!feed.name) throw new AppError('invalid_request', 'Feed name cannot be empty', 400);
  await mutateFeeds((feeds) => {
    if (feeds.some((entry) => entry.rss_url === feed.rss_url))
      throw new AppError('duplicate_feed', 'This feed is already subscribed', 409);
    feeds.push(feed);
    return feed;
  });
  return { feed, verification: inspected };
}

export async function removeFeed(id) {
  return mutateFeeds((feeds, data) => {
    const index = feeds.findIndex((feed) => feed.id === id);
    if (index < 0) throw new AppError('not_found', 'Feed was not found', 404);
    const [removed] = feeds.splice(index, 1);
    // The default seed is intentionally copied into the local subscription store.
    // Keep a tombstone so deleting it in Admin does not add it back on next read.
    if (removed.is_default) {
      data.dismissed_defaults ??= [];
      data.dismissed_defaults.push(removed.id);
    }
    return removed;
  });
}

export async function setFeedEnabled(id, enabled) {
  return mutateFeeds((feeds) => {
    const feed = feeds.find((item) => item.id === id);
    if (!feed) throw new AppError('not_found', 'Feed was not found', 404);
    feed.enabled = enabled;
    return feed;
  });
}

export async function validateStoredFeed(id) {
  const feeds = await readFeeds();
  const feed = feeds.find((item) => item.id === id);
  if (!feed) throw new AppError('not_found', 'Feed was not found', 404);
  const result = await inspectFeedUrl(feed.rss_url);
  await mutateFeeds((current) => {
    const stored = current.find((item) => item.id === id);
    stored.verified = true;
    stored.rss_url = result.url;
    stored.homepage_url = result.homepage_url;
    stored.source_type = result.source_type;
    stored.allowed_domains = result.allowed_domains;
    stored.last_checked_at = new Date().toISOString();
    stored.last_error = null;
    return stored;
  });
  return result;
}

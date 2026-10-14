import { randomUUID } from 'node:crypto';
import { getLanguages } from './config.mjs';
import { AppError, response } from './errors.mjs';
import { latestArticle } from './feeds/rss.mjs';
import { isAllowedHost } from './feeds/safe-fetch.mjs';
import { extractPhrases } from './extract/model.mjs';
import { translateArticleTitle } from './extract/article-title.mjs';
import { validatePhrases } from './postprocess/validate.mjs';
import {
  finishGoogleDriveAuthorization,
  googleDriveAuthorizationUrl,
  googleDriveStatus,
  listDriveStudyRecords,
  saveDriveStudyRecord,
} from './google-drive.mjs';
import {
  addFeed,
  inspectFeedUrl,
  readFeeds,
  removeFeed,
  setFeedEnabled,
  validateStoredFeed,
} from './feeds/store.mjs';
import {
  listArticles,
  markArticleProcessed,
  nextNewArticle,
  pollFeeds,
  studyPolling,
} from './feeds/crawler.mjs';

const startedAt = Date.now();
const jsonBody = (event) => {
  if (!event.body) return {};
  try {
    const parsed = JSON.parse(
      event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body,
    );
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('body must be a JSON object');
    return parsed;
  } catch {
    throw new AppError('invalid_request', 'Request body must be valid JSON', 400);
  }
};
function pathOf(event) {
  const proxyPath = event.pathParameters?.proxy;
  let path = proxyPath ? `/api/${proxyPath}` : event.rawPath || event.path || '/';
  const stage = event.requestContext?.stage;
  if (!proxyPath && stage && path.startsWith(`/${stage}/`)) path = path.slice(stage.length + 1);
  return path;
}

async function phraseRequest(body, forcedLanguage, queuedArticle) {
  if (typeof body.feed_id !== 'string' || !body.feed_id)
    throw new AppError('invalid_request', 'feed_id is required', 400);
  if (body.article_url !== undefined && typeof body.article_url !== 'string')
    throw new AppError('invalid_request', 'article_url must be a URL string', 400);
  if (
    body.article_title !== undefined &&
    (typeof body.article_title !== 'string' || body.article_title.length > 500)
  )
    throw new AppError(
      'invalid_request',
      'article_title must be a string up to 500 characters',
      400,
    );
  if (body.article_text !== undefined) {
    if (body.purpose !== 'article_detail')
      throw new AppError(
        'invalid_request',
        'article_text is only supported for article_detail',
        400,
      );
    if (
      typeof body.article_text !== 'string' ||
      !body.article_text.trim() ||
      body.article_text.length > 40000
    )
      throw new AppError('invalid_request', 'article_text must contain 1 to 40000 characters', 400);
    if (typeof body.article_url !== 'string' || !body.article_url)
      throw new AppError('invalid_request', 'article_url is required with article_text', 400);
  }
  if (body.purpose !== undefined && body.purpose !== 'article_detail')
    throw new AppError('invalid_request', 'Unsupported phrase extraction purpose', 400);
  const max = body.max_phrases ?? 10;
  if (!Number.isInteger(max) || max < 1 || max > 30)
    throw new AppError('invalid_request', 'max_phrases must be an integer from 1 to 30', 400);
  const feeds = await readFeeds();
  const feed = feeds.find((entry) => entry.id === body.feed_id);
  if (!feed) throw new AppError('invalid_request', 'Unknown feed_id', 400);
  if (forcedLanguage && feed.language !== forcedLanguage)
    throw new AppError('invalid_request', 'feed_id language does not match request language', 400);
  let article;
  if (body.article_text !== undefined) {
    let articleUrl;
    try {
      articleUrl = new URL(body.article_url);
    } catch {
      throw new AppError('invalid_request', 'article_url must be a valid URL', 400);
    }
    if (!isAllowedHost(articleUrl.hostname, feed.allowed_domains))
      throw new AppError('invalid_request', 'article_url is outside the feed domains', 400);
    article = {
      title: body.article_title || 'Article',
      url: articleUrl.href,
      published_at: null,
      description: body.article_text.trim(),
    };
  } else {
    article = await latestArticle(feed, queuedArticle?.url || body.article_url, body.article_title);
  }
  if (queuedArticle) {
    article.title = queuedArticle.title;
    article.published_at = queuedArticle.published_at;
  }
  const configuredMaxChars = Number(process.env.MAX_INPUT_CHARS || 120000);
  const maxChars =
    Number.isFinite(configuredMaxChars) && configuredMaxChars > 0
      ? Math.floor(configuredMaxChars)
      : 120000;
  const phraseInputLimit = body.purpose === 'article_detail' ? Math.min(maxChars, 8000) : maxChars;
  article.description = article.description.slice(0, phraseInputLimit);
  const languages = await getLanguages([feed.language]);
  const limits = languages.config.languages[feed.language];
  const generated = await extractPhrases({
    article,
    language: feed.language,
    limits,
    maxPhrases: max,
    model:
      body.purpose === 'article_detail' && process.env.DAILY_PHRASE_LOCAL === '1'
        ? process.env.OLLAMA_ARTICLE_MODEL || process.env.OLLAMA_MODEL
        : undefined,
    timeoutMs:
      body.purpose === 'article_detail' && process.env.DAILY_PHRASE_LOCAL === '1'
        ? Math.min(300000, Math.max(30000, Number(process.env.ARTICLE_MODEL_TIMEOUT_MS) || 240000))
        : undefined,
    maxTokens: body.purpose === 'article_detail' ? Math.min(800, 180 + max * 110) : undefined,
  });
  const validated = validatePhrases(generated.phrases, article, feed.language, limits, max);
  return {
    language: feed.language,
    source: {
      feed_id: feed.id,
      title: article.title,
      url: article.url,
      published_at: article.published_at || null,
    },
    phrases: validated.phrases,
    stats: {
      ...generated.model_stats,
      input_chars: article.description.length,
      phrase_count: validated.phrases.length,
      dropped_not_in_source: validated.droppedNotInSource,
    },
  };
}

export async function handler(event = {}) {
  const requestId = event.requestContext?.requestId || randomUUID();
  const started = Date.now();
  let status = 200;
  let errorType = null;
  try {
    const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
    const requestPath = pathOf(event);
    const path =
      requestPath === '/' ? '/' : requestPath.startsWith('/api/') ? requestPath.slice(4) : null;
    if (method === 'GET' && path === '/') {
      const feeds = await readFeeds();
      const activeFeeds = feeds.filter((feed) => feed.enabled && feed.verified);
      return response(200, {
        request_id: requestId,
        service: 'Daily Phrase API',
        mode: 'API only; no browser UI',
        status: 'running',
        extraction_ready: false,
        active_feed_count: activeFeeds.length,
        endpoints: [
          { method: 'GET', path: '/health' },
          { method: 'POST', path: '/article-title' },
          { method: 'POST', path: '/phrases' },
          { method: 'POST', path: '/phrases/daily' },
          { method: 'POST', path: '/check' },
        ],
      });
    }
    if (method === 'GET' && path === '/health') {
      if (process.env.DAILY_PHRASE_LOCAL === '1') {
        const collection = await pollFeeds();
        if (!collection.already_collected_today)
          console.log(JSON.stringify({ type: 'daily_collection', ...collection }));
      }
      const feeds = await readFeeds();
      const { config } = await getLanguages();
      return response(200, {
        request_id: requestId,
        status: 'ok',
        version: process.env.BUILD_VERSION || 'local',
        languages: Object.keys(config.languages).filter((code) =>
          feeds.some((f) => f.language === code && f.enabled && f.verified),
        ),
        init_ms: Date.now() - startedAt,
      });
    }
    if (method === 'GET' && path === '/config') {
      const { config } = await getLanguages();
      return response(200, {
        request_id: requestId,
        default_languages: config.default_languages,
        languages: Object.entries(config.languages).map(([code, value]) => ({ code, ...value })),
      });
    }
    if (path.startsWith('/drive/') || path === '/study-records') {
      if (process.env.DAILY_PHRASE_LOCAL !== '1')
        throw new AppError('not_found', 'Unknown route', 404);
      if (method === 'GET' && path === '/drive/status')
        return response(200, await googleDriveStatus());
      if (method === 'GET' && path === '/drive/connect') {
        return {
          statusCode: 302,
          headers: { location: googleDriveAuthorizationUrl(), 'cache-control': 'no-store' },
          body: '',
        };
      }
      if (method === 'GET' && path === '/drive/callback') {
        const query = event.queryStringParameters || {};
        if (query.error)
          return {
            statusCode: 302,
            headers: { location: `http://localhost:${process.env.VITE_PORT || 5173}/studied?drive=error`, 'cache-control': 'no-store' },
            body: '',
          };
        if (typeof query.code !== 'string' || typeof query.state !== 'string')
          throw new AppError('invalid_request', 'Google authorization response is missing code or state.', 400);
        await finishGoogleDriveAuthorization({ code: query.code, state: query.state });
        return {
          statusCode: 302,
          headers: { location: `http://localhost:${process.env.VITE_PORT || 5173}/studied?drive=connected`, 'cache-control': 'no-store' },
          body: '',
        };
      }
      if (method === 'GET' && path === '/study-records')
        return response(200, { records: await listDriveStudyRecords() });
      if (method === 'POST' && path === '/study-records')
        return response(201, { record: await saveDriveStudyRecord(jsonBody(event)) });
    }
    if (path?.startsWith('/admin/')) {
      if (process.env.DAILY_PHRASE_LOCAL !== '1')
        throw new AppError('not_found', 'Unknown route', 404);
      if (method === 'GET' && path === '/admin/feeds')
        return response(200, { feeds: await readFeeds() });
      if (method === 'GET' && path === '/admin/articles')
        return response(200, { articles: await listArticles() });
      if (method === 'POST' && path === '/admin/feeds/verify')
        return response(200, { verification: await inspectFeedUrl(jsonBody(event).url) });
      if (method === 'POST' && path === '/admin/feeds')
        return response(201, await addFeed(jsonBody(event)));
      if (method === 'POST' && path === '/admin/poll') {
        const body = jsonBody(event);
        const concurrency = body.concurrency ?? 2;
        if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
          throw new AppError('invalid_request', 'concurrency must be an integer from 1 to 8', 400);
        return response(200, await pollFeeds({ concurrency }));
      }
      if (method === 'POST' && path === '/admin/study')
        return response(200, await studyPolling({ concurrencyLevels: [1, 2, 4], repeats: 1 }));
      const feedMatch = path.match(/^\/admin\/feeds\/([^/]+)$/);
      if (feedMatch && method === 'DELETE')
        return response(200, { removed: await removeFeed(decodeURIComponent(feedMatch[1])) });
      if (feedMatch && method === 'PUT') {
        const body = jsonBody(event);
        if (typeof body.enabled !== 'boolean')
          throw new AppError('invalid_request', 'enabled must be a boolean', 400);
        return response(200, {
          feed: await setFeedEnabled(decodeURIComponent(feedMatch[1]), body.enabled),
        });
      }
      const verifyMatch = path.match(/^\/admin\/feeds\/([^/]+)\/verify$/);
      if (verifyMatch && method === 'POST')
        return response(200, {
          verification: await validateStoredFeed(decodeURIComponent(verifyMatch[1])),
        });
      const articleMatch = path.match(/^\/admin\/articles\/([^/]+)\/processed$/);
      if (articleMatch && method === 'POST')
        return response(200, {
          article: await markArticleProcessed(decodeURIComponent(articleMatch[1])),
        });
      throw new AppError('not_found', 'Unknown route', 404);
    }
    if (method !== 'POST') throw new AppError('invalid_request', 'Unsupported method', 405);
    const body = jsonBody(event);
    if (path === '/article-title') {
      if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 500)
        throw new AppError('invalid_request', 'title must contain 1 to 500 characters', 400);
      if (typeof body.language !== 'string')
        throw new AppError('invalid_request', 'language is required', 400);
      await getLanguages([body.language]);
      return response(200, {
        request_id: requestId,
        ...(await translateArticleTitle({ title: body.title.trim(), language: body.language })),
      });
    }
    if (path === '/phrases')
      return response(200, { request_id: requestId, ...(await phraseRequest(body)) });
    if (path === '/phrases/daily') {
      const { codes } = await getLanguages(body.languages);
      const perLanguage = body.per_language ?? 10;
      if (!Number.isInteger(perLanguage) || perLanguage < 1 || perLanguage > 30)
        throw new AppError('invalid_request', 'per_language must be from 1 to 30', 400);
      const date =
        body.date ??
        new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
        throw new AppError('invalid_request', 'date must use YYYY-MM-DD', 400);
      const [year, month, day] = date.split('-').map(Number);
      const parsedDate = new Date(Date.UTC(year, month - 1, day));
      if (
        parsedDate.getUTCFullYear() !== year ||
        parsedDate.getUTCMonth() !== month - 1 ||
        parsedDate.getUTCDate() !== day
      )
        throw new AppError('invalid_request', 'date is not a valid calendar date', 400);
      const feeds = await readFeeds();
      const results = {};
      const errors = [];
      let next = 0;
      const worker = async () => {
        while (next < codes.length) {
          const language = codes[next++];
          try {
            const queuedArticle = await nextNewArticle(language);
            const feed = queuedArticle
              ? feeds.find((entry) => entry.id === queuedArticle.feed_id && entry.enabled)
              : feeds.find((entry) => entry.language === language && entry.enabled);
            if (!feed) throw new AppError('feed_unavailable', 'No enabled feed for language', 503);
            results[language] = await phraseRequest(
              { feed_id: feed.id, max_phrases: perLanguage },
              language,
              queuedArticle,
            );
            if (queuedArticle) await markArticleProcessed(queuedArticle.id);
          } catch (error) {
            errors.push({ language, type: error.type || 'internal', message: error.message });
          }
        }
      };
      const configuredConcurrency = Number(process.env.DAILY_CONCURRENCY || 1);
      const concurrency = Math.max(
        1,
        Math.min(
          codes.length,
          Number.isFinite(configuredConcurrency) ? Math.floor(configuredConcurrency) : 1,
        ),
      );
      await Promise.all(Array.from({ length: concurrency }, worker));
      return response(200, { request_id: requestId, date, results, errors });
    }
    if (path === '/check')
      throw new AppError('model_error', 'Phrase checking is pending model provider selection', 503);
    throw new AppError('invalid_request', 'Unknown route', 404);
  } catch (error) {
    status = error.status || 500;
    errorType = error.type || 'internal';
    return response(status, {
      error: {
        type: errorType,
        message: error.message,
        ...(error.languages ? { supported_languages: error.languages } : {}),
      },
      request_id: requestId,
    });
  } finally {
    console.log(
      JSON.stringify({
        request_id: requestId,
        total_ms: Date.now() - started,
        http_status: status,
        error_type: errorType,
      }),
    );
  }
}

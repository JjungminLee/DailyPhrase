import { AppError } from '../errors.mjs';
import { safeFetch, isAllowedHost } from './safe-fetch.mjs';

const decode = (s = '') =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
const tag = (s, name) =>
  s.match(
    new RegExp(
      `<(?:(?:[\\w.-]+):)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?${name}\\s*>`,
      'i',
    ),
  )?.[1] ?? '';

export function parseFeed(xml) {
  return [
    ...xml.matchAll(
      /<(?:[\w.-]+:)?(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?(?:item|entry)\s*>/gi,
    ),
  ]
    .map(([, block]) => {
      const link = block.match(
        /<(?:[\w.-]+:)?link\b([^>]*)\/?>(?:([\s\S]*?)<\/(?:[\w.-]+:)?link>)?/i,
      );
      const href = link?.[1]?.match(/href=["']([^"']+)/i)?.[1];
      return {
        title: decode(tag(block, 'title')) || 'Untitled article',
        url: href || decode(link?.[2] || tag(block, 'link')),
        published_at: decode(
          tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated'),
        ),
        description: decode(
          tag(block, 'description') || tag(block, 'summary') || tag(block, 'content'),
        ),
      };
    })
    .filter((item) => item.url);
}

export async function latestArticle(feed, articleUrl) {
  if (!feed?.verified || !feed?.enabled || !feed.rss_url)
    throw new AppError(
      'feed_unavailable',
      'No verified, enabled feed is configured for this language',
      503,
    );
  const fetched = await safeFetch(articleUrl || feed.rss_url, feed.allowed_domains);
  if (articleUrl)
    return { title: 'Article', url: fetched.url, published_at: null, description: fetched.text };
  const item = parseFeed(fetched.text)[0];
  if (!item) throw new AppError('feed_unavailable', 'RSS feed has no usable articles', 502);
  const url = new URL(item.url, fetched.url);
  if (!isAllowedHost(url.hostname, feed.allowed_domains))
    throw new AppError('feed_unavailable', 'Article URL is outside the allowed domains', 502);
  const articleBody = await safeFetch(url.href, feed.allowed_domains);
  const readable = articleBody.text
    .replace(/<(script|style|nav|footer|header|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
  return { ...item, url: url.href, description: readable || item.description };
}

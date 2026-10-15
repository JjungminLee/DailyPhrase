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

function readableText(html) {
  const main = html.match(/<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)>/i)?.[1] || html;
  return main
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(
      /<(script|style|nav|footer|header|noscript|svg|form|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,
      ' ',
    )
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&apos;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

function readableTranscript(html) {
  const text = readableText(html);
  const marker = text.match(/\b(?:read\s+)?transcript\b/i);
  if (!marker) return '';
  const transcript = text.slice(marker.index + marker[0].length).trim();
  return transcript.split(/\s+/).length >= 150 ? transcript : '';
}

function assertArticleText(text) {
  const accessChallenge =
    /client challenge|please check your connection|disable any ad blockers|try using a different browser|verify (?:that )?you are human|access denied|attention required|captcha/i;
  if (accessChallenge.test(text))
    throw new AppError(
      'source_unavailable',
      '원문 사이트가 기사 본문 대신 접근 확인 페이지를 반환했습니다. 원문을 브라우저에서 확인하고 다른 아티클을 시도해 주세요.',
      502,
    );
}

export async function latestArticle(feed, articleUrl, articleTitle) {
  if (!feed?.verified || !feed?.enabled || !feed.rss_url)
    throw new AppError(
      'feed_unavailable',
      'No verified, enabled feed is configured for this language',
      503,
    );
  let requestedUrl = articleUrl || feed.rss_url;
  let transcriptRequired = false;
  if (articleUrl) {
    const candidate = new URL(articleUrl);
    if (
      /(^|\.)ted\.com$/i.test(candidate.hostname) &&
      candidate.pathname.startsWith('/talks/')
    ) {
      // TED exposes its player transcript view on the talk URL. Never let the
      // normal talk page's promotional description stand in for the transcript.
      candidate.searchParams.set('view', 'transcript');
      requestedUrl = candidate.href;
      transcriptRequired = true;
    }
  }
  const fetched = await safeFetch(requestedUrl, feed.allowed_domains);
  if (articleUrl) {
    const description = transcriptRequired
      ? readableTranscript(fetched.text)
      : readableText(fetched.text);
    assertArticleText(description);
    if (transcriptRequired && !description)
      throw new AppError(
        'transcript_unavailable',
        'Could not read the TED transcript from this link. Open Read Transcript on TED, copy the transcript, and paste it into the article text box.',
        422,
      );
    return {
      title: articleTitle || 'Article',
      url: fetched.url,
      published_at: null,
      description,
      source_type: transcriptRequired ? 'transcript' : 'article',
    };
  }
  const item = parseFeed(fetched.text)[0];
  if (!item) throw new AppError('feed_unavailable', 'RSS feed has no usable articles', 502);
  const url = new URL(item.url, fetched.url);
  if (!isAllowedHost(url.hostname, feed.allowed_domains))
    throw new AppError('feed_unavailable', 'Article URL is outside the allowed domains', 502);
  const articleBody = await safeFetch(url.href, feed.allowed_domains);
  const readable = readableText(articleBody.text);
  if (readable) assertArticleText(readable);
  return { ...item, url: url.href, description: readable || item.description, source_type: 'article' };
}
